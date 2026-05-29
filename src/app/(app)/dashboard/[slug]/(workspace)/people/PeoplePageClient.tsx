'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Person } from '@/lib/db/schema';
import { PersonGrid } from '@/components/people/PersonGrid';
import styles from './PeoplePageClient.module.css';

type Props = {
  initialPeople: Person[];
  projectId: string;
  slug: string;
};

type SortOrder = 'match-desc' | 'match-asc' | 'recent-desc' | 'recent-asc';

const SORT_LABELS: Record<SortOrder, string> = {
  'match-desc':  'Match ↑',
  'match-asc':   'Match ↓',
  'recent-desc': 'Most recent',
  'recent-asc':  'Least recent',
};

const RANK = { high: 3, medium: 2, low: 1 } as const;

function matchSortValue(person: Person): number {
  if (typeof person.match_score === 'number') return person.match_score;
  return (RANK[(person.match_rank ?? person.relevance_rank) as keyof typeof RANK] ?? 0) * 25;
}

function sortGroup(group: Person[], order: SortOrder): Person[] {
  const sortable = group.filter((p) => p.analysis_status === 'complete');
  const rest = group.filter((p) => p.analysis_status !== 'complete');

  const sorted = [...sortable].sort((a, b) => {
    if (order === 'match-desc') return matchSortValue(b) - matchSortValue(a);
    if (order === 'match-asc')  return matchSortValue(a) - matchSortValue(b);
    if (order === 'recent-desc') return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime();
    return new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime();
  });

  return [...sorted, ...rest];
}

function applySortOrder(people: Person[], order: SortOrder): Person[] {
  const bookmarked = people.filter((p) => p.board_status !== null);
  const unbookmarked = people.filter((p) => p.board_status === null);
  return [...sortGroup(bookmarked, order), ...sortGroup(unbookmarked, order)];
}

function matchesSearch(person: Person, query: string): boolean {
  return [person.name, person.company, person.title].some((value) =>
    value?.toLowerCase().includes(query)
  );
}

export function PeoplePageClient({ initialPeople, projectId, slug }: Props) {
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const peopleRef = useRef(people);
  useEffect(() => { peopleRef.current = people; }, [people]);

  useEffect(() => {
    setPeople(initialPeople);
  }, [initialPeople, projectId]);

  const pollStartRef = useRef<Map<string, number>>(new Map());

  const [sortOrder, setSortOrder] = useState<SortOrder>('recent-asc');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sortOpen]);

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

      for (const person of toUpdate) {
        if (!pollStartRef.current.has(person.id)) {
          pollStartRef.current.set(person.id, Date.now());
        }
      }

      const ids = toUpdate.map((person) => person.id).join(',');
      const res = await fetch(`/api/people?ids=${encodeURIComponent(ids)}`);
      if (!res.ok) return;
      const updatedPeople = await res.json() as Person[];
      if (updatedPeople.length === 0) return;
      const updatedById = new Map(updatedPeople.map((person) => [person.id, person]));
      setPeople((prev) => prev.map((person) => updatedById.get(person.id) ?? person));
    }, 3000);

    return () => clearInterval(id);
  }, [hasInProgress]);

  // Client-side safety net: if a person has been in-progress for >10 min with no
  // resolution (e.g. after() was orphaned and Chunk 1 hasn't run yet), flip locally
  // to error so the Retry button appears without waiting for a page reload.
  useEffect(() => {
    if (!hasInProgress) return;
    const TIMEOUT_MS = 10 * 60 * 1000;
    const now = Date.now();

    const timedOut = people.filter((p) => {
      const inProgress = p.crawl_status === 'crawling' || p.crawl_status === 'pending' || p.analysis_status === 'analyzing';
      if (!inProgress) return false;
      const start = pollStartRef.current.get(p.id);
      return start !== undefined && now - start >= TIMEOUT_MS;
    });

    if (timedOut.length === 0) return;

    setPeople((prev) =>
      prev.map((p) =>
        timedOut.some((t) => t.id === p.id)
          ? { ...p, crawl_status: 'error', analysis_status: 'error', crawl_error: 'Research timed out' }
          : p
      )
    );
    for (const p of timedOut) pollStartRef.current.delete(p.id);
  }, [people, hasInProgress]);

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
    router.refresh();
  }

  function handlePersonUpdated(updated: Person) {
    setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    router.refresh();
  }

  function handlePersonDeleted(personId: string) {
    setPeople((prev) => prev.filter((p) => p.id !== personId));
    router.refresh();
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchActive = normalizedSearch.length > 0;
  const visiblePeople = searchActive
    ? people.filter((person) => matchesSearch(person, normalizedSearch))
    : people;
  const sortedPeople = applySortOrder(visiblePeople, sortOrder);

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

      {people.length > 0 && (
        <div className={styles.gridToolbar}>
          <div className={styles.sortWrap} ref={sortRef}>
            <button
              type="button"
              className={styles.sortBtn}
              onClick={() => setSortOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
            >
              {SORT_LABELS[sortOrder]}
              <svg viewBox="0 0 10 6" fill="none" aria-hidden="true" className={styles.sortChevron}>
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {sortOpen && (
              <ul className={styles.sortDropdown} role="listbox">
                {(Object.keys(SORT_LABELS) as SortOrder[]).map((opt) => (
                  <li
                    key={opt}
                    role="option"
                    aria-selected={sortOrder === opt}
                    className={`${styles.sortOption} ${sortOrder === opt ? styles.sortOptionActive : ''}`}
                    onClick={() => { setSortOrder(opt); setSortOpen(false); }}
                  >
                    {SORT_LABELS[opt]}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className={styles.searchInput}
            placeholder="Search name, company, or title"
            aria-label="Search people by name, company, or title"
          />
        </div>
      )}

      <PersonGrid
        people={sortedPeople}
        searchActive={searchActive}
        projectId={projectId}
        slug={slug}
        onPersonCreated={handlePersonCreated}
        onPersonUpdated={handlePersonUpdated}
        onPersonDeleted={handlePersonDeleted}
      />
    </div>
  );
}
