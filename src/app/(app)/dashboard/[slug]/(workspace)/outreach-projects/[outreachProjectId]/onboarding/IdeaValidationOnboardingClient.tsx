'use client';

import { useRouter } from 'next/navigation';
import OutreachOfficeHoursChat from '@/components/onboarding/OutreachOfficeHoursChat';
import type { OutreachProjectStatus } from '@/lib/backend-types';
import styles from './idea-validation-onboarding.module.css';

export default function IdeaValidationOnboardingClient({
  outreachProjectId,
  startupPath,
  initialStatus,
}: {
  outreachProjectId: string;
  startupPath: string;
  initialStatus: OutreachProjectStatus;
}) {
  const router = useRouter();
  const peopleHref = `/dashboard/${startupPath}/people?outreachProjectId=${encodeURIComponent(outreachProjectId)}`;

  function completeOnboarding() {
    router.push(peopleHref);
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          className={styles.backArrow}
          onClick={() => router.push(`/dashboard/${startupPath}/foundation`)}
          aria-label="Back to foundation"
        >
          ←
        </button>
        <div className={styles.headerCenter}>
          <p className={styles.eyebrow}>Idea Validation</p>
          <h1 className={styles.title}>Set up the learning brief.</h1>
        </div>
      </header>
      <section className={styles.chatShell} aria-label="Idea Validation onboarding">
        {initialStatus === 'active' ? (
          <div className={styles.donePanel}>
            <p className={styles.doneEyebrow}>Brief already generated</p>
            <h2 className={styles.doneTitle}>This outreach project is ready.</h2>
            <p className={styles.doneText}>
              The learning plan is ready for this startup.
            </p>
            <button className={styles.primaryLink} type="button" onClick={() => router.push(peopleHref)}>
              Open people
            </button>
          </div>
        ) : (
          <OutreachOfficeHoursChat
            outreachProjectId={outreachProjectId}
            onComplete={completeOnboarding}
          />
        )}
      </section>
    </div>
  );
}
