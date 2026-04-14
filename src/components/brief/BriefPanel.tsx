'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ProjectBrief } from '@/lib/db/schema';
import BriefView from './BriefView';
import styles from './BriefPanel.module.css';

type Props = {
  projectId: string;
  initialBrief: ProjectBrief | null;
  intakeStatus: string;
};

export default function BriefPanel({ projectId, initialBrief, intakeStatus }: Props) {
  const [brief, setBrief] = useState<ProjectBrief | null>(initialBrief);
  const [status, setStatus] = useState(intakeStatus);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBrief = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/brief`);
    if (res.ok) {
      const data = await res.json() as ProjectBrief | null;
      setBrief(data);
    }
  }, [projectId]);

  // Poll while brief is generating
  useEffect(() => {
    if (status !== 'generating' || brief) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/projects/${projectId}/brief`);
      if (res.ok) {
        const data = await res.json() as ProjectBrief | null;
        if (data) {
          setBrief(data);
          setStatus('complete');
          clearInterval(interval);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [status, brief, projectId]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetch(`/api/projects/${projectId}/brief/refresh`, { method: 'POST' });
    setBrief(null);
    setStatus('generating');
    setRefreshing(false);
  }

  // Called from ProjectChat when intake completes
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if ((e as CustomEvent<{ projectId: string }>).detail.projectId === projectId) {
        setStatus('generating');
        setBrief(null);
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
          <span className={styles.generatingHint}>Usually takes 10–20 seconds.</span>
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
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
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
