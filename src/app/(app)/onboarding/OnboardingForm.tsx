'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { backendClientFetch } from '@/lib/backend-client';
import styles from './onboarding.module.css';

function normalizeProjectName(value: string) {
  return value.trim().toLocaleLowerCase();
}

export default function OnboardingForm({
  existingProjectNames,
}: {
  existingProjectNames: string[];
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const existingNames = useMemo(
    () => new Set(existingProjectNames.map(normalizeProjectName)),
    [existingProjectNames],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (existingNames.has(normalizeProjectName(trimmedName))) {
      setError('You already have a project with this name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await backendClientFetch('/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (res.status === 409) {
        const { error: msg } = await res.json() as { error: string };
        setError(msg);
        setLoading(false);
        return;
      }
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
      <input
        className={styles.input}
        type="text"
        placeholder="e.g. Smart Toaster"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError('');
        }}
        autoFocus
        maxLength={120}
      />
      {error && <p className={styles.error}>{error}</p>}
      <button
        type="submit"
        className={styles.button}
        disabled={!name.trim() || loading}
      >
        {loading ? 'Creating...' : 'Start project'}
      </button>
    </form>
  );
}
