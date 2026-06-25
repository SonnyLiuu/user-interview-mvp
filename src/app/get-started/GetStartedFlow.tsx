'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import OnboardingChat from '@/components/onboarding/OnboardingChat';
import type { EntryGoal, Foundation } from '@/lib/backend-types';
import {
  ENTRY_GOAL_OPTIONS,
  STARTUP_STAGE_OPTIONS,
} from '@/lib/get-started-content';
import type { GuestOnboardingStatus } from '@/lib/guest-onboarding';
import styles from './get-started.module.css';

type FlowStep = 'stage' | 'goal' | 'explain' | 'intake' | 'preview';

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Something went wrong.');
  return body;
}

export default function GetStartedFlow() {
  const [step, setStep] = useState<FlowStep>('stage');
  const [startupStage, setStartupStage] = useState('');
  const [entryGoal, setEntryGoal] = useState<EntryGoal | ''>('');
  const [foundation, setFoundation] = useState<Foundation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadPreview = useCallback(async () => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/guest-onboarding/preview', { cache: 'no-store' });
      const data = await readJson<{ foundation: Foundation }>(response);
      setFoundation(data.foundation);
      setStep('preview');
      setError('');
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Could not load your foundation.');
    } finally {
      setSubmitting(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/guest-onboarding/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const status = await readJson<GuestOnboardingStatus>(response);
      const savedStage = status.profile.startupStage || '';
      const savedGoal = status.profile.entryGoal || '';
      setStartupStage(savedStage);
      setEntryGoal(savedGoal);

      if (status.hasFoundation || status.sessionStatus === 'completed') {
        await loadPreview();
      } else if (status.sessionStatus === 'active' || status.sessionStatus === 'ready') {
        setStep('intake');
      } else if (savedStage && savedGoal) {
        setStep('explain');
      } else if (savedStage) {
        setStep('goal');
      } else {
        setStep('stage');
      }
    } catch (initError) {
      setError(initError instanceof Error ? initError.message : 'Could not start the intake.');
    } finally {
      setLoading(false);
    }
  }, [loadPreview]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  async function saveProfile() {
    if (!startupStage || !entryGoal || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/guest-onboarding/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startupStage, entryGoal }),
      });
      await readJson(response);
      setStep('explain');
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Could not save your answers.');
    } finally {
      setSubmitting(false);
    }
  }

  async function startOver() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await fetch('/api/guest-onboarding/session', { method: 'DELETE' });
      setStartupStage('');
      setEntryGoal('');
      setFoundation(null);
      setStep('stage');
      await initialize();
    } catch {
      setError('Could not restart the intake. Please refresh and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const stageChoice = STARTUP_STAGE_OPTIONS.find((option) => option.id === startupStage);
  const goalChoice = ENTRY_GOAL_OPTIONS.find((option) => option.id === entryGoal);

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.wordmark}>User Interview</Link>
        <button type="button" className={styles.restart} onClick={() => void startOver()} disabled={submitting}>
          Start over
        </button>
      </nav>

      <div className={styles.progress} aria-label="Onboarding progress">
        <span className={step === 'stage' ? styles.progressActive : styles.progressDone} />
        <span className={step === 'goal' ? styles.progressActive : ['explain', 'intake', 'preview'].includes(step) ? styles.progressDone : ''} />
        <span className={['explain', 'intake'].includes(step) ? styles.progressActive : step === 'preview' ? styles.progressDone : ''} />
        <span className={step === 'preview' ? styles.progressActive : ''} />
      </div>

      {loading ? (
        <section className={styles.card}><p className={styles.status}>Preparing your first question…</p></section>
      ) : step === 'stage' ? (
        <section className={styles.card}>
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
            <button className={styles.primary} type="button" disabled={!startupStage} onClick={() => setStep('goal')}>
              Continue
            </button>
          </div>
        </section>
      ) : step === 'goal' ? (
        <section className={styles.card}>
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
            <button className={styles.secondary} type="button" onClick={() => setStep('stage')}>Back</button>
            <button className={styles.primary} type="button" disabled={!entryGoal || submitting} onClick={() => void saveProfile()}>
              {submitting ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </section>
      ) : step === 'explain' ? (
        <section className={`${styles.card} ${styles.explainCard}`}>
          <p className={styles.eyebrow}>Next: pressure-test the idea</p>
          <h1 className={styles.heading}>Turn what is in your head into a foundation you can test.</h1>
          <p className={styles.lede}>
            We will ask focused questions about the startup, the people it serves, the problem, and the uncertainty that matters most.
          </p>
          <ul className={styles.valueList}>
            <li>Clarify the idea and its value</li>
            <li>Surface assumptions that need evidence</li>
            <li>Identify the best people to learn from</li>
            <li>Build a foundation for research and outreach</li>
          </ul>
          <p className={styles.quiet}>You will preview the result before creating an account.</p>
          <div className={styles.actions}>
            <button className={styles.secondary} type="button" onClick={() => setStep('goal')}>Back</button>
            <button className={styles.primary} type="button" onClick={() => setStep('intake')}>Pressure-test my idea</button>
          </div>
        </section>
      ) : step === 'intake' ? (
        <section className={`${styles.card} ${styles.chatCard}`}>
          <div className={styles.chatHeader}>
            <div>
              <p className={styles.eyebrow}>Startup pressure test</p>
              <h1 className={styles.chatTitle}>Build your startup foundation</h1>
            </div>
          </div>
          <div className={styles.chatArea}>
            <OnboardingChat
              projectId="guest"
              projectType="startup"
              endpointPath="/api/guest-onboarding/chat"
              onComplete={() => void loadPreview()}
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </section>
      ) : (
        <section className={`${styles.card} ${styles.previewCard}`}>
          <p className={styles.eyebrow}>Your startup foundation</p>
          <h1 className={styles.heading}>{foundation?.startupName || 'Your startup'} is ready to pressure-test.</h1>
          <p className={styles.lede}>{foundation?.summary}</p>
          <div className={styles.previewGrid}>
            <article><span>Target user</span><p>{foundation?.targetUser || 'Not specified'}</p></article>
            <article><span>Core problem</span><p>{foundation?.painPoint || 'Not specified'}</p></article>
            <article><span>Value proposition</span><p>{foundation?.valueProp || 'Not specified'}</p></article>
            <article>
              <span>People to learn from</span>
              <ul>{(foundation?.idealPeopleTypes || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article className={styles.previewWide}>
              <span>Assumptions to test</span>
              <ul>{(foundation?.keyAssumptions || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          </div>
          <div className={styles.authGate}>
            <h2>Save this foundation and put it to work</h2>
            <p>Create an account or log in to research the right people, prepare outreach, and keep every conversation connected to what you need to learn.</p>
            <div className={styles.authActions}>
              <Link href="/signup" className={styles.primary}>Create an account</Link>
              <Link href="/login" className={styles.secondary}>Log in</Link>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
