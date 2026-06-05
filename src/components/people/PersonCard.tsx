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
  initialUrls,
  initialPastedText,
}: {
  projectId: string;
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

const FIT_COPY: Record<PersonaType, { bestFor: string; fallbackAsks: string[] }> = {
  potential_user: {
    bestFor: 'Validating user pain and current workflow',
    fallbackAsks: ['Current workaround', 'Research steps', 'Switching trigger'],
  },
  buyer: {
    bestFor: 'Understanding purchase criteria and budget',
    fallbackAsks: ['Buying process', 'Success criteria', 'Budget owner'],
  },
  operator: {
    bestFor: 'Mapping workflow bottlenecks and handoffs',
    fallbackAsks: ['Operational gaps', 'Manual steps', 'Decision points'],
  },
  domain_expert: {
    bestFor: 'Stress-testing the market and category',
    fallbackAsks: ['Market pattern', 'Hidden risks', 'Better targets'],
  },
  skeptic: {
    bestFor: 'Finding objections before they slow outreach',
    fallbackAsks: ['Deal blockers', 'Weak claims', 'Alternatives'],
  },
  connector: {
    bestFor: 'Finding warmer paths to the right people',
    fallbackAsks: ['Best intro', 'Relevant circles', 'Credibility signals'],
  },
};

function questionToChip(question: string) {
  return question
    .replace(/^[\s"']+|[\s"'?.!]+$/g, '')
    .replace(/^(how|what|where|when|why|who)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function interviewFitFor(personaType: string | null, recommendedQuestions?: string[]) {
  const persona = personaType as PersonaType | null;
  const fallback = persona && FIT_COPY[persona] ? FIT_COPY[persona] : FIT_COPY.potential_user;
  const questionChips = (recommendedQuestions ?? [])
    .map(questionToChip)
    .filter((question) => question.length >= 8)
    .slice(0, 2);

  return {
    bestFor: fallback.bestFor,
    askAbout: questionChips.length ? questionChips : fallback.fallbackAsks,
  };
}

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
    recommended_questions?: string[];
  } | null;

  const matchRank = (person.match_rank ?? person.relevance_rank) as 'low' | 'medium' | 'high' | null;
  const interviewFit = interviewFitFor(person.persona_type, analysis?.recommended_questions);

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

      <div className={styles.interviewFit}>
        <div className={styles.fitHeader}>
          <span className={styles.fitLabel}>Interview fit</span>
          <span className={styles.fitBest}>{interviewFit.bestFor}</span>
        </div>
        <div className={styles.askRow}>
          <span className={styles.askLabel}>Ask about</span>
          <span className={styles.askChips}>
            {interviewFit.askAbout.map((item) => (
              <span key={item} className={styles.askChip}>{item}</span>
            ))}
          </span>
        </div>
      </div>

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
  slug: string;
  onCreated: (person: Person) => void;
  onUpdated: (person: Person) => void;
  onDeleted: (personId: string) => void;
};

export function PersonCard({ person, isFirstEmpty, projectId, slug, onCreated, onUpdated, onDeleted }: Props) {
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

  if (isError && showRetryForm) {
    return (
      <div className={styles.card}>
        <CardActive
          projectId={projectId}
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
