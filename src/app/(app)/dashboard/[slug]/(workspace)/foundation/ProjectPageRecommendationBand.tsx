'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { backendClientFetch } from '@/lib/backend-client';
import type { OutreachProjectRecord, OutreachProjectType } from '@/lib/backend-types';
import styles from './project-page.module.css';

export type RecommendationBandAlert = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  actionTargetId?: string;
  actionEventName?: string;
  outreachAction?: {
    startupProjectId: string;
    startupPath: string;
    type: OutreachProjectType;
    projectId?: string;
  };
};

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="15" height="15">
      <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="15" height="15">
      <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ProjectPageRecommendationBand({
  alerts,
  storageScope,
}: {
  alerts: RecommendationBandAlert[];
  storageScope: string;
}) {
  const router = useRouter();
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const dismissedStorageKey = (alertId: string) => `recommendation-alert-dismissed:${storageScope}:${alertId}`;
  const visibleAlerts = useMemo(
    () => alerts.filter((alert) => alert.title && alert.body && !dismissedAlertIds.has(alert.id)),
    [alerts, dismissedAlertIds],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const alertCount = visibleAlerts.length;

  useEffect(() => {
    setDismissedAlertIds(new Set(
      alerts
        .filter((alert) => window.localStorage.getItem(dismissedStorageKey(alert.id)) === 'true')
        .map((alert) => alert.id),
    ));
  }, [alerts, storageScope]);

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(current, alertCount - 1)));
  }, [alertCount]);

  useEffect(() => {
    function handleDismiss(event: Event) {
      const detail = (event as CustomEvent<{ alertId?: string; storageScope?: string }>).detail;
      const alertId = detail?.alertId;
      if (detail?.storageScope && detail.storageScope !== storageScope) return;
      if (!alertId) return;
      window.localStorage.setItem(dismissedStorageKey(alertId), 'true');
      setDismissedAlertIds((current) => new Set(current).add(alertId));
      setActiveIndex((current) => Math.max(0, Math.min(current, alertCount - 2)));
    }

    window.addEventListener('recommendation-alert:dismiss', handleDismiss);
    return () => window.removeEventListener('recommendation-alert:dismiss', handleDismiss);
  }, [alertCount, storageScope]);

  if (alertCount === 0) return null;

  const activeAlert = visibleAlerts[Math.min(activeIndex, alertCount - 1)];
  const hasMultipleAlerts = alertCount > 1;

  function goPrevious() {
    setActiveIndex((current) => (current - 1 + alertCount) % alertCount);
  }

  function goNext() {
    setActiveIndex((current) => (current + 1) % alertCount);
  }

  function focusActionTarget(targetId: string) {
    const target = document.getElementById(targetId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) {
      target.focus();
      return;
    }
    const focusable = target?.querySelector<HTMLElement>('textarea, button, a, input, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }

  async function runAlertAction(alert: RecommendationBandAlert) {
    if (alert.actionHref) {
      router.push(alert.actionHref);
      return;
    }

    if (alert.outreachAction) {
      const { startupProjectId, startupPath, type, projectId } = alert.outreachAction;
      if (projectId) {
        router.push(`/dashboard/${startupPath}/outreach-projects/${projectId}/onboarding`);
        return;
      }

      setLoadingActionId(alert.id);
      try {
        const res = await backendClientFetch(`/v1/projects/${startupProjectId}/outreach-projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });
        if (!res.ok) return;
        const project = await res.json() as OutreachProjectRecord;
        router.push(`/dashboard/${startupPath}/outreach-projects/${project.id}/onboarding`);
      } finally {
        setLoadingActionId(null);
      }
      return;
    }

    if (alert.actionEventName) {
      window.dispatchEvent(new CustomEvent(alert.actionEventName));
    }

    if (alert.actionTargetId) focusActionTarget(alert.actionTargetId);
  }

  return (
    <section className={styles.recommendationBand} aria-labelledby="startup-recommendation-title">
      <div className={styles.recommendationTopRow}>
        <div className={styles.recommendationHeading}>
          <span className={styles.recommendationEyebrow}>{activeAlert.eyebrow}</span>
          <h2 id="startup-recommendation-title" className={styles.recommendationTitle}>
            {activeAlert.title}
          </h2>
        </div>

        {hasMultipleAlerts && (
          <div className={styles.recommendationControls} aria-label="Recommendation alerts">
            <span className={styles.recommendationCounter}>
              {activeIndex + 1} / {alertCount}
            </span>
            <button
              type="button"
              className={styles.recommendationArrow}
              onClick={goPrevious}
              aria-label="Previous alert"
            >
              <ArrowLeftIcon />
            </button>
            <button
              type="button"
              className={styles.recommendationArrow}
              onClick={goNext}
              aria-label="Next alert"
            >
              <ArrowRightIcon />
            </button>
          </div>
        )}
      </div>

      <div className={styles.recommendationViewport} aria-live="polite">
        <div
          className={styles.recommendationTrack}
          style={{ transform: `translateX(-${Math.min(activeIndex, alertCount - 1) * 100}%)` }}
        >
          {visibleAlerts.map((alert, index) => (
            <article
              key={alert.id}
              className={styles.recommendationSlide}
              aria-hidden={index !== activeIndex}
            >
              <p className={styles.recommendationReason}>{alert.body}</p>
              {alert.actionLabel && (alert.actionHref || alert.actionTargetId || alert.outreachAction) && (
                <button
                  type="button"
                  className={styles.recommendationAction}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => runAlertAction(alert)}
                  disabled={loadingActionId === alert.id}
                >
                  {loadingActionId === alert.id ? 'Starting...' : alert.actionLabel}
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
