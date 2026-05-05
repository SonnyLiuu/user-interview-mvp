'use client';

import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
  DragOverlay,
} from '@dnd-kit/core';

const centerInsideDroppable: CollisionDetection = ({ droppableContainers, collisionRect }) => {
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  for (const c of droppableContainers) {
    const r = c.rect.current;
    if (r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom)
      return [{ id: c.id, data: c }];
  }
  return [];
};
import type { Person } from '@/lib/db/schema';
import { CRM_STAGES, boardStatusToStage, stageToBoardStatus, isBookmarked, type CRMStage } from '@/lib/crm';
import { BoardColumn } from '@/components/board/BoardColumn';
import { CRMPersonCard, CRMPersonCardOverlay } from '@/components/board/CRMPersonCard';
import styles from './BoardPageClient.module.css';

type Props = {
  initialPeople: Person[];
  slug: string;
};

function groupByStage(people: Person[]): Record<CRMStage, Person[]> {
  const groups: Record<CRMStage, Person[]> = {
    to_contact: [],
    sent: [],
    scheduled: [],
    completed: [],
  };
  for (const p of people) {
    groups[boardStatusToStage(p.board_status)].push(p);
  }
  // Bookmarked people float to the top of their column
  for (const stage of Object.keys(groups) as CRMStage[]) {
    groups[stage].sort((a, b) => {
      const aB = isBookmarked(a.board_status) ? 0 : 1;
      const bB = isBookmarked(b.board_status) ? 0 : 1;
      return aB - bB;
    });
  }
  return groups;
}

export function BoardPageClient({ initialPeople, slug }: Props) {
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [activePerson, setActivePerson] = useState<Person | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const groups = groupByStage(people);

  function handlePersonUpdate(updated: Person) {
    setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActivePerson(null);
    if (!over) return;

    const personId = active.id as string;

    // over.id is either a stage string (empty column droppable) or a card UUID
    // (sortable item). Resolve the stage from data.current in both cases.
    const targetStage = (over.data.current?.stage ?? over.id) as CRMStage;

    const person = people.find((p) => p.id === personId);
    if (!person) return;

    const currentStage = boardStatusToStage(person.board_status);
    if (currentStage === targetStage) return;

    // Optimistic update
    setPeople((prev) =>
      prev.map((p) =>
        p.id === personId
          ? { ...p, board_status: stageToBoardStatus(targetStage), updated_at: new Date() }
          : p
      )
    );

    try {
      const res = await fetch(`/api/people/${personId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (res.ok) {
        const updated = await res.json() as Person;
        setPeople((prev) => prev.map((p) => (p.id === personId ? updated : p)));
      } else {
        // Revert on failure
        setPeople((prev) => prev.map((p) => (p.id === personId ? person : p)));
      }
    } catch {
      setPeople((prev) => prev.map((p) => (p.id === personId ? person : p)));
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Board</h1>
        <p className={styles.subtitle}>Drag people between stages to track your outreach progress.</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={centerInsideDroppable}
        onDragStart={(e) => {
          const person = people.find((p) => p.id === e.active.id);
          if (person) setActivePerson(person);
        }}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActivePerson(null)}
      >
        <div className={styles.board}>
          {CRM_STAGES.map(({ id, label }) => (
            <BoardColumn
              key={id}
              stage={id}
              label={label}
              people={groups[id]}
              slug={slug}
              onPersonUpdate={handlePersonUpdate}
            />
          ))}
        </div>

        <DragOverlay>
          {activePerson && <CRMPersonCardOverlay person={activePerson} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
