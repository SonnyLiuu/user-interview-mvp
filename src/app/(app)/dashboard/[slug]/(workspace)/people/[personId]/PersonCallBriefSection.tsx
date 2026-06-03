'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CallPrepContent } from '@/lib/db/schema';
import type { CRMStage } from '@/lib/crm';
import { BACKEND_ERROR_CODES } from '@/lib/error-codes';
import styles from './PersonDetailClient.module.css';

type CallPrepRow = { id: string; content: CallPrepContent | null };
type BriefError = { code: 'foundation_required' | 'generic'; message: string };

export function CallBriefSection({ personId, slug, stage, initialPrep }: {
  personId: string;
  slug: string;
  stage: CRMStage;
  initialPrep: CallPrepRow | null;
}) {
  const [prep, setPrep] = useState<CallPrepRow | null>(initialPrep);
  const [loading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<BriefError | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${personId}/call-brief`, { method: 'POST' });
      if (res.ok) {
        setPrep(await res.json() as CallPrepRow);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (body?.code === BACKEND_ERROR_CODES.foundationRequired) {
        setError({
          code: 'foundation_required',
          message: 'Project foundation is required before generating a call brief.',
        });
      } else {
        setError({
          code: 'generic',
          message: 'Failed to generate brief. Try again.',
        });
      }
    } catch {
      setError({ code: 'generic', message: 'Failed to generate brief. Try again.' });
    } finally {
      setGenerating(false);
    }
  }

  const c = prep?.content;
  const hasContent = !!c && (
    !!c.objective || !!c.closing ||
    !!c.goals?.length || !!c.questions?.length || !!c.signals?.length
  );

  // Hide section entirely when there's nothing to show and no entry point.
  if (!loading && !prep && !error && stage !== 'scheduled') return null;

  return (
    <section id="call-brief" className={styles.section}>
      <div className={styles.callBriefHeader}>
        <h2 className={styles.sectionTitle}>Call brief</h2>
        {prep && (
          <button
            type="button"
            className={styles.regenerateBtn}
            onClick={handleGenerate}
            disabled={loading || generating}
          >
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
        )}
      </div>

      {loading && <p className={styles.callBriefLoading}>Loading…</p>}

      {!loading && error && (
        <div className={styles.callBriefLoading}>
          <p>{error.message}</p>
          {error.code === 'foundation_required' ? (
            <p>
              <Link href={`/dashboard/${slug}/foundation`} className={styles.regenerateBtn}>
                Open project foundation
              </Link>
            </p>
          ) : (
            <button
              type="button"
              className={styles.regenerateBtn}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? 'Generating…' : 'Try again'}
            </button>
          )}
        </div>
      )}

      {!loading && !error && !prep && stage === 'scheduled' && (
        <div className={styles.callBriefLoading}>
          <p>No call brief yet.</p>
          <button
            type="button"
            className={styles.regenerateBtn}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Generate call brief'}
          </button>
        </div>
      )}

      {!loading && !error && prep && !hasContent && (
        <p className={styles.callBriefLoading}>Brief is empty. Click Regenerate to try again.</p>
      )}

      {!loading && !error && c && hasContent && (
        <div className={styles.callBrief}>
          {c.objective && (
            <p className={styles.callBriefObjective}>{c.objective}</p>
          )}

          {c.goals?.length ? (
            <div className={styles.callBriefBlock}>
              <h3 className={styles.callBriefBlockTitle}>Goals</h3>
              <ul className={styles.callBriefList}>
                {c.goals.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          ) : null}

          {c.questions?.length ? (
            <div className={styles.callBriefBlock}>
              <h3 className={styles.callBriefBlockTitle}>Questions</h3>
              <ol className={styles.questionList}>
                {c.questions.map((q, i) => <li key={i} className={styles.question}>{q}</li>)}
              </ol>
            </div>
          ) : null}

          {c.signals?.length ? (
            <div className={styles.callBriefBlock}>
              <h3 className={styles.callBriefBlockTitle}>Signals to listen for</h3>
              <ul className={styles.callBriefList}>
                {c.signals.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ) : null}

          {c.closing && (
            <div className={styles.callBriefBlock}>
              <h3 className={styles.callBriefBlockTitle}>How to close</h3>
              <p className={styles.prose}>{c.closing}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
