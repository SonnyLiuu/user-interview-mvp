'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
  DragOverlay,
  type DragOverEvent,
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
import { CRM_STAGES, boardStatusToStage, stageToBoardStatus, type CRMStage } from '@/lib/crm';
import { BoardColumn } from '@/components/board/BoardColumn';
import { CRMPersonCard, CRMPersonCardOverlay } from '@/components/board/CRMPersonCard';
import styles from './BoardPageClient.module.css';

type Props = {
  initialPeople: Person[];
  slug: string;
  initialCallBriefPersonIds: string[];
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
  return groups;
}

export function BoardPageClient({ initialPeople, slug, initialCallBriefPersonIds }: Props) {
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [activePerson, setActivePerson] = useState<Person | null>(null);
  const [overStage, setOverStage] = useState<CRMStage | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const groups = groupByStage(people);
  const callBriefPersonIds = useMemo(() => new Set(initialCallBriefPersonIds), [initialCallBriefPersonIds]);

  function handlePersonUpdate(updated: Person) {
    setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function resolveOverStage(over: DragOverEvent['over']): CRMStage | null {
    if (!over) return null;
    return (over.data.current?.stage ?? over.id) as CRMStage;
  }

  function handleDragOver(event: DragOverEvent) {
    setOverStage(resolveOverStage(event.over));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActivePerson(null);
    setOverStage(null);
    if (!over) return;

    const personId = active.id as string;

    // over.id is either a stage string (empty column droppable) or a card UUID
    // (sortable item). Resolve the stage from data.current in both cases.
    const targetStage = resolveOverStage(over);
    if (!targetStage) return;

    const person = people.find((p) => p.id === personId);
    if (!person) return;

    const currentStage = boardStatusToStage(person.board_status);
    if (currentStage === targetStage) return;

    // Optimistic update
    setPeople((prev) =>
      prev.map((p) =>
        p.id === personId
          ? { ...p, board_status: stageToBoardStatus(targetStage), expires_at: null, updated_at: new Date() }
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
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActivePerson(null);
          setOverStage(null);
        }}
      >
        <div className={styles.board}>
          {CRM_STAGES.map(({ id, label }) => (
            <BoardColumn
              key={id}
              stage={id}
              label={label}
              people={groups[id]}
              slug={slug}
              callBriefPersonIds={callBriefPersonIds}
              isDropTarget={overStage === id}
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
