'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Person } from '@/lib/db/schema';
import { PersonaBubble } from './PersonaBubble';
import type { PersonaType } from './PersonaBubble';
import { RelevanceIndicator } from './RelevanceIndicator';
import { BookmarkButton } from './BookmarkButton';
import { UrlInputForm } from './UrlInputForm';
import styles from './PersonCard.module.css';

// ── Empty ─────────────────────────────────────────────────────────────────────

function CardEmpty({ onActivate }: { onActivate: () => void }) {
  return (
    <button type="button" className={styles.empty} onClick={onActivate} aria-label="Add new person">
      <span className={styles.emptyPlus}>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className={styles.emptyLabel}>Add new person</span>
    </button>
  );
}

// ── Active (URL input) ────────────────────────────────────────────────────────

function CardActive({
  projectId,
  onCreated,
  onCancel,
}: {
  projectId: string;
  onCreated: (person: Person) => void;
  onCancel?: () => void;
}) {
  async function handleSubmit(urls: string[], depth: 'quick' | 'deep') {
    const res = await fetch('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, source_urls: urls, research_depth: depth }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? 'Failed to create person.');
    }

    const person = await res.json() as Person;

    // Fire-and-forget crawl trigger — response is 202, we poll for status
    fetch(`/api/people/${person.id}/crawl`, { method: 'POST' }).catch(() => {});

    onCreated(person);
  }

  return (
    <div className={styles.active}>
      <UrlInputForm onSubmit={handleSubmit} onCancel={onCancel} />
    </div>
  );
}

// ── Loading (skeleton) ────────────────────────────────────────────────────────

function CardLoading() {
  return (
    <div className={styles.loading} aria-busy="true" aria-label="Researching person">
      <div className={styles.skeletonLine} style={{ width: '60%', height: 14 }} />
      <div className={styles.skeletonLine} style={{ width: '40%', height: 11, marginTop: 4 }} />
      <div className={styles.skeletonLine} style={{ width: '45%', height: 11, marginTop: 2 }} />
      <div className={`${styles.skeletonLine} ${styles.skeletonBubble}`} />
      <div className={styles.skeletonLine} style={{ width: '90%', height: 11, marginTop: 8 }} />
      <div className={styles.skeletonLine} style={{ width: '75%', height: 11, marginTop: 4 }} />
      <div className={styles.skeletonFooter}>
        <div className={styles.skeletonLine} style={{ width: 72, height: 44 }} />
        <div className={styles.skeletonLine} style={{ width: '40%', height: 11 }} />
      </div>
      <p className={styles.loadingLabel}>Researching...</p>
    </div>
  );
}

// ── Error ─────────────────────────────────────────────────────────────────────

function CardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.error}>
      <span className={styles.errorIcon} aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="10" cy="14" r=".9" fill="currentColor" />
        </svg>
      </span>
      <p className={styles.errorText}>Research unsuccessful</p>
      <button type="button" className={styles.retryBtn} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

// ── Filled ────────────────────────────────────────────────────────────────────

function CardFilled({
  person,
  slug,
  onBookmarkToggle,
  onDelete,
  bookmarkLoading,
}: {
  person: Person;
  slug: string;
  onBookmarkToggle: () => void;
  onDelete: () => void;
  bookmarkLoading: boolean;
}) {
  const analysis = person.analysis as {
    why_they_matter?: string;
    contact_info?: { email?: string; twitter?: string; linkedin?: string; website?: string };
  } | null;

  const contactLine = analysis?.contact_info
    ? Object.values(analysis.contact_info).find(Boolean) ?? null
    : null;

  return (
    <Link
      href={`/dashboard/${slug}/people/${person.id}`}
      className={styles.filled}
      aria-label={`View ${person.name}`}
    >
      {/* Delete button — top-left, revealed on hover */}
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
        aria-label={`Remove ${person.name}`}
        title="Remove from research"
      >
        <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Bookmark — top-right */}
      <div className={styles.bookmarkWrap}>
        <BookmarkButton
          bookmarked={person.board_status === 'bookmarked'}
          onToggle={onBookmarkToggle}
          loading={bookmarkLoading}
        />
      </div>

      {/* Identity */}
      <div className={styles.identity}>
        <p className={styles.name}>{person.name}</p>
        {(person.title || person.company) && (
          <p className={styles.meta}>
            {[person.title, person.company].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Persona bubble */}
      {person.persona_type && (
        <div className={styles.bubbleRow}>
          <PersonaBubble type={person.persona_type as PersonaType} />
        </div>
      )}

      {/* Why they matter */}
      {analysis?.why_they_matter && (
        <p className={styles.why}>{analysis.why_they_matter}</p>
      )}

      {/* Footer: gauge + contact */}
      <div className={styles.footer}>
        {person.relevance_rank && (
          <RelevanceIndicator rank={person.relevance_rank as 'low' | 'medium' | 'high'} />
        )}
        <div className={styles.contact}>
          {contactLine ? (
            <span className={styles.contactFound}>{contactLine}</span>
          ) : (
            <span className={styles.contactMissing}>Contact not found</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── PersonCard (state router) ─────────────────────────────────────────────────

type Props = {
  person?: Person;
  isFirstEmpty?: boolean;
  projectId: string;
  slug: string;
  onCreated: (person: Person) => void;
  onUpdated: (person: Person) => void;
  onDeleted: (personId: string) => void;
};

export function PersonCard({ person, isFirstEmpty, projectId, slug, onCreated, onUpdated, onDeleted }: Props) {
  const [active, setActive] = useState(!!isFirstEmpty);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  // No person → empty or active state
  if (!person) {
    if (active) {
      return (
        <div className={styles.card}>
          <CardActive
            projectId={projectId}
            onCreated={onCreated}
            onCancel={isFirstEmpty ? undefined : () => setActive(false)}
          />
        </div>
      );
    }
    return (
      <div className={styles.card}>
        <CardEmpty onActivate={() => setActive(true)} />
      </div>
    );
  }

  const isLoading =
    person.crawl_status === 'crawling' ||
    person.analysis_status === 'analyzing' ||
    (person.crawl_status === 'pending' && person.analysis_status === 'pending');

  const isError =
    person.crawl_status === 'error' || person.analysis_status === 'error';

  async function handleRetry() {
    await fetch(`/api/people/${person!.id}/crawl`, { method: 'POST' }).catch(() => {});
    // Parent polling will pick up the status change
  }

  async function handleBookmarkToggle() {
    setBookmarkLoading(true);
    try {
      const res = await fetch(`/api/people/${person!.id}/bookmark`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json() as Person;
        onUpdated(updated);
      }
    } finally {
      setBookmarkLoading(false);
    }
  }

  async function handleDelete() {
    await fetch(`/api/people/${person!.id}`, { method: 'DELETE' });
    onDeleted(person!.id);
  }

  return (
    <div className={styles.card}>
      {isLoading && <CardLoading />}
      {isError && <CardError onRetry={handleRetry} />}
      {!isLoading && !isError && (
        <CardFilled
          person={person}
          slug={slug}
          onBookmarkToggle={handleBookmarkToggle}
          onDelete={handleDelete}
          bookmarkLoading={bookmarkLoading}
        />
      )}
    </div>
  );
}
