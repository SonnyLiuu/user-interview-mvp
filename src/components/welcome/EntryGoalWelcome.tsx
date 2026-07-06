'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { EntryGoal } from '@/lib/backend-types';
import styles from './EntryGoalWelcome.module.css';

export const ENTRY_GOAL_COPY: Record<EntryGoal, { title: string; body: string }> = {
  pressure_test_idea: {
    title: 'Your pressure test is ready',
    body: 'Review the assumptions in your Foundation, then ask the advisor to sharpen the weakest part before you begin outreach.',
  },
  find_interviewees: {
    title: 'Start with one high-learning person',
    body: 'Add someone who has direct, recent experience with the problem. We will research their background and explain what you can learn from them.',
  },
  write_outreach: {
    title: 'Research first, then write a message worth answering',
    body: 'Add a potential interviewee. Their research brief will give you the context needed for relevant, personal outreach.',
  },
  prepare_conversation: {
    title: 'Prepare around what you need to learn',
    body: 'Add the person you are meeting. We will connect their background to your assumptions and help prepare the conversation.',
  },
  analyze_notes: {
    title: 'Turn your next conversation into evidence',
    body: 'Add the interviewee, then attach notes or a transcript after the conversation to see which assumptions became stronger or weaker.',
  },
  find_early_users: {
    title: 'Look for urgency, not just interest',
    body: 'Add a potential early user or design partner. Prioritize people with active workarounds and a reason to try something new.',
  },
  exploring: {
    title: 'You have a useful place to begin',
    body: 'Review the Foundation and its recommended first outreach project. You can refine it with the advisor whenever your thinking changes.',
  },
};

export default function EntryGoalWelcome({
  entryGoal,
  projectId,
  actionHref,
  actionLabel,
}: {
  entryGoal?: EntryGoal | null;
  projectId: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const storageKey = `entry-goal-welcome:${projectId}`;
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (window.localStorage.getItem(storageKey) === 'dismissed') setVisible(false);
  }, [storageKey]);
  if (!entryGoal || !visible) return null;
  const copy = ENTRY_GOAL_COPY[entryGoal];

  function dismiss() {
    window.localStorage.setItem(storageKey, 'dismissed');
    setVisible(false);
  }

  return (
    <section className={styles.banner} aria-label="Getting started guidance">
      <div>
        <p className={styles.eyebrow}>Your recommended first step</p>
        <h2>{copy.title}</h2>
        <p className={styles.body}>{copy.body}</p>
      </div>
      <div className={styles.actions}>
        {actionHref && actionLabel && <Link href={actionHref} className={styles.action}>{actionLabel}</Link>}
        <button type="button" className={styles.dismiss} onClick={dismiss}>Dismiss</button>
      </div>
    </section>
  );
}
