import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people } from '@/lib/db/schema';

// ── Types ──────────────────────────────────────────────────────────────────────

export type OutcomeCounts = {
  noResponse: number;
  notInterested: number;
  successfulCall: number;
  partial: number;
};

export type FunnelStage = {
  sent: number;
  responded: number;
  scheduled: number;
};

export type PersonaBreakdown = {
  personaType: string;
  contacted: number;
  responded: number;
  responseRate: number;
  noResponse: number;
  notInterested: number;
  successfulCall: number;
  partial: number;
};

export type StalePerson = {
  id: string;
  name: string;
  daysSinceContact: number;
};

export type OutreachStats = {
  projectId: string;

  // Response overview
  totalFound: number;
  totalContacted: number;
  totalResponded: number;
  responseRate: number | null; // null when 0 contacted

  // Outcome breakdown
  outcomeCounts: OutcomeCounts;

  // Conversion funnel
  funnel: FunnelStage;

  // Segmentation
  byPersonaType: PersonaBreakdown[];

  // Stale outreach (sent > 14 days, no outcome)
  staleCount: number;
  stalePeople: StalePerson[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const STALE_DAYS_THRESHOLD = 14;

// ── Helpers ────────────────────────────────────────────────────────────────────

type PersonRow = {
  id: string;
  name: string;
  personaType: string | null;
  boardStatus: string | null;
  outcome: string | null;
  lastContactedAt: Date | null;
};

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal, e.g. 25.5
}

function daysAgo(date: Date): number {
  const now = Date.now();
  const then = date.getTime();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function isContacted(row: PersonRow): boolean {
  return row.boardStatus !== null && row.boardStatus !== 'bookmarked';
}

function hasResponded(row: PersonRow): boolean {
  return row.outcome !== null && row.outcome !== 'no_response';
}

function isStale(row: PersonRow): boolean {
  return (
    row.boardStatus === 'sent' &&
    (row.outcome === null || row.outcome === 'no_response') &&
    row.lastContactedAt !== null &&
    daysAgo(row.lastContactedAt) > STALE_DAYS_THRESHOLD
  );
}

function emptyOutcomeCounts(): OutcomeCounts {
  return { noResponse: 0, notInterested: 0, successfulCall: 0, partial: 0 };
}

function emptyFunnel(): FunnelStage {
  return { sent: 0, responded: 0, scheduled: 0 };
}

// ── Main query ─────────────────────────────────────────────────────────────────

export async function getOutreachStats(projectId: string): Promise<OutreachStats> {
  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      personaType: people.persona_type,
      boardStatus: people.board_status,
      outcome: people.outcome,
      lastContactedAt: people.last_contacted_at,
    })
    .from(people)
    .where(eq(people.project_id, projectId));

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalFound = rows.length;
  const contacted = rows.filter(isContacted);
  const totalContacted = contacted.length;
  const responded = contacted.filter(hasResponded);
  const totalResponded = responded.length;
  const responseRate = rate(totalResponded, totalContacted);

  // ── Outcome counts ────────────────────────────────────────────────────────

  const outcomeCounts: OutcomeCounts = emptyOutcomeCounts();
  for (const row of contacted) {
    switch (row.outcome) {
      case 'no_response':
        outcomeCounts.noResponse++;
        break;
      case 'not_interested':
        outcomeCounts.notInterested++;
        break;
      case 'successful_call':
        outcomeCounts.successfulCall++;
        break;
      case 'partial':
        outcomeCounts.partial++;
        break;
    }
  }

  // ── Funnel ────────────────────────────────────────────────────────────────
  // Cumulative funnel: total contacted → total responded → total completed
  // Each stage is a subset of the previous one.

  const funnel: FunnelStage = emptyFunnel();
  for (const row of rows) {
    if (isContacted(row)) {
      funnel.sent++; // total ever contacted
      if (hasResponded(row)) {
        funnel.responded++;
        if (row.boardStatus === 'scheduled' || row.boardStatus === 'completed') {
          funnel.scheduled++;
        }
      }
    }
  }

  // ── By persona type ───────────────────────────────────────────────────────

  const personaMap = new Map<
    string,
    {
      contacted: number;
      responded: number;
      noResponse: number;
      notInterested: number;
      successfulCall: number;
      partial: number;
    }
  >();

  for (const row of contacted) {
    const key = row.personaType?.trim() || 'Unknown';
    const entry = personaMap.get(key) ?? {
      contacted: 0,
      responded: 0,
      noResponse: 0,
      notInterested: 0,
      successfulCall: 0,
      partial: 0,
    };
    entry.contacted++;
    if (hasResponded(row)) entry.responded++;
    switch (row.outcome) {
      case 'no_response':
        entry.noResponse++;
        break;
      case 'not_interested':
        entry.notInterested++;
        break;
      case 'successful_call':
        entry.successfulCall++;
        break;
      case 'partial':
        entry.partial++;
        break;
    }
    personaMap.set(key, entry);
  }

  const byPersonaType: PersonaBreakdown[] = Array.from(personaMap.entries())
    .map(([personaType, entry]) => ({
      personaType,
      contacted: entry.contacted,
      responded: entry.responded,
      responseRate: rate(entry.responded, entry.contacted) ?? 0,
      noResponse: entry.noResponse,
      notInterested: entry.notInterested,
      successfulCall: entry.successfulCall,
      partial: entry.partial,
    }))
    .sort((a, b) => b.responseRate - a.responseRate || b.contacted - a.contacted);

  // ── Stale outreach ────────────────────────────────────────────────────────

  const staleRows = contacted.filter(isStale);
  const stalePeople: StalePerson[] = staleRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      daysSinceContact: row.lastContactedAt ? daysAgo(row.lastContactedAt) : 0,
    }))
    .sort((a, b) => b.daysSinceContact - a.daysSinceContact);

  return {
    projectId,
    totalFound,
    totalContacted,
    totalResponded,
    responseRate,
    outcomeCounts,
    funnel,
    byPersonaType,
    staleCount: stalePeople.length,
    stalePeople,
  };
}
