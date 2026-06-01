'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingChat from '@/components/onboarding/OnboardingChat';
import { backendClientFetch } from '@/lib/backend-client';
import type { ProjectType } from '@/lib/backend-types';
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
}: {
  projectId: string;
  projectSlug: string;
  projectType: ProjectType;
  initialStage?: SetupStage;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<SetupStage>(initialStage);
  const [resolvedProjectSlug, setResolvedProjectSlug] = useState(projectSlug);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);

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

  if (stage === 'chat') {
    return (
      <div className={styles.intakePage}>
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
            Pick a short name you&apos;ll recognize in the workspace. The foundation is already ready.
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
            {projectType === 'networking' ? 'Your outreach foundation is ready.' : 'Your startup foundation is ready.'}
          </h1>
          <p className={styles.statusText}>
            Opening the startup workspace now so you can review the foundation and keep refining it.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
