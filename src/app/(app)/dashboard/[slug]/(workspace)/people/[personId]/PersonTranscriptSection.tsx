'use client';

import { useState } from 'react';
import type { Transcript } from '@/lib/db/schema';
import type { CRMStage } from '@/lib/crm';
import styles from './PersonDetailClient.module.css';

type TranscriptSectionProps = {
  personId: string;
  stage: CRMStage;
  initialTranscripts: Transcript[];
};

export function TranscriptSection({ personId, stage, initialTranscripts }: TranscriptSectionProps) {
  const [transcripts, setTranscripts] = useState<Transcript[]>(initialTranscripts);
  const [content, setContent] = useState('');
  const [type, setType] = useState<'call' | 'message'>('call');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/people/${personId}/transcripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type }),
    });
    setSaving(false);
    if (res.ok) {
      const created = await res.json() as Transcript;
      setTranscripts((prev) => [created, ...prev]);
      setContent('');
    }
  }

  return (
    <>
      {stage === 'completed' && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Add transcript or notes</h2>
          <form onSubmit={handleSubmit} className={styles.transcriptForm}>
            <div className={styles.typeRow}>
              <label className={styles.typeOption}>
                <input
                  type="radio"
                  name="transcript-type"
                  value="call"
                  checked={type === 'call'}
                  onChange={() => setType('call')}
                  className={styles.radioInput}
                />
                Call transcript
              </label>
              <label className={styles.typeOption}>
                <input
                  type="radio"
                  name="transcript-type"
                  value="message"
                  checked={type === 'message'}
                  onChange={() => setType('message')}
                  className={styles.radioInput}
                />
                Message thread
              </label>
            </div>
            <textarea
              className={styles.transcriptInput}
              placeholder="Paste transcript or notes here…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
            />
            <button type="submit" className={styles.actionBtn} disabled={saving || !content.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </section>
      )}

      {transcripts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Transcript history ({transcripts.length})</h2>
          <div className={styles.transcriptList}>
            {transcripts.map((t) => (
              <div key={t.id} className={styles.transcriptEntry}>
                <div className={styles.transcriptMeta}>
                  <span className={styles.transcriptType}>{t.type === 'call' ? 'Call' : 'Message'}</span>
                  <span className={styles.transcriptDate}>
                    {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(t.created_at!))}
                  </span>
                </div>
                <p className={styles.transcriptContent}>{t.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
