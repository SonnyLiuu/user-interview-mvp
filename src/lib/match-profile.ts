import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, person_events, project_match_profiles, type Person, type ProjectMatchProfileJson } from '@/lib/db/schema';
import type { Foundation } from '@/lib/backend-types';

const SIGNAL_REFRESH_THRESHOLD = 3;

function cleanList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

export function matchRankForScore(score: number): 'low' | 'medium' | 'high' {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

export function scoreFromRank(rank: unknown): number | null {
  if (rank === 'high') return 85;
  if (rank === 'medium') return 60;
  if (rank === 'low') return 30;
  return null;
}

export function normalizeMatchScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function foundationToMatchProfile(foundation: Foundation | null | undefined): ProjectMatchProfileJson {
  const priorityRecipientTypes = cleanList(foundation?.priorityRecipientTypes ?? foundation?.idealPeopleTypes);
  const lowFitSignals = cleanList(foundation?.lowFitSignals ?? foundation?.messageBoundaries);
  const providedRubric = typeof foundation?.matchRubric === 'string' ? foundation.matchRubric.trim() : '';
  const matchRubric = providedRubric || [
    foundation?.outreachGoal ?? foundation?.summary,
    foundation?.recipients
      ? `Prioritize recipients like: ${foundation.recipients}`
      : foundation?.targetUser
        ? `Target user: ${foundation.targetUser}`
        : null,
    foundation?.sharedContext
      ? `Shared context/topic: ${foundation.sharedContext}`
      : foundation?.painPoint
        ? `Pain point: ${foundation.painPoint}`
        : null,
    foundation?.desiredOutcome ? `Useful if they can respond with: ${foundation.desiredOutcome}` : null,
    foundation?.keyAssumptions?.length ? `Assumptions to test: ${foundation.keyAssumptions.join('; ')}` : null,
    foundation?.learningGoals?.length ? `Learning goals: ${foundation.learningGoals.join('; ')}` : null,
  ].filter(Boolean).join('\n');

  return {
    matchRubric,
    priorityRecipientTypes,
    lowFitSignals,
    positivePatterns: [],
    negativePatterns: [],
    calibrationNotes: ['Profile initialized from the project Foundation.'],
  };
}

export async function getLatestMatchProfile(projectId: string) {
  const [profile] = await db
    .select()
    .from(project_match_profiles)
    .where(eq(project_match_profiles.project_id, projectId))
    .orderBy(desc(project_match_profiles.version))
    .limit(1);
  return profile ?? null;
}

export async function ensureProjectMatchProfile(projectId: string, foundation: Foundation | null | undefined) {
  const existing = await getLatestMatchProfile(projectId);
  if (existing) return existing;

  const [created] = await db
    .insert(project_match_profiles)
    .values({
      project_id: projectId,
      version: 1,
      profile_json: foundationToMatchProfile(foundation),
      signal_count_at_generation: 0,
    })
    .returning();
  return created;
}

function patternForPerson(person: Person): string {
  const analysis = person.analysis && typeof person.analysis === 'object' ? person.analysis : {};
  const summary = typeof analysis.summary === 'string' ? analysis.summary : '';
  const why = typeof analysis.why_they_matter === 'string' ? analysis.why_they_matter : '';
  return [
    person.persona_type ? `${person.persona_type.replace('_', ' ')} profile` : null,
    [person.title, person.company].filter(Boolean).join(' at ') || null,
    summary || why || null,
  ].filter(Boolean).join(' - ').slice(0, 220);
}

function dedupe(values: string[], limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

export async function refreshProjectMatchProfileFromSignals(projectId: string, foundation: Foundation | null | undefined) {
  const latest = await ensureProjectMatchProfile(projectId, foundation);
  const rows = await db
    .select({ event: person_events, person: people })
    .from(person_events)
    .innerJoin(people, eq(person_events.person_id, people.id))
    .where(eq(people.project_id, projectId));

  const meaningful = rows.filter(({ event }) => {
    const weight = (event.metadata as { signalWeight?: unknown } | null)?.signalWeight;
    return typeof weight === 'number' && Math.abs(weight) >= 1;
  });

  if (meaningful.length < (latest.signal_count_at_generation ?? 0) + SIGNAL_REFRESH_THRESHOLD) {
    return latest;
  }

  const positivePatterns = dedupe(
    meaningful
      .filter(({ event }) => ((event.metadata as { signalWeight?: number } | null)?.signalWeight ?? 0) > 0)
      .sort((a, b) => (((b.event.metadata as { signalWeight?: number } | null)?.signalWeight ?? 0) - ((a.event.metadata as { signalWeight?: number } | null)?.signalWeight ?? 0)))
      .map(({ person }) => patternForPerson(person)),
  );
  const negativePatterns = dedupe(
    meaningful
      .filter(({ event }) => ((event.metadata as { signalWeight?: number } | null)?.signalWeight ?? 0) < 0)
      .sort((a, b) => (((a.event.metadata as { signalWeight?: number } | null)?.signalWeight ?? 0) - ((b.event.metadata as { signalWeight?: number } | null)?.signalWeight ?? 0)))
      .map(({ person }) => patternForPerson(person)),
  );

  const base = foundation ? foundationToMatchProfile(foundation) : latest.profile_json ?? foundationToMatchProfile(foundation);
  const profileJson: ProjectMatchProfileJson = {
    ...base,
    positivePatterns,
    negativePatterns,
    calibrationNotes: [
      `Updated from ${meaningful.length} project behavior signals.`,
      'Positive patterns come from bookmarked/sent/scheduled/successful outreach.',
      'Negative patterns come from not-interested outcomes; no-response is treated as weak evidence.',
    ],
  };

  const [created] = await db
    .insert(project_match_profiles)
    .values({
      project_id: projectId,
      version: (latest.version ?? 0) + 1,
      profile_json: profileJson,
      signal_count_at_generation: meaningful.length,
    })
    .returning();

  await db
    .update(people)
    .set({ match_status: 'stale', updated_at: new Date() })
    .where(and(eq(people.project_id, projectId), eq(people.match_status, 'current')));

  return created;
}

export function matchEventMetadata(
  person: Person,
  metadata: Record<string, unknown>,
  signalWeight: number,
) {
  return {
    ...metadata,
    signalWeight,
    matchSnapshot: {
      match_score: person.match_score,
      match_rank: person.match_rank ?? person.relevance_rank,
      match_profile_version: person.match_profile_version,
      match_status: person.match_status,
    },
  };
}
