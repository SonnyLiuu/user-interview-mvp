import 'server-only';

import { eq } from 'drizzle-orm';
import { analyzePerson } from '@/lib/ai/analyze-person';
import { discoverPersonLinks } from '@/lib/ai/discover-person-links';
import type { Foundation, ProjectType } from '@/lib/backend-types';
import { db } from '@/lib/db';
import { people, type DiscoveredUrl, type Person } from '@/lib/db/schema';
import { crawlUrlsBestEffort, type CrawlDepth, type CrawlUrlOutcome } from '@/lib/firecrawl';
import { captureGlobalPersonFromResearch } from '@/lib/global-people';
import { ensureProjectMatchProfile, matchRankForScore, normalizeMatchScore, scoreFromRank } from '@/lib/match-profile';
import { foundationToAnalysisContext, sanitizeIdentityField } from '@/lib/person-analysis-context';

const PERSON_RESEARCH_TIMEOUT_MS = 3 * 60 * 1000;

export async function markPersonResearchError(personId: string, message: string) {
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

export function userProvidedSourceText(person: Person) {
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

export function hasResearchSourceMaterial(person: Person) {
  return (person.source_urls?.length ?? 0) > 0 || userProvidedSourceText(person).length > 0;
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

async function runPersonResearchWork(args: {
  person: Person;
  projectType: ProjectType;
  contextualFoundation: Foundation;
  usesMatchProfile: boolean;
  isCancelled: () => boolean;
}) {
  const { person, projectType, contextualFoundation, usesMatchProfile, isCancelled } = args;
  const personId = person.id;
  const sourceUrls = person.source_urls ?? [];
  const userText = userProvidedSourceText(person);
  let crawledText = '';
  let crawlWarning: string | null = null;
  let crawlOutcomes: CrawlUrlOutcome[] = [];
  const discoveredCandidates: Awaited<ReturnType<typeof discoverPersonLinks>> = [];

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

  if (isCancelled()) return;

  if (mergedUrls.length) {
    try {
      const crawlResult = await crawlUrlsBestEffort(
        mergedUrls,
        (person.research_depth as CrawlDepth) ?? 'deep',
        isCancelled,
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

  if (isCancelled()) return;

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

  const matchProfile = usesMatchProfile
    ? await ensureProjectMatchProfile(person.project_id!, contextualFoundation)
    : null;
  const projectContext = foundationToAnalysisContext(contextualFoundation, projectType, matchProfile);
  const analysis = await analyzePerson(rawContent, projectContext);

  const sanitizedTitle = sanitizeIdentityField(analysis.title);
  const sanitizedCompany = sanitizeIdentityField(analysis.company);
  const matchScore = usesMatchProfile
    ? (normalizeMatchScore(analysis.match_score) ?? scoreFromRank(analysis.relevance_rank) ?? null)
    : null;
  const matchRank = matchScore === null ? analysis.relevance_rank ?? null : matchRankForScore(matchScore);

  if (isCancelled()) return;

  await db
    .update(people)
    .set({
      analysis,
      analysis_status: 'complete',
      name: analysis.name ?? person.name,
      title: sanitizedTitle ?? person.title,
      company: sanitizedCompany ?? person.company,
      persona_type: analysis.persona_type ?? person.persona_type,
      relevance_rank: matchRank ?? analysis.relevance_rank ?? null,
      match_score: matchScore,
      match_rank: matchRank,
      match_factors: usesMatchProfile ? analysis.match_factors ?? null : null,
      match_explanation: usesMatchProfile ? analysis.match_explanation ?? analysis.why_they_matter ?? null : null,
      match_profile_version: usesMatchProfile ? matchProfile?.version ?? null : null,
      match_status: usesMatchProfile ? 'current' : null,
      updated_at: new Date(),
    })
    .where(eq(people.id, personId));

  try {
    await captureGlobalPersonFromResearch({
      person: {
        ...person,
        name: analysis.name ?? person.name,
        title: sanitizedTitle ?? person.title,
        company: sanitizedCompany ?? person.company,
        discovered_urls: discoveredUrls,
      },
      analysis,
    });
  } catch (err) {
    console.warn(`Global person capture failed for person ${personId}:`, err instanceof Error ? err.message : err);
  }
}

export async function runPersonResearchJob(args: {
  person: Person;
  projectType: ProjectType;
  contextualFoundation: Foundation;
  usesMatchProfile: boolean;
}) {
  let cancelled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      cancelled = true;
      reject(new Error('Research timed out after 3 minutes'));
    }, PERSON_RESEARCH_TIMEOUT_MS);
  });
  // Prevent unhandled rejection when `work` wins the race.
  timeout.catch(() => {});

  const work = runPersonResearchWork({
    ...args,
    isCancelled: () => cancelled,
  });

  try {
    await Promise.race([work, timeout]);
  } catch (err) {
    console.error(`Crawl/analysis failed for person ${args.person.id}:`, err);
    await markPersonResearchError(
      args.person.id,
      err instanceof Error ? err.message : 'Unknown error',
    );
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
