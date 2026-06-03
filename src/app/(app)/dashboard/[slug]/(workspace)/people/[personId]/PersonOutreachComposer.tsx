'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { OutreachContent } from '@/lib/db/schema';
import { BACKEND_ERROR_CODES } from '@/lib/error-codes';
import styles from './PersonDetailClient.module.css';

export type OutreachRow = { id: string; content: OutreachContent | null };

type OutreachError = { code: 'foundation_required' | 'generation_failed' | 'generic'; message: string };

type OutreachComposerProps = {
  personId: string;
  slug: string;
  initialOutreach: OutreachRow | null;
  onCopy: (text: string) => Promise<void>;
  copying: boolean;
};

export function OutreachComposer({ personId, slug, initialOutreach, onCopy, copying }: OutreachComposerProps) {
  const [outreach, setOutreach] = useState<OutreachRow | null>(initialOutreach);
  const [text, setText] = useState(initialOutreach?.content?.body ?? '');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<OutreachError | null>(null);
  const [copied, setCopied] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const autoTriggered = useRef(false);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setText('');
    try {
      const res = await fetch(`/api/people/${personId}/outreach`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as OutreachRow;
        setOutreach(data);
        setText(data.content?.body ?? '');
        return;
      }

      const body = await res.json().catch(() => ({})) as { code?: string };
      if (body?.code === BACKEND_ERROR_CODES.foundationRequired) {
        setError({ code: 'foundation_required', message: 'Project foundation is required before generating an outreach message.' });
      } else if (body?.code === BACKEND_ERROR_CODES.generationFailed) {
        setError({ code: 'generation_failed', message: 'The model returned an empty message. Try again.' });
      } else {
        setError({ code: 'generic', message: 'Failed to generate message. Try again.' });
      }
    } catch {
      setError({ code: 'generic', message: 'Failed to generate message. Try again.' });
    } finally {
      setGenerating(false);
    }
  }, [personId]);

  useEffect(() => {
    if (autoTriggered.current) return;
    if (searchParams.get('generate') !== 'outreach') return;
    autoTriggered.current = true;

    const params = new URLSearchParams(searchParams.toString());
    params.delete('generate');
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}#outreach`, { scroll: false });

    void handleGenerate();
  }, [handleGenerate, pathname, router, searchParams]);

  async function handleCopy() {
    if (!text.trim()) return;
    await onCopy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.outreachComposer}>
      <div className={styles.outreachGenRow}>
        {outreach?.content?.subject && (
          <p className={styles.outreachSubject}>
            <span className={styles.outreachSubjectLabel}>Subject:</span> {outreach.content.subject}
          </p>
        )}
        <button
          type="button"
          className={styles.regenerateBtn}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? 'Generating...' : outreach ? 'Regenerate' : 'Generate with AI'}
        </button>
      </div>

      {error && (
        <div className={styles.callBriefLoading}>
          <p>{error.message}</p>
          {error.code === 'foundation_required' ? (
            <Link href={`/dashboard/${slug}/foundation`} className={styles.regenerateBtn}>
              Open project foundation
            </Link>
          ) : (
            <button type="button" className={styles.regenerateBtn} onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating...' : 'Try again'}
            </button>
          )}
        </div>
      )}

      <textarea
        className={styles.outreachTextarea}
        placeholder={generating
          ? 'Generating outreach message...'
          : 'Write or paste your outreach message here, or use Generate with AI above...'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        disabled={generating}
      />
      <button
        type="button"
        className={styles.actionBtn}
        onClick={handleCopy}
        disabled={copying || !text.trim()}
      >
        {copied ? 'Copied!' : copying ? 'Copying...' : 'Copy & mark sent'}
      </button>
    </div>
  );
}
