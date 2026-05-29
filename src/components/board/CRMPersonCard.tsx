import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Person } from '@/lib/db/schema';
import { boardStatusToStage, type CRMStage, type CRMOutcome } from '@/lib/crm';
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

function CardContent({ person, stage }: { person: Person; stage: CRMStage }) {
  const scheduledDate = stage === 'scheduled' ? formatDate(person.call_scheduled_at) : null;
  const matchRank = person.match_rank ?? person.relevance_rank;

  return (
    <div className={styles.cardBody}>
      <div className={styles.nameRow}>
        <span className={styles.name}>{person.name}</span>
        {matchRank && (
          <span className={`${styles.rankDot} ${styles[`rank_${matchRank}`]}`} title={`${matchRank} match${person.match_score === null || person.match_score === undefined ? '' : ` · ${person.match_score}`}${person.match_status === 'stale' ? ' · based on older rubric' : ''}`} />
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

  function handleGenerateOutreach(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Navigate immediately; the OutreachComposer on the person page will
    // kick off generation when it sees `?generate=outreach` and show its
    // own loading state. Avoids blocking the board on a multi-second LLM call.
    router.push(`/dashboard/${slug}/people/${person.id}?generate=outreach#outreach`);
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
        >
          Generate outreach message
        </button>
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
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
      {...attributes}
    >
      <Link href={`/dashboard/${slug}/people/${person.id}`} className={styles.cardLink} {...listeners}>
        <CardContent person={person} stage={stage} />
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

  return (
    <div className={`${styles.card} ${styles.cardOverlay}`}>
      <div className={styles.cardLink}>
        <CardContent person={person} stage={stage} />
      </div>
    </div>
  );
}
