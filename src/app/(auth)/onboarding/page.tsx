'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './onboarding.module.css';

export default function OnboardingPage() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.status === 409) {
        const { error: msg } = await res.json() as { error: string };
        setError(msg);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error('Failed to create project');
      const project = await res.json() as { id: string; slug: string };
      router.push(`/dashboard/${project.slug}/people`);
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>New project</p>
        <h1 className={styles.heading}>What are you working on?</h1>
        <p className={styles.sub}>Give your startup idea a name. You can always change it later.</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.input}
            type="text"
            placeholder="e.g. Smart Toaster"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={120}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button
            type="submit"
            className={styles.button}
            disabled={!name.trim() || loading}
          >
            {loading ? 'Creating…' : 'Start project'}
          </button>
        </form>
      </div>
    </div>
  );
}
