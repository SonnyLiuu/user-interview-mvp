'use client';

import type { Person } from '@/lib/db/schema';
import { PersonCard } from './PersonCard';
import styles from './PersonGrid.module.css';

type Props = {
  people: Person[];
  projectId: string;
  slug: string;
  onPersonCreated: (person: Person) => void;
  onPersonUpdated: (person: Person) => void;
  onPersonDeleted: (personId: string) => void;
};

function coverageGap(people: Person[]): string | null {
  const filled = people.filter((p) => p.analysis_status === 'complete');
  if (filled.length < 3) return null;

  const counts: Record<string, number> = {};
  for (const p of filled) {
    if (p.persona_type) counts[p.persona_type] = (counts[p.persona_type] ?? 0) + 1;
  }

  const allTypes = ['potential_user', 'buyer', 'operator', 'domain_expert', 'skeptic', 'connector'];
  const missing = allTypes.filter((t) => !counts[t]);
  if (!missing.length) return null;

  const labels: Record<string, string> = {
    potential_user: 'potential users',
    buyer: 'budget owners',
    operator: 'operators',
    domain_expert: 'domain experts',
    skeptic: 'skeptics',
    connector: 'connectors',
  };

  const present = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t, n]) => `${n} ${labels[t] ?? t}`)
    .join(' and ');

  const gap = labels[missing[0]];
  return `You have ${present} and 0 ${gap}.`;
}

export function PersonGrid({ people, projectId, slug, onPersonCreated, onPersonUpdated, onPersonDeleted }: Props) {
  // Always have at least 6 slots; add a new row of 3 whenever all slots are filled
  const minSlots = Math.max(6, people.length + 1);
  const totalSlots = Math.ceil(minSlots / 3) * 3;

  const slots = Array.from({ length: totalSlots }, (_, i) => people[i] ?? undefined);
  const firstEmptyIdx = slots.findIndex((s) => !s);

  const gap = coverageGap(people);

  return (
    <div className={styles.wrap}>
      {gap && (
        <p className={styles.gapBanner} role="status">{gap}</p>
      )}
      <div className={styles.grid}>
        {slots.map((person, idx) => (
          <PersonCard
            key={person?.id ?? `empty-${idx}`}
            person={person}
            isFirstEmpty={idx === firstEmptyIdx}
            projectId={projectId}
            slug={slug}
            onCreated={onPersonCreated}
            onUpdated={onPersonUpdated}
            onDeleted={onPersonDeleted}
          />
        ))}
      </div>
    </div>
  );
}
