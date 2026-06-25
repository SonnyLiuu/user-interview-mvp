import { useState } from 'react';
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
  callBriefPersonIds: Set<string>;
  isDropTarget: boolean;
  onPersonUpdate: (updated: Person) => void;
};

export function BoardColumn({ stage, label, people, slug, callBriefPersonIds, isDropTarget, onPersonUpdate }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage, data: { stage } });
  const isActiveTarget = isDropTarget || isOver;
  const [successfulOpen, setSuccessfulOpen] = useState(true);
  const [unsuccessfulOpen, setUnsuccessfulOpen] = useState(false);
  const successfulPeople = stage === 'completed'
    ? people.filter((person) => person.outcome !== 'no_response' && person.outcome !== 'not_interested')
    : [];
  const unsuccessfulPeople = stage === 'completed'
    ? people.filter((person) => person.outcome === 'no_response' || person.outcome === 'not_interested')
    : [];

  function renderCards(group: Person[]) {
    return group.map((person) => (
      <CRMPersonCard
        key={person.id}
        person={person}
        slug={slug}
        initialHasBrief={callBriefPersonIds.has(person.id)}
        onPersonUpdate={onPersonUpdate}
      />
    ));
  }

  return (
    <div className={`${styles.column} ${isActiveTarget ? styles.over : ''}`}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.count}>{people.length}</span>
      </div>

      <div ref={setNodeRef} className={styles.cardList}>
        {stage === 'completed' ? (
          <>
            <section className={styles.outcomeSection}>
              <button
                type="button"
                className={styles.outcomeSectionToggle}
                onClick={() => setSuccessfulOpen((open) => !open)}
                aria-expanded={successfulOpen}
              >
                <span className={`${styles.chevron} ${successfulOpen ? styles.chevronOpen : ''}`} aria-hidden="true">›</span>
                <span className={styles.outcomeSectionLabel}>Interviewed</span>
                <span className={styles.outcomeSectionCount}>{successfulPeople.length}</span>
              </button>
              {successfulOpen && (
                <div className={styles.outcomeSectionCards}>
                  <SortableContext
                    items={successfulPeople.map((person) => person.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {renderCards(successfulPeople)}
                  </SortableContext>
                  {successfulPeople.length === 0 && (
                    <div className={styles.sectionEmpty}>No interviews yet</div>
                  )}
                </div>
              )}
            </section>

            <section className={styles.outcomeSection}>
              <button
                type="button"
                className={styles.outcomeSectionToggle}
                onClick={() => setUnsuccessfulOpen((open) => !open)}
                aria-expanded={unsuccessfulOpen}
              >
                <span className={`${styles.chevron} ${unsuccessfulOpen ? styles.chevronOpen : ''}`} aria-hidden="true">›</span>
                <span className={styles.outcomeSectionLabel}>Not interviewed</span>
                <span className={styles.outcomeSectionCount}>{unsuccessfulPeople.length}</span>
              </button>
              {unsuccessfulOpen && (
                <div className={styles.outcomeSectionCards}>
                  <SortableContext
                    items={unsuccessfulPeople.map((person) => person.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {renderCards(unsuccessfulPeople)}
                  </SortableContext>
                  {unsuccessfulPeople.length === 0 && (
                    <div className={styles.sectionEmpty}>No people in this group</div>
                  )}
                </div>
              )}
            </section>
          </>
        ) : (
          <SortableContext
            items={people.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            {renderCards(people)}
          </SortableContext>
        )}

        {people.length === 0 && stage !== 'completed' && (
          <div className={styles.empty}>Drop people here</div>
        )}
      </div>
    </div>
  );
}
