'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { backendClientFetch } from '@/lib/backend-client';
import type { EntryGoal } from '@/lib/backend-types';
import {
  ENTRY_GOAL_OPTIONS,
  STARTUP_STAGE_OPTIONS,
} from '@/lib/get-started-content';
import styles from './onboarding.module.css';

type CreatedProject = { id: string; slug: string | null };

export default function OnboardingForm({
  onboardingChatEnabled,
  showIntroQuestions,
}: {
  onboardingChatEnabled: boolean;
  showIntroQuestions: boolean;
}) {
  const [step, setStep] = useState<'stage' | 'goal'>('stage');
  const [startupStage, setStartupStage] = useState('');
  const [entryGoal, setEntryGoal] = useState<EntryGoal | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const projectRef = useRef<CreatedProject | null>(null);
  const router = useRouter();

  async function createProject(): Promise<CreatedProject> {
    if (projectRef.current) return projectRef.current;
    const res = await backendClientFetch('/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_type: 'startup', draft: true }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    const project = await res.json() as CreatedProject;
    projectRef.current = project;
    return project;
  }

  async function handleCreateOnly(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const project = await createProject();
      router.push(`/onboarding/${project.slug ?? project.id}`);
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  async function startChat() {
    if (!startupStage || !entryGoal || loading) return;
    setLoading(true);
    setError('');
    try {
      const project = await createProject();
      const res = await backendClientFetch(`/v1/projects/${project.id}/onboarding/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startupStage, entryGoal }),
      });
      if (!res.ok) throw new Error('Failed to save answers');
      router.push(`/onboarding/${project.slug ?? project.id}`);
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  if (!onboardingChatEnabled || !showIntroQuestions) {
    return (
      <div className={styles.card}>
        <p className={styles.eyebrow}>{onboardingChatEnabled ? 'Startup onboarding' : 'New project'}</p>
        <h1 className={styles.heading}>
          {onboardingChatEnabled ? 'Let\'s understand the startup first.' : 'Create a startup project.'}
        </h1>
        <p className={styles.sub}>
          {onboardingChatEnabled
            ? 'Answer a few focused questions so we can shape your startup foundation and recommend the right first outreach project.'
            : 'Create the workspace now and start researching people right away.'}
        </p>
        <form onSubmit={handleCreateOnly} className={styles.form}>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.button} disabled={loading}>
            {loading && <span className={styles.buttonSpinner} aria-hidden="true" />}
            <span>{loading ? 'Creating your project...' : onboardingChatEnabled ? 'Start onboarding' : 'Create project'}</span>
          </button>
          {loading && (
            <p className={styles.loadingHint} role="status" aria-live="polite">
              {onboardingChatEnabled
                ? 'Setting up your workspace and opening the first conversation.'
                : 'Setting up your workspace.'}
            </p>
          )}
        </form>
      </div>
    );
  }

  const stageChoice = STARTUP_STAGE_OPTIONS.find((option) => option.id === startupStage);
  const goalChoice = ENTRY_GOAL_OPTIONS.find((option) => option.id === entryGoal);

  if (step === 'stage') {
    return (
      <div className={`${styles.card} ${styles.wideCard}`}>
        <p className={styles.eyebrow}>First, a little context</p>
        <h1 className={styles.heading}>Where are you in your startup journey?</h1>
        <div className={styles.choices}>
          {STARTUP_STAGE_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`${styles.choice} ${startupStage === option.id ? styles.choiceSelected : ''}`}
              onClick={() => setStartupStage(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {stageChoice && (
          <div className={styles.blurb}>
            <h2>{stageChoice.blurbTitle}</h2>
            <p>{stageChoice.blurbBody}</p>
          </div>
        )}
        <div className={styles.actions}>
          <button className={styles.button} type="button" disabled={!startupStage} onClick={() => setStep('goal')}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${styles.wideCard}`}>
      <p className={styles.eyebrow}>Make this useful for you</p>
      <h1 className={styles.heading}>What brought you here today?</h1>
      <div className={styles.choices}>
        {ENTRY_GOAL_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`${styles.choice} ${entryGoal === option.id ? styles.choiceSelected : ''}`}
            onClick={() => setEntryGoal(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {goalChoice && (
        <div className={styles.blurb}>
          <h2>{goalChoice.blurbTitle}</h2>
          <p>{goalChoice.blurbBody}</p>
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button className={styles.secondary} type="button" disabled={loading} onClick={() => setStep('stage')}>
          Back
        </button>
        <button className={styles.button} type="button" disabled={!entryGoal || loading} onClick={() => void startChat()}>
          {loading && <span className={styles.buttonSpinner} aria-hidden="true" />}
          <span>{loading ? 'Starting...' : 'Continue'}</span>
        </button>
      </div>
      {loading && (
        <p className={styles.loadingHint} role="status" aria-live="polite">
          Setting up your workspace and opening the first conversation.
        </p>
      )}
    </div>
  );
}
