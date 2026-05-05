'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Person } from '@/lib/db/schema';
import type { CRMStage } from '@/lib/crm';
import { CRMPersonCard } from './CRMPersonCard';
import styles from './BoardColumn.module.css';

type Props = {
  stage: CRMStage;
  label: string;
  people: Person[];
  slug: string;
  onPersonUpdate: (updated: Person) => void;
};

export function BoardColumn({ stage, label, people, slug, onPersonUpdate }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage, data: { stage } });

  return (
    <div className={`${styles.column} ${isOver ? styles.over : ''}`}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.count}>{people.length}</span>
      </div>

      <div ref={setNodeRef} className={styles.cardList}>
        <SortableContext
          items={people.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {people.map((person) => (
            <CRMPersonCard key={person.id} person={person} slug={slug} onPersonUpdate={onPersonUpdate} />
          ))}
        </SortableContext>

        {people.length === 0 && (
          <div className={styles.empty}>Drop people here</div>
        )}
      </div>
    </div>
  );
}
