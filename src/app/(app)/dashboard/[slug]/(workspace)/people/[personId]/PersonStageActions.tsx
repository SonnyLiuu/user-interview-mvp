'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Person } from '@/lib/db/schema';
import { CRM_STAGES, type CRMOutcome, type CRMStage } from '@/lib/crm';
import styles from './PersonDetailClient.module.css';

export function StageBreadcrumb({ stage }: { stage: CRMStage }) {
  return (
    <div className={styles.stageBreadcrumb}>
      {CRM_STAGES.map(({ id, label }, i) => {
        const stageIndex = CRM_STAGES.findIndex((s) => s.id === stage);
        const isPast = i < stageIndex;
        const isCurrent = id === stage;
        return (
          <div key={id} className={styles.stageStep}>
            {i > 0 && <span className={`${styles.stepDivider} ${isPast || isCurrent ? styles.stepDividerActive : ''}`} />}
            <span className={`${styles.stepLabel} ${isCurrent ? styles.stepCurrent : ''} ${isPast ? styles.stepPast : ''}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type ActionsProps = {
  person: Person;
  stage: CRMStage;
  onUpdate: (updated: Person) => void;
  compact?: boolean;
};

export function StageActions({ person, stage, onUpdate, compact = false }: ActionsProps) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [showIneffective, setShowIneffective] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [showDownloadHint, setShowDownloadHint] = useState(false);

  async function handleStartCall() {
    setLoading('startCall');
    setShowDownloadHint(false);

    try {
      const rawZoomMeetingIdentifier = window.prompt('Paste the Zoom meeting link or meeting ID for this call.');
      if (rawZoomMeetingIdentifier === null) return;
      const zoomMeetingIdentifier = rawZoomMeetingIdentifier.trim();
      if (!zoomMeetingIdentifier) {
        setShowDownloadHint(true);
        return;
      }

      const res = await fetch('/api/desktop/launch-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: person.id, zoomMeetingIdentifier }),
      });
      if (!res.ok) {
        setShowDownloadHint(true);
        return;
      }

      const payload = await res.json() as { token?: string; zoomMeetingIdentifier?: string | null };
      if (!payload.token) {
        setShowDownloadHint(true);
        return;
      }

      const url = new URL('foundry://call/start');
      url.searchParams.set('personId', person.id);
      url.searchParams.set('token', payload.token);
      if (payload.zoomMeetingIdentifier) {
        url.searchParams.set('zoomMeetingIdentifier', payload.zoomMeetingIdentifier);
      }
      window.location.href = url.toString();
      window.setTimeout(() => setShowDownloadHint(true), 1500);
    } finally {
      setLoading(null);
    }
  }

  async function callApi(path: string, method: string, body?: object) {
    const res = await fetch(`/api/people/${person.id}/${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return await res.json() as Person;
    return null;
  }

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledAt) return;
    setLoading('schedule');
    const updated = await callApi('schedule', 'POST', { scheduledAt });
    setLoading(null);
    if (updated) { onUpdate(updated); setShowSchedule(false); }
  }

  async function handleIneffective(outcome: CRMOutcome) {
    setLoading(outcome);
    const updated = await callApi('ineffective', 'POST', { outcome });
    setLoading(null);
    if (updated) { onUpdate(updated); setShowIneffective(false); }
  }

  if (stage === 'to_contact') {
    if (compact) {
      return (
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.compactPrimaryAction}`}
          onClick={() => document.getElementById('outreach')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          Prepare outreach
        </button>
      );
    }
    return (
      <div className={styles.actionNote}>
        Ready to reach out. Generate a message below and copy it to move this person to <strong>Messaged</strong>.
      </div>
    );
  }

  if (stage === 'sent') {
    return (
      <div className={`${styles.actions} ${compact ? styles.compactActions : ''}`}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => setShowSchedule((v) => !v)}
        >
          Schedule call
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => setShowIneffective((v) => !v)}
        >
          Outreach ineffective
        </button>

        {showSchedule && (
          <form onSubmit={handleSchedule} className={styles.inlineForm}>
            <input
              type="datetime-local"
              className={styles.dateInput}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
            <button type="submit" className={styles.actionBtn} disabled={!!loading}>
              {loading === 'schedule' ? 'Saving…' : 'Confirm'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowSchedule(false)}>
              Cancel
            </button>
          </form>
        )}

        {showIneffective && (
          <div className={styles.outcomeRow}>
            <span className={styles.outcomeLabel}>What happened?</span>
            <button
              type="button"
              className={styles.outcomeBtn}
              disabled={!!loading}
              onClick={() => handleIneffective('no_response')}
            >
              {loading === 'no_response' ? 'Saving…' : 'No response'}
            </button>
            <button
              type="button"
              className={styles.outcomeBtn}
              disabled={!!loading}
              onClick={() => handleIneffective('not_interested')}
            >
              {loading === 'not_interested' ? 'Saving…' : 'Not interested'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowIneffective(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  if (stage === 'scheduled') {
    const scheduledDate = person.call_scheduled_at
      ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(person.call_scheduled_at))
      : null;
    return (
      <div className={`${styles.actions} ${compact ? styles.compactActions : ''}`}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleStartCall}
          disabled={loading === 'startCall'}
        >
          {loading === 'startCall' ? 'Starting...' : 'Start call'}
        </button>
        <div className={styles.actionNote} style={{ flexBasis: '100%' }}>
          {scheduledDate ? <>Call scheduled for <strong>{scheduledDate}</strong>.</> : 'Call scheduled.'}
          {' '}After the call, drag this person to <strong>Completed</strong> on the board.
        </div>
        {showDownloadHint && (
          <div className={styles.actionNote} style={{ flexBasis: '100%' }}>
            Nothing happened? <Link href="/download">Download User Interview Notetaker →</Link>
          </div>
        )}
      </div>
    );
  }

  if (stage === 'completed') {
    return (
      <div className={styles.actionNote}>
        Conversation complete.{' '}
        {person.outcome && <span className={styles.outcomePill}>{person.outcome.replace('_', ' ')}</span>}
        {' '}Add transcripts or notes below.
      </div>
    );
  }

  return null;
}
