'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingChat from '@/components/onboarding/OnboardingChat';
import type { ProjectType } from '@/lib/backend-types';
import styles from './setup-page.module.css';

type SetupStage = 'chat' | 'done';

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
}: {
  projectId: string;
  projectSlug: string;
  projectType: ProjectType;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<SetupStage>('chat');

  useEffect(() => {
    if (stage !== 'done') return;
    const timeout = window.setTimeout(() => {
      router.push(`/dashboard/${projectSlug}/foundation`);
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [projectSlug, router, stage]);

  if (stage === 'chat') {
    return (
      <div className={styles.intakePage}>
        <div className={styles.intakeChatArea}>
          <OnboardingChat
            projectId={projectId}
            projectType={projectType}
            onComplete={() => setStage('done')}
          />
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
            {projectType === 'networking' ? 'Your outreach foundation is ready.' : 'Your startup strategy is ready.'}
          </h1>
          <p className={styles.statusText}>
            Opening the project workspace now so you can review the foundation and keep refining it.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
