import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users, project_foundations } from '@/lib/db/schema';
import { crawlUrlsBestEffort, CrawlDepth, type CrawlUrlOutcome } from '@/lib/firecrawl';
import { analyzePerson } from '@/lib/ai/analyze-person';
import { discoverPersonLinks } from '@/lib/ai/discover-person-links';
import { ensureProjectMatchProfile, matchRankForScore, normalizeMatchScore, scoreFromRank } from '@/lib/match-profile';
import type { Foundation, ProjectType } from '@/lib/backend-types';
import type { DiscoveredUrl, ProjectMatchProfileJson } from '@/lib/db/schema';

type Params = { params: Promise<{ personId: string }> };

// Drop AI-extracted identity fields that are obviously raw profile dumps
// rather than a real title/company. Anything over this length, or that
// contains LinkedIn UI cruft, is the model failing to extract structure.
const MAX_IDENTITY_FIELD_CHARS = 140;
const IDENTITY_GARBAGE_RE = /\b(?:followers?|Follow|Message More|Featured Post|Contact info|Activity|Posts? Comments? Videos? Images? Articles?|View .+?'s profile)\b/i;

function sanitizeIdentityField(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_IDENTITY_FIELD_CHARS) return null;
  if (IDENTITY_GARBAGE_RE.test(trimmed)) return null;
  return trimmed;
}

function foundationToAnalysisContext(
  foundation: Foundation | null,
  projectType: ProjectType,
  matchProfile?: { version: number; profile_json: ProjectMatchProfileJson | null } | null,
) {
  if (projectType === 'networking') {
    const profile = matchProfile?.profile_json;
    const requiredMentions = Array.isArray(foundation?.requiredMentions) ? foundation.requiredMentions : [];
    const optionalMentions = Array.isArray(foundation?.optionalMentions) ? foundation.optionalMentions : [];
    const boundaries = Array.isArray(foundation?.messageBoundaries) ? foundation.messageBoundaries : [];
    const senderContext = foundation?.senderContext;
    const desiredOutcome = foundation?.desiredOutcome;
    const personalizationStrategy = foundation?.personalizationStrategy;
    const priorityRecipientTypes = Array.isArray(foundation?.priorityRecipientTypes)
      ? foundation.priorityRecipientTypes.filter((item): item is string => typeof item === 'string')
      : profile?.priorityRecipientTypes ?? null;
    const lowFitSignals = Array.isArray(foundation?.lowFitSignals)
      ? foundation.lowFitSignals.filter((item): item is string => typeof item === 'string')
      : profile?.lowFitSignals ?? [];
    const keyAssumptions = foundation
      ? [
          foundation.sharedContext ?? foundation.painPoint,
          desiredOutcome,
          senderContext,
          personalizationStrategy,
          foundation.tone,
          foundation.channelFormat,
        ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : null;
    return {
      project_type: projectType,
      idea_summary: foundation
        ? [
            foundation.outreachGoal ?? foundation.summary,
            senderContext ? `Sender context: ${senderContext}` : null,
            foundation.sharedContext ? `Shared context: ${foundation.sharedContext}` : null,
            requiredMentions.length ? `Required mentions: ${requiredMentions.join('; ')}` : null,
            optionalMentions.length ? `Optional mentions: ${optionalMentions.join('; ')}` : null,
            desiredOutcome ? `Desired outcome: ${desiredOutcome}` : null,
            personalizationStrategy ? `Personalization strategy: ${personalizationStrategy}` : null,
            foundation.tone ? `Tone: ${foundation.tone}` : null,
            foundation.channelFormat ? `Channel format: ${foundation.channelFormat}` : null,
            boundaries.length ? `Message boundaries: ${boundaries.join('; ')}` : null,
          ].filter(Boolean).join('\n')
        : null,
      target_customer: foundation?.recipients ?? foundation?.targetUser ?? null,
      key_assumptions: keyAssumptions,
      most_promising_avenues: priorityRecipientTypes,
      match_rubric: profile?.matchRubric ?? foundation?.matchRubric ?? null,
      low_fit_signals: lowFitSignals,
      match_profile_version: matchProfile?.version ?? null,
      positive_patterns: profile?.positivePatterns ?? [],
      negative_patterns: profile?.negativePatterns ?? [],
    };
  }

  return {
    project_type: projectType,
    idea_summary: foundation
      ? [
          foundation.summary,
          foundation.painPoint ? `Pain point: ${foundation.painPoint}` : null,
          foundation.valueProp ? `Value proposition: ${foundation.valueProp}` : null,
        ].filter(Boolean).join('\n')
      : null,
    target_customer: foundation?.targetUser ?? null,
    key_assumptions: foundation
      ? [foundation.painPoint, foundation.valueProp, foundation.targetUser]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : null,
    most_promising_avenues: foundation?.idealPeopleTypes ?? null,
  };
}

async function markResearchError(personId: string, message: string) {
  await db
    .update(people)
    .set({
      crawl_status: 'error',
      analysis_status: 'error',
      crawl_error: message,
      match_status: 'error',
      updated_at: new Date(),
    })
    .where(eq(people.id, personId));
}

function isProbablyUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function userProvidedSourceText(person: typeof people.$inferSelect) {
  const parts: string[] = [];
  const rawPastedText = person.raw_pasted_text?.trim();
  if (rawPastedText) {
    parts.push(`USER-PASTED PROFILE TEXT:\n${rawPastedText}`);
  }

  const additionalText = (person.additional_context ?? [])
    .map((item) => item.trim())
    .filter((item) => item && !isProbablyUrl(item));

  if (additionalText.length) {
    parts.push(`ADDITIONAL USER-PASTED CONTEXT:\n${additionalText.join('\n\n---\n\n')}`);
  }

  return parts.join('\n\n');
}

function combineSourceMaterial(userText: string, crawledText: string, crawlWarning: string | null) {
  return [
    userText || null,
    crawledText ? `CRAWLED WEB SOURCES:\n${crawledText}` : null,
    crawlWarning ? `CRAWL NOTE:\n${crawlWarning}` : null,
  ].filter(Boolean).join('\n\n');
}

function normalizeUrlKey(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, '').toLowerCase();
  }
}

function discoveredWithCrawlStatus(
  candidates: Awaited<ReturnType<typeof discoverPersonLinks>>,
  outcomes: CrawlUrlOutcome[],
  fallbackError?: string,
): DiscoveredUrl[] {
  if (!candidates.length) return [];
  const nowIso = new Date().toISOString();
  const outcomesByUrl = new Map(outcomes.map((outcome) => [normalizeUrlKey(outcome.url), outcome]));
  return candidates.map((candidate) => {
    const outcome = outcomesByUrl.get(normalizeUrlKey(candidate.url));
    if (outcome?.status === 'included') {
      return {
        ...candidate,
        crawl_status: 'included',
        added_at: nowIso,
      };
    }
    return {
      ...candidate,
      crawl_status: 'failed',
      crawl_error: outcome?.error ?? fallbackError ?? 'Could not crawl this URL',
      added_at: nowIso,
    };
  });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;

  // Verify ownership and fetch person data
  const rows = await db
    .select({ person: people, projectType: projects.project_type })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(people.id, personId), eq(users.clerk_user_id, clerkUserId)))
    .limit(1);

  const person = rows[0]?.person;
  const projectType = (rows[0]?.projectType ?? 'startup') as ProjectType;
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sourceUrls = person.source_urls ?? [];
  const userText = userProvidedSourceText(person);

  if (!sourceUrls.length && !userText) {
    await markResearchError(personId, 'No source URLs or pasted text to analyze');
    return NextResponse.json({ error: 'No source URLs or pasted text to analyze' }, { status: 400 });
  }

  const foundations = await db
    .select()
    .from(project_foundations)
    .where(eq(project_foundations.project_id, person.project_id!))
    .orderBy(desc(project_foundations.generated_at))
    .limit(1);
  const foundation = foundations[0]?.foundation_json as Foundation | null | undefined;

  if (!foundation) {
    await markResearchError(personId, 'Project foundation is required before analyzing people');
    return NextResponse.json(
      { error: 'Project foundation is required before analyzing people' },
      { status: 400 },
    );
  }

  // Mark as crawling immediately so the UI can show the loading state
  await db
    .update(people)
    .set({ crawl_status: 'crawling', crawl_error: null, match_status: projectType === 'networking' ? 'pending' : person.match_status, updated_at: new Date() })
    .where(eq(people.id, personId));

  // Run crawl + analysis after the response is sent so the client gets 202 instantly
  after(async () => {
    const TIMEOUT_MS = 3 * 60 * 1000;
    let cancelled = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        cancelled = true;
        reject(new Error('Research timed out after 3 minutes'));
      }, TIMEOUT_MS);
    });
    // Prevent unhandled rejection when `work` wins the race.
    timeout.catch(() => {});

    const work = (async () => {
      let crawledText = '';
      let crawlWarning: string | null = null;
      let crawlOutcomes: CrawlUrlOutcome[] = [];
      let discoveredCandidates: Awaited<ReturnType<typeof discoverPersonLinks>> = [];

      // Auto-discover additional sources (github, personal site, blog) from
      // pasted LinkedIn text. Best-effort: failures fall through to crawling
      // only what the user gave us.
      const mergedUrls = [...sourceUrls];
      const pastedForDiscovery = person.raw_pasted_text?.trim();
      if (pastedForDiscovery) {
        try {
          const candidates = await discoverPersonLinks(pastedForDiscovery, sourceUrls);
          if (candidates.length) {
            const existing = new Set(sourceUrls.map(normalizeUrlKey));
            for (const candidate of candidates) {
              const key = normalizeUrlKey(candidate.url);
              if (existing.has(key)) continue;
              discoveredCandidates.push(candidate);
              mergedUrls.push(candidate.url);
              existing.add(key);
            }
          }
        } catch (err) {
          console.warn(`Discovery failed for person ${personId}:`, err instanceof Error ? err.message : err);
        }
      }

      if (cancelled) return;

      if (mergedUrls.length) {
        try {
          const crawlResult = await crawlUrlsBestEffort(
            mergedUrls,
            (person.research_depth as CrawlDepth) ?? 'deep',
            () => cancelled,
          );
          crawledText = crawlResult.content;
          crawlOutcomes = crawlResult.outcomes;
          const failedCount = crawlOutcomes.filter((outcome) => outcome.status === 'failed').length;
          if (failedCount > 0) {
            crawlWarning = `${failedCount} source${failedCount === 1 ? '' : 's'} could not be read.`;
          }
        } catch (err) {
          if (!userText) {
            throw err;
          }
          crawlWarning = err instanceof Error
            ? `Some URLs could not be read: ${err.message}`
            : 'Some URLs could not be read.';
          crawlOutcomes = mergedUrls.map((url) => ({
            url,
            status: 'failed',
            error: crawlWarning ?? 'Could not crawl this URL',
          }));
        }
      }

      if (cancelled) return;

      if (!userText && !crawledText) {
        const failed = crawlOutcomes.find((outcome) => outcome.status === 'failed');
        throw new Error(failed?.error ?? 'No source material could be read');
      }

      const rawContent = combineSourceMaterial(userText, crawledText, crawlWarning);

      const discoveredUrls = discoveredWithCrawlStatus(discoveredCandidates, crawlOutcomes, crawlWarning ?? undefined);

      await db
        .update(people)
        .set({
          discovered_urls: discoveredUrls,
          crawled_content: crawlWarning
            ? { content: rawContent, metadata: { crawl_warning: crawlWarning } }
            : { content: rawContent },
          crawl_status: 'complete',
          crawl_error: crawlWarning,
          analysis_status: 'analyzing',
          updated_at: new Date(),
        })
        .where(eq(people.id, personId));

      const matchProfile = projectType === 'networking'
        ? await ensureProjectMatchProfile(person.project_id!, foundation)
        : null;
      const projectContext = foundationToAnalysisContext(foundation, projectType, matchProfile);

      // Analyze
      const analysis = await analyzePerson(rawContent, projectContext);
      // The model occasionally spills raw profile text into title/company
      // (LinkedIn pastes are the worst offender). Anything over identity-field
      // length is garbage — drop it and fall back to whatever was already set.
      const sanitizedTitle = sanitizeIdentityField(analysis.title);
      const sanitizedCompany = sanitizeIdentityField(analysis.company);
      const matchScore = projectType === 'networking'
        ? (normalizeMatchScore(analysis.match_score) ?? scoreFromRank(analysis.relevance_rank) ?? null)
        : null;
      const matchRank = matchScore === null ? analysis.relevance_rank ?? null : matchRankForScore(matchScore);

      if (cancelled) return;

      await db
        .update(people)
        .set({
          analysis,
          analysis_status: 'complete',
          // Write extracted identity back to dedicated columns
          name: analysis.name ?? person.name,
          title: sanitizedTitle ?? person.title,
          company: sanitizedCompany ?? person.company,
          persona_type: analysis.persona_type ?? person.persona_type,
          relevance_rank: matchRank ?? analysis.relevance_rank ?? null,
          match_score: matchScore,
          match_rank: matchRank,
          match_factors: projectType === 'networking' ? analysis.match_factors ?? null : null,
          match_explanation: projectType === 'networking' ? analysis.match_explanation ?? analysis.why_they_matter ?? null : null,
          match_profile_version: projectType === 'networking' ? matchProfile?.version ?? null : null,
          match_status: projectType === 'networking' ? 'current' : null,
          updated_at: new Date(),
        })
        .where(eq(people.id, personId));
    })();

    try {
      await Promise.race([work, timeout]);
    } catch (err) {
      console.error(`Crawl/analysis failed for person ${personId}:`, err);
      await db
        .update(people)
        .set({
          crawl_status: 'error',
          analysis_status: 'error',
          crawl_error: err instanceof Error ? err.message : 'Unknown error',
          match_status: 'error',
          updated_at: new Date(),
        })
        .where(eq(people.id, personId));
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  });

  return NextResponse.json({ status: 'crawling' }, { status: 202 });
}
