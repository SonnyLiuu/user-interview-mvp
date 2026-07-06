'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingChat from '@/components/onboarding/OnboardingChat';
import { backendClientFetch } from '@/lib/backend-client';
import type { ProjectNavItem, ProjectType } from '@/lib/backend-types';
import { getProjectPathSegment } from '@/lib/projects';
import styles from './setup-page.module.css';

type SetupStage = 'chat' | 'name' | 'done';

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        id: index,
        left: `${6 + index * 6}%`,
        delay: `${(index % 5) * 0.12}s`,
        duration: `${2.6 + (index % 4) * 0.25}s`,
      })),
    [],
  );

  return (
    <div className={styles.confetti} aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className={styles.confettiPiece}
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
          }}
        />
      ))}
    </div>
  );
}

export default function SetupPageClient({
  projectId,
  projectSlug,
  projectType,
  initialStage = 'chat',
  hasFoundation = false,
  isDraft = false,
}: {
  projectId: string;
  projectSlug: string;
  projectType: ProjectType;
  initialStage?: SetupStage;
  hasFoundation?: boolean;
  isDraft?: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<SetupStage>(initialStage);
  const [resolvedProjectSlug, setResolvedProjectSlug] = useState(projectSlug);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    if (stage !== 'done') return;
    const timeout = window.setTimeout(() => {
      router.push(`/dashboard/${resolvedProjectSlug}/foundation`);
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [resolvedProjectSlug, router, stage]);

  async function saveProjectName(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || savingName) return;

    setSavingName(true);
    setNameError('');

    try {
      const res = await backendClientFetch(`/v1/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setNameError(body?.error ?? 'Could not save the project name. Try again.');
        return;
      }

      const project = await res.json() as { id: string; slug: string | null };
      setResolvedProjectSlug(project.slug ?? project.id);
      setStage('done');
    } catch {
      setNameError('Could not save the project name. Try again.');
    } finally {
      setSavingName(false);
    }
  }

  async function completeOnboarding() {
    try {
      const res = await backendClientFetch(`/v1/projects/${projectId}`);
      if (!res.ok) {
        setStage('name');
        return;
      }
      const project = await res.json() as { id: string; slug: string | null };
      if (!project.slug) {
        setStage('name');
        return;
      }
      setResolvedProjectSlug(project.slug);
      setStage('done');
    } catch {
      setStage('name');
    }
  }

  async function leaveOnboarding() {
    if (cancelling) return;

    setCancelling(true);
    setCancelError('');

    try {
      if (isDraft) {
        const deleteResponse = await backendClientFetch(`/v1/projects/${projectId}`, { method: 'DELETE' });
        if (!deleteResponse.ok) throw new Error('Could not delete draft project');
      }

      const projectsResponse = await backendClientFetch('/v1/projects');
      if (!projectsResponse.ok) throw new Error('Could not load projects');
      const projects = await projectsResponse.json() as ProjectNavItem[];
      const nextProject = projects.find((project) => project.id !== projectId && project.slug !== null) ?? null;
      router.replace(nextProject ? `/dashboard/${getProjectPathSegment(nextProject)}/foundation` : '/');
      router.refresh();
    } catch {
      setCancelError('Could not leave setup. Please try again.');
      setCancelling(false);
    }
  }

  if (stage === 'chat') {
    return (
      <div className={styles.intakePage}>
        <header className={styles.intakeHeader}>
          <button
            type="button"
            className={styles.backArrow}
            onClick={() => void leaveOnboarding()}
            aria-label="Cancel setup"
            disabled={cancelling}
          >
            ←
          </button>
          {cancelError && <p className={styles.cancelError}>{cancelError}</p>}
        </header>
        <div className={styles.intakeChatArea}>
          <OnboardingChat
            projectId={projectId}
            projectType={projectType}
            onComplete={() => void completeOnboarding()}
          />
        </div>
      </div>
    );
  }

  if (stage === 'name') {
    return (
      <div className={styles.page}>
        <div className={styles.statusCard}>
          <span className={styles.eyebrow}>Last step</span>
          <h1 className={styles.statusTitle}>Name this startup.</h1>
          <p className={styles.statusText}>
            {hasFoundation
              ? 'Pick a short name you\'ll recognize in the workspace. The foundation is already ready.'
              : 'Pick a short name you\'ll recognize in the workspace, then start researching people.'}
          </p>
          <form className={styles.nameForm} onSubmit={saveProjectName}>
            <input
              className={styles.nameInput}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError('');
              }}
              placeholder="e.g. Acme AI"
              maxLength={120}
              autoFocus
            />
            {nameError && <p className={styles.nameError}>{nameError}</p>}
            <button className={styles.primaryAction} type="submit" disabled={!name.trim() || savingName}>
              {savingName ? 'Saving...' : 'Open workspace'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className={styles.page}>
        <div className={`${styles.statusCard} ${styles.doneCard}`}>
          <Confetti />
          <span className={styles.eyebrow}>Setup Complete</span>
          <h1 className={styles.statusTitle}>
            {hasFoundation
              ? projectType === 'networking'
                ? 'Your outreach foundation is ready.'
                : 'Your startup foundation is ready.'
              : 'Your startup workspace is ready.'}
          </h1>
          <p className={styles.statusText}>
            Opening your Foundation now.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
