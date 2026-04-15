'use client';

import { useState, useEffect, useCallback } from 'react';
import { backendClientFetch } from '@/lib/backend-client';
import type { ProjectBrief } from '@/lib/backend-types';
import BriefView from './BriefView';
import styles from './BriefPanel.module.css';

type BriefStatus = 'not_started' | 'generating' | 'complete' | 'generation_failed';

type BriefPayload = {
  brief: ProjectBrief | null;
  status: BriefStatus | string;
};

type Props = {
  projectId: string;
  initialBrief: ProjectBrief | null;
  intakeStatus: string;
};

export default function BriefPanel({ projectId, initialBrief, intakeStatus }: Props) {
  const [brief, setBrief] = useState<ProjectBrief | null>(initialBrief);
  const [status, setStatus] = useState(intakeStatus);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBriefState = useCallback(async () => {
    const res = await backendClientFetch(`/v1/projects/${projectId}/brief`);
    if (!res.ok) return null;
    return await res.json() as BriefPayload;
  }, [projectId]);

  // Poll while brief is generating
  useEffect(() => {
    if (status !== 'generating') return;
    const interval = setInterval(async () => {
      const data = await fetchBriefState();
      if (!data) return;

      if (data.brief) {
        setBrief(data.brief);
      }

      setStatus(data.status);

      if (data.status === 'complete' || data.status === 'generation_failed') {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [status, fetchBriefState]);

  async function handleRefresh() {
    setRefreshing(true);
    const res = await backendClientFetch(`/v1/projects/${projectId}/brief/refresh`, { method: 'POST' });
    if (res.ok) {
      setStatus('generating');
    }
    setRefreshing(false);
  }

  // Called from ProjectChat when intake completes
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if ((e as CustomEvent<{ projectId: string }>).detail.projectId === projectId) {
        setStatus('generating');
      }
    };
    window.addEventListener('intake-complete', handler as EventListener);
    return () => window.removeEventListener('intake-complete', handler as EventListener);
  }, [projectId]);

  if (status === 'generating' && !brief) {
    return (
      <div className={styles.panel}>
        <div className={styles.generating}>
          <span className={styles.generatingLabel}>Generating brief</span>
          <span className={styles.generatingHint}>Usually takes 10-20 seconds.</span>
        </div>
      </div>
    );
  }

  if (status === 'generation_failed') {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <p className={styles.emptyText}>Brief generation failed.</p>
          <p className={styles.emptyHint}>You can retry without losing the current project context.</p>
          <button className={styles.refreshBtn} onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            Start the conversation to generate your project brief.
          </p>
          <p className={styles.emptyHint}>
            The brief will appear here after you work through the intake questions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.briefHeader}>
        <span className={styles.briefLabel}>Project Brief</span>
        <button className={styles.refreshBtn} onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {status === 'generating' && (
        <div className={styles.generating}>
          <span className={styles.generatingLabel}>Refreshing brief</span>
          <span className={styles.generatingHint}>Keeping the current brief visible until the new one is ready.</span>
        </div>
      )}
      <div className={styles.briefContent}>
        <BriefView brief={brief} />
      </div>
    </div>
  );
}

// Export a function the chat component can call to signal intake completion
export function dispatchIntakeComplete(projectId: string) {
  window.dispatchEvent(new CustomEvent('intake-complete', { detail: { projectId } }));
}
