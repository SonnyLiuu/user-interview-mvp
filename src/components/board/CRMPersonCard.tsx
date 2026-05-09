import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Person } from '@/lib/db/schema';
import { boardStatusToStage, isBookmarked, type CRMStage, type CRMOutcome } from '@/lib/crm';
import { BACKEND_ERROR_CODES } from '@/lib/error-codes';
import styles from './CRMPersonCard.module.css';

type Props = {
  person: Person;
  slug: string;
  initialHasBrief: boolean;
  onPersonUpdate: (updated: Person) => void;
};

function formatDate(d: Date | null | undefined) {
  if (!d) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(d));
}

// ── Pure visual content — no drag hooks, safe to use in DragOverlay ──────────

function CardContent({ person, bookmarked, stage }: { person: Person; bookmarked: boolean; stage: CRMStage }) {
  const scheduledDate = stage === 'scheduled' ? formatDate(person.call_scheduled_at) : null;

  return (
    <div className={styles.cardBody}>
      <div className={styles.nameRow}>
        {bookmarked && (
          <svg viewBox="0 0 12 14" fill="currentColor" aria-label="Bookmarked" className={styles.bookmarkPip}>
            <path d="M1 1h10v12l-5-3-5 3V1z" />
          </svg>
        )}
        <span className={styles.name}>{person.name}</span>
        {person.relevance_rank && (
          <span className={`${styles.rankDot} ${styles[`rank_${person.relevance_rank}`]}`} title={`${person.relevance_rank} match`} />
        )}
      </div>

      {(person.title || person.company) && (
        <p className={styles.role}>
          {[person.title, person.company].filter(Boolean).join(' · ')}
        </p>
      )}

      {scheduledDate && <p className={styles.meta}>Call: {scheduledDate}</p>}

      {person.outcome && (
        <span className={styles.outcomeBadge}>{person.outcome.replace('_', ' ')}</span>
      )}
    </div>
  );
}

// ── Stage-specific action footer ──────────────────────────────────────────────

function CardActions({ person, stage, slug, initialHasBrief, onPersonUpdate }: {
  person: Person;
  stage: CRMStage;
  slug: string;
  initialHasBrief: boolean;
  onPersonUpdate: (updated: Person) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'schedule' | 'ineffective'>('idle');
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [outreachError, setOutreachError] = useState<string | null>(null);
  const [hasBrief, setHasBrief] = useState(initialHasBrief);

  useEffect(() => {
    setHasBrief(stage === 'scheduled' && initialHasBrief);
  }, [stage, initialHasBrief]);

  if (stage === 'completed') return null;

  async function callApi(path: string, body?: object) {
    const res = await fetch(`/api/people/${person.id}/${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return await res.json() as Person;
    return null;
  }

  async function handleGenerateBrief(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading('brief');
    setBriefError(null);
    try {
      if (hasBrief) {
        router.push(`/dashboard/${slug}/people/${person.id}#call-brief`);
        return;
      }

      const res = await fetch(`/api/people/${person.id}/call-brief`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.code === BACKEND_ERROR_CODES.foundationRequired) {
          setBriefError('Complete project foundation first.');
        } else {
          setBriefError('Could not generate brief. Try again on the person page.');
        }
        return;
      }
      const data = await res.json().catch(() => null);
      setHasBrief(!!data?.content);
      router.push(`/dashboard/${slug}/people/${person.id}#call-brief`);
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerateOutreach(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading('outreach');
    setOutreachError(null);
    try {
      const res = await fetch(`/api/people/${person.id}/outreach`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.code === BACKEND_ERROR_CODES.foundationRequired) {
          setOutreachError('Complete project foundation first.');
        } else {
          setOutreachError('Could not generate outreach. Try again on the person page.');
        }
        return;
      }
      await res.json().catch(() => null);
      router.push(`/dashboard/${slug}/people/${person.id}#outreach`);
    } finally {
      setLoading(null);
    }
  }

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!scheduledAt) return;
    setLoading('schedule');
    const updated = await callApi('schedule', { scheduledAt });
    setLoading(null);
    if (updated) { onPersonUpdate(updated); setMode('idle'); setScheduledAt(''); }
  }

  async function handleIneffective(outcome: CRMOutcome) {
    setLoading(outcome);
    const updated = await callApi('ineffective', { outcome });
    setLoading(null);
    if (updated) { onPersonUpdate(updated); setMode('idle'); }
  }

  if (stage === 'to_contact') {
    return (
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.cardActionBtn}
          onClick={handleGenerateOutreach}
          disabled={loading === 'outreach'}
        >
          {loading === 'outreach' ? 'Generating...' : 'Generate outreach message'}
        </button>
        {outreachError && <p className={styles.cardErrorText}>{outreachError}</p>}
      </div>
    );
  }

  if (stage === 'scheduled') {
    return (
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.cardActionBtn}
          onClick={handleGenerateBrief}
          disabled={loading === 'brief'}
        >
          {loading === 'brief' ? 'Generating…' : hasBrief ? 'View call brief' : 'Generate call brief'}
        </button>
        {briefError && <p className={styles.cardErrorText}>{briefError}</p>}
      </div>
    );
  }

  // sent stage
  if (mode === 'schedule') {
    return (
      <div className={styles.cardActions}>
        <form className={styles.cardInlineForm} onSubmit={handleSchedule}>
          <input
            type="datetime-local"
            className={styles.cardDateInput}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            required
          />
          <button
            type="submit"
            className={styles.cardActionBtn}
            disabled={loading === 'schedule'}
            onClick={(e) => e.stopPropagation()}
          >
            {loading === 'schedule' ? 'Saving…' : 'Confirm'}
          </button>
          <button
            type="button"
            className={styles.cardCancelBtn}
            onClick={(e) => { e.stopPropagation(); setMode('idle'); }}
          >
            Cancel
          </button>
        </form>
      </div>
    );
  }

  if (mode === 'ineffective') {
    return (
      <div className={styles.cardActions}>
        <div className={styles.cardOutcomeRow}>
          <button
            type="button"
            className={styles.cardActionBtn}
            disabled={loading !== null}
            onClick={(e) => { e.stopPropagation(); handleIneffective('no_response'); }}
          >
            No response
          </button>
          <button
            type="button"
            className={`${styles.cardActionBtn} ${styles.cardActionBtnSecondary}`}
            disabled={loading !== null}
            onClick={(e) => { e.stopPropagation(); handleIneffective('not_interested'); }}
          >
            Not interested
          </button>
          <button
            type="button"
            className={styles.cardCancelBtn}
            onClick={(e) => { e.stopPropagation(); setMode('idle'); }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.cardActions}>
      <div className={styles.cardActionsRow}>
        <button
          type="button"
          className={styles.cardActionBtn}
          onClick={(e) => { e.stopPropagation(); setMode('schedule'); }}
        >
          Schedule call
        </button>
        <button
          type="button"
          className={`${styles.cardActionBtn} ${styles.cardActionBtnSecondary}`}
          onClick={(e) => { e.stopPropagation(); setMode('ineffective'); }}
        >
          Outreach ineffective
        </button>
      </div>
    </div>
  );
}

// ── Draggable card — used inside SortableContext columns ──────────────────────

export function CRMPersonCard({ person, slug, initialHasBrief, onPersonUpdate }: Props) {
  const stage = boardStatusToStage(person.board_status);
  const bookmarked = isBookmarked(person.board_status);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: person.id,
    data: { stage },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.card} ${bookmarked ? styles.cardBookmarked : ''} ${isDragging ? styles.cardDragging : ''}`}
      {...attributes}
    >
      <Link href={`/dashboard/${slug}/people/${person.id}`} className={styles.cardLink} {...listeners}>
        <CardContent person={person} bookmarked={bookmarked} stage={stage} />
      </Link>
      <CardActions
        person={person}
        stage={stage}
        slug={slug}
        initialHasBrief={initialHasBrief}
        onPersonUpdate={onPersonUpdate}
      />
    </div>
  );
}

// ── Overlay card — rendered in DragOverlay, no useSortable ───────────────────

export function CRMPersonCardOverlay({ person }: { person: Person }) {
  const stage = boardStatusToStage(person.board_status);
  const bookmarked = isBookmarked(person.board_status);

  return (
    <div className={`${styles.card} ${bookmarked ? styles.cardBookmarked : ''} ${styles.cardOverlay}`}>
      <div className={styles.cardLink}>
        <CardContent person={person} bookmarked={bookmarked} stage={stage} />
      </div>
    </div>
  );
}
