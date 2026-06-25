'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../get-started.module.css';

export default function ClaimGuestProject() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const response = await fetch('/api/guest-onboarding/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const body = await response.json().catch(() => ({})) as { destination?: string; error?: string };
        if (!response.ok || !body.destination) {
          throw new Error(body.error || 'Could not save your startup foundation.');
        }
        router.replace(body.destination);
      } catch (claimError) {
        setError(claimError instanceof Error ? claimError.message : 'Could not save your startup foundation.');
      }
    })();
  }, [router]);

  return (
    <main className={styles.page}>
      <nav className={styles.nav}><Link href="/" className={styles.wordmark}>User Interview</Link></nav>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Saving your work</p>
        <h1 className={styles.heading}>{error ? 'We could not claim this foundation.' : 'Opening your startup workspace…'}</h1>
        <p className={error ? styles.error : styles.lede}>
          {error || 'Your foundation and outreach plan are being attached to your account.'}
        </p>
        {error && (
          <div className={styles.actions}>
            <Link className={styles.secondary} href="/dashboard">Go to dashboard</Link>
            <Link className={styles.primary} href="/get-started">Start again</Link>
          </div>
        )}
      </section>
    </main>
  );
}
