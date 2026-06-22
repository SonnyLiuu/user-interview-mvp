'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { backendClientFetch } from '@/lib/backend-client';
import type { OutreachProjectRecord, OutreachProjectType } from '@/lib/backend-types';
import {
  OUTREACH_PROJECT_TYPE_CONFIGS,
  VISIBLE_OUTREACH_PROJECT_TYPES,
} from '@/lib/outreach-projects';
import styles from './OutreachProjectsPage.module.css';

type Props = {
  startupProjectId: string;
  startupPath: string;
  initialOutreachProjects: OutreachProjectRecord[];
};

function Icon({ iconKey }: { iconKey: string }) {
  if (iconKey === 'search') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.7" />
        <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (iconKey === 'target') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (iconKey === 'users' || iconKey === 'user-plus') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M17 8v5M14.5 10.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (iconKey === 'briefcase') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="8" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (iconKey === 'handshake') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9.8 8.2H7.6a3.8 3.8 0 1 0 0 7.6h2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14.2 8.2h2.2a3.8 3.8 0 1 1 0 7.6h-2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.8 12h6.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (iconKey === 'megaphone') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 13h3l9 4V7l-9 4H5v2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M8 13l1 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8L12 4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function statusLabel(project: OutreachProjectRecord | null) {
  if (!project) return null;
  if (project.status === 'onboarding') return 'In progress';
  return project.status[0].toUpperCase() + project.status.slice(1);
}

export default function OutreachProjectsClient({
  startupProjectId,
  startupPath,
  initialOutreachProjects,
}: Props) {
  const router = useRouter();
  const [outreachProjects, setOutreachProjects] = useState(initialOutreachProjects);
  const [pendingType, setPendingType] = useState<OutreachProjectType | null>(null);
  const [error, setError] = useState('');

  const projectsByType = useMemo(() => {
    const map = new Map<OutreachProjectType, OutreachProjectRecord>();
    for (const project of outreachProjects) {
      if (project.status !== 'archived') map.set(project.type, project);
    }
    return map;
  }, [outreachProjects]);

  async function startProject(type: OutreachProjectType) {
    const config = OUTREACH_PROJECT_TYPE_CONFIGS[type];
    if (config.availability !== 'active' || pendingType) return;

    setPendingType(type);
    setError('');

    try {
      const res = await backendClientFetch(`/v1/projects/${startupProjectId}/outreach-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, skip_onboarding: true }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? 'Could not start this outreach project.');
        setPendingType(null);
        return;
      }

      const project = await res.json() as OutreachProjectRecord;
      setOutreachProjects((current) => {
        const exists = current.some((item) => item.id === project.id);
        return exists
          ? current.map((item) => (item.id === project.id ? project : item))
          : [project, ...current];
      });
      router.push(`/dashboard/${startupPath}/people?outreachProjectId=${encodeURIComponent(project.id)}`);
    } catch {
      setError('Could not start this outreach project.');
      setPendingType(null);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.header}>
          <p className={styles.eyebrow}>New outreach project</p>
          <h1 className={styles.title}>Choose what kind of outreach to run.</h1>
          <p className={styles.description}>
            Pick a research focus and start finding people to contact.
          </p>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.typeGrid} aria-label="Outreach project types">
          {VISIBLE_OUTREACH_PROJECT_TYPES.map((type) => {
            const config = OUTREACH_PROJECT_TYPE_CONFIGS[type];
            const existingProject = projectsByType.get(type) ?? null;
            const disabled = config.availability !== 'active';
            const loading = pendingType === type;

            return (
              <article
                key={type}
                className={[
                  styles.typeCard,
                  disabled && styles.typeCardDisabled,
                ].filter(Boolean).join(' ')}
              >
                <div className={styles.typeTopRow}>
                  <span className={styles.typeIcon}>
                    <Icon iconKey={config.iconKey} />
                  </span>
                  {existingProject && <span className={styles.activeBadge}>{statusLabel(existingProject)}</span>}
                </div>
                <h2 className={styles.typeTitle}>{config.label}</h2>
                <p className={styles.typeDescription}>{config.description}</p>
                <p className={styles.typePurpose}>{config.purpose}</p>
                <button
                  type="button"
                  className={styles.typeAction}
                  disabled={disabled || pendingType !== null}
                  onClick={() => void startProject(type)}
                >
                  {loading && <span className={styles.actionSpinner} aria-hidden="true" />}
                  <span>
                    {disabled
                      ? 'Coming soon'
                      : loading
                        ? existingProject ? 'Opening research...' : 'Creating project...'
                        : existingProject ? 'Open research' : 'Create project'}
                  </span>
                </button>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
