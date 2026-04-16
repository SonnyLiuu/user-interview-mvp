'use client';

import { useState, useEffect, useRef } from 'react';
import type { Person } from '@/lib/db/schema';
import { PersonGrid } from '@/components/people/PersonGrid';
import styles from './PeoplePageClient.module.css';

type Props = {
  initialPeople: Person[];
  projectId: string;
  slug: string;
};

export function PeoplePageClient({ initialPeople, projectId, slug }: Props) {
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const peopleRef = useRef(people);
  useEffect(() => { peopleRef.current = people; }, [people]);

  // Poll every 3s while any person is pending, mid-crawl, or mid-analysis
  const hasInProgress = people.some(
    (p) => p.crawl_status === 'pending' || p.crawl_status === 'crawling' || p.analysis_status === 'analyzing'
  );

  useEffect(() => {
    if (!hasInProgress) return;

    const id = setInterval(async () => {
      const toUpdate = peopleRef.current.filter(
        (p) => p.crawl_status === 'pending' || p.crawl_status === 'crawling' || p.analysis_status === 'analyzing'
      );
      await Promise.allSettled(
        toUpdate.map(async (person) => {
          const res = await fetch(`/api/people/${person.id}`);
          if (!res.ok) return;
          const updated = await res.json() as Person;
          setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        })
      );
    }, 3000);

    return () => clearInterval(id);
  }, [hasInProgress]);

  // Warn if the user tries to close/refresh mid-crawl
  useEffect(() => {
    if (!hasInProgress) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasInProgress]);

  function handlePersonCreated(person: Person) {
    setPeople((prev) => [...prev, person]);
  }

  function handlePersonUpdated(updated: Person) {
    // If person was bookmarked, remove from the People page grid
    if (updated.board_status === 'bookmarked') {
      setPeople((prev) => prev.filter((p) => p.id !== updated.id));
    } else {
      setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    }
  }

  function handlePersonDeleted(personId: string) {
    setPeople((prev) => prev.filter((p) => p.id !== personId));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Research</h1>
        <p className={styles.subtitle}>
          Paste a URL to research anyone relevant to your idea.
        </p>
      </div>

      {hasInProgress && (
        <p className={styles.progressBanner} role="status">
          Research in progress — results will appear automatically.
        </p>
      )}

      <PersonGrid
        people={people}
        projectId={projectId}
        slug={slug}
        onPersonCreated={handlePersonCreated}
        onPersonUpdated={handlePersonUpdated}
        onPersonDeleted={handlePersonDeleted}
      />
    </div>
  );
}
