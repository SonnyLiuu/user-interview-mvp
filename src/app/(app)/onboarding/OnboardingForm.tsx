'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { backendClientFetch } from '@/lib/backend-client';
import styles from './onboarding.module.css';

export default function OnboardingForm({ onboardingChatEnabled }: { onboardingChatEnabled: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError('');

    try {
      const res = await backendClientFetch('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_type: 'startup', draft: true }),
      });
      if (!res.ok) throw new Error('Failed to create project');
      const project = await res.json() as { id: string; slug: string | null };
      router.push(`/onboarding/${project.slug ?? project.id}`);
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && <p className={styles.error}>{error}</p>}
      <button
        type="submit"
        className={styles.button}
        disabled={loading}
      >
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
  );
}
