import { useState } from 'react';
import Link from 'next/link';
import type { Person, PersonAnalysis } from '@/lib/db/schema';
import { PersonaBubble } from './PersonaBubble';
import { RelevanceIndicator } from './RelevanceIndicator';
import { BookmarkButton } from './BookmarkButton';
import { UrlInputForm } from './UrlInputForm';
import styles from './PersonCard.module.css';
import { getPersonaTags, type PersonaTagMode } from './persona-tags';

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
  outreachProjectId,
  onCreated,
  onCancel,
  initialUrls,
  initialPastedText,
}: {
  projectId: string;
  outreachProjectId?: string | null;
  onCreated: (person: Person) => void;
  onCancel?: () => void;
  initialUrls?: string[];
  initialPastedText?: string | null;
}) {
  async function handleSubmit(urls: string[], depth: 'quick' | 'deep', pastedText: string) {
    const res = await fetch('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        outreach_project_id: outreachProjectId ?? undefined,
        source_urls: urls,
        raw_pasted_text: pastedText || undefined,
        research_depth: depth,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? 'Failed to create person.');
    }

    const person = await res.json() as Person;
    const crawlRes = await fetch(`/api/people/${person.id}/crawl`, { method: 'POST' });

    if (!crawlRes.ok) {
      const data = await crawlRes.json().catch(() => ({})) as { error?: string };
      onCreated({
        ...person,
        crawl_status: 'error',
        analysis_status: 'error',
        crawl_error: data.error ?? 'Failed to start research.',
      });
      return;
    }

    onCreated({ ...person, crawl_status: 'crawling', crawl_error: null });
  }

  return (
    <div className={styles.active}>
      <UrlInputForm
        onSubmit={handleSubmit}
        onCancel={onCancel}
        initialUrls={initialUrls}
        initialPastedText={initialPastedText}
      />
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
      <div className={styles.skeletonLine} style={{ width: '68%', height: 11, marginTop: 8 }} />
      <div className={styles.skeletonLine} style={{ width: '82%', height: 11, marginTop: 4 }} />
      <div className={styles.skeletonFooter}>
        <div className={styles.skeletonLine} style={{ width: 72, height: 44 }} />
        <div className={styles.skeletonLine} style={{ width: '40%', height: 11 }} />
      </div>
      <p className={styles.loadingLabel}>Researching...</p>
    </div>
  );
}

// ── Error ─────────────────────────────────────────────────────────────────────

function formatResearchError(message?: string | null) {
  if (!message) return 'Research unsuccessful';
  if (/not started/i.test(message)) return 'Research was not started. Please retry.';
  if (/foundation/i.test(message)) return 'Complete the foundation first, then retry.';
  if (/timed out/i.test(message)) return 'Research timed out. Please retry.';
  if (/firecrawl|scrape failed|unsupported/i.test(message)) return 'Could not read this URL. Try another source.';
  return message.length > 120 ? 'Research unsuccessful. Please retry.' : message;
}

function CardError({ onRetry, message }: { onRetry: () => void; message?: string | null }) {
  return (
    <div className={styles.error}>
      <span className={styles.errorIcon} aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="10" cy="14" r=".9" fill="currentColor" />
        </svg>
      </span>
      <p className={styles.errorText}>{formatResearchError(message)}</p>
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
  tagMode,
}: {
  person: Person;
  slug: string;
  onBookmarkToggle: () => void;
  onDelete: () => void;
  bookmarkLoading: boolean;
  tagMode: PersonaTagMode;
}) {
  const analysis = person.analysis as PersonAnalysis | null;

  const matchRank = (person.match_rank ?? person.relevance_rank) as 'low' | 'medium' | 'high' | null;
  const personaTags = getPersonaTags(person.persona_type, analysis?.global_tags, tagMode);

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
      {personaTags.length > 0 && (
        <div className={styles.bubbleRow}>
          {personaTags.map((tag) => (
            <PersonaBubble key={tag.key} tag={tag} />
          ))}
        </div>
      )}

      {/* Why they matter */}
      {analysis?.why_they_matter && (
        <p className={styles.why}>{analysis.why_they_matter}</p>
      )}

      {/* Footer: gauge + profile affordance */}
      <div className={styles.footer}>
        {matchRank && (
          <RelevanceIndicator rank={matchRank} score={person.match_score} stale={person.match_status === 'stale'} />
        )}
        <span className={styles.openProfile}>Open profile</span>
      </div>
    </Link>
  );
}

// ── PersonCard (state router) ─────────────────────────────────────────────────

type Props = {
  person?: Person;
  isFirstEmpty?: boolean;
  projectId: string;
  outreachProjectId?: string | null;
  tagMode: PersonaTagMode;
  slug: string;
  onCreated: (person: Person) => void;
  onUpdated: (person: Person) => void;
  onDeleted: (personId: string) => void;
};

export function PersonCard({ person, isFirstEmpty, projectId, outreachProjectId, tagMode, slug, onCreated, onUpdated, onDeleted }: Props) {
  const [active, setActive] = useState(!!isFirstEmpty);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [showRetryForm, setShowRetryForm] = useState(false);

  // No person → empty or active state
  if (!person) {
    if (active) {
      return (
        <div className={styles.card}>
          <CardActive
            projectId={projectId}
            outreachProjectId={outreachProjectId}
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
    person.analysis_status === 'analyzing';

  const isError =
    person.crawl_status === 'error' || person.analysis_status === 'error';
  const hasCompleteAnalysis = person.analysis_status === 'complete' || !!person.analysis;
  const isRetryableIncomplete = !isLoading && !isError && !hasCompleteAnalysis;

  function handleRetry() {
    setShowRetryForm(true);
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

  if ((isError || isRetryableIncomplete) && showRetryForm) {
    return (
      <div className={styles.card}>
        <CardActive
          projectId={projectId}
          outreachProjectId={outreachProjectId}
          onCreated={async (newPerson) => {
            await fetch(`/api/people/${person.id}`, { method: 'DELETE' }).catch(() => {});
            onDeleted(person.id);
            onCreated(newPerson);
          }}
          initialUrls={(person.source_urls as string[]) ?? []}
          initialPastedText={person.raw_pasted_text}
        />
      </div>
    );
  }

  return (
    <div className={styles.card}>
      {isLoading && <CardLoading />}
      {isError && <CardError onRetry={handleRetry} message={person.crawl_error} />}
      {isRetryableIncomplete && (
        <CardError onRetry={handleRetry} message={person.crawl_error ?? 'Research was not started'} />
      )}
      {!isLoading && !isError && !isRetryableIncomplete && (
        <CardFilled
          person={person}
          slug={slug}
          onBookmarkToggle={handleBookmarkToggle}
          onDelete={handleDelete}
          bookmarkLoading={bookmarkLoading}
          tagMode={tagMode}
        />
      )}
    </div>
  );
}
