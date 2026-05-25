import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users, project_foundations } from '@/lib/db/schema';
import { crawlUrls, CrawlDepth } from '@/lib/firecrawl';
import { analyzePerson } from '@/lib/ai/analyze-person';
import type { Foundation, ProjectType } from '@/lib/backend-types';

type Params = { params: Promise<{ personId: string }> };

function foundationToAnalysisContext(foundation: Foundation | null, projectType: ProjectType) {
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
      ? [foundation.painPoint, foundation.valueProp, foundation.targetUser].filter(Boolean)
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
    .set({ crawl_status: 'crawling', crawl_error: null, updated_at: new Date() })
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

      if (sourceUrls.length) {
        try {
          crawledText = await crawlUrls(
            sourceUrls,
            (person.research_depth as CrawlDepth) ?? 'deep'
          );
        } catch (err) {
          if (!userText) {
            throw err;
          }
          crawlWarning = err instanceof Error
            ? `Some URLs could not be read: ${err.message}`
            : 'Some URLs could not be read.';
        }
      }

      const rawContent = combineSourceMaterial(userText, crawledText, crawlWarning);

      if (cancelled) return;

      await db
        .update(people)
        .set({
          crawled_content: crawlWarning
            ? { content: rawContent, metadata: { crawl_warning: crawlWarning } }
            : { content: rawContent },
          crawl_status: 'complete',
          crawl_error: crawlWarning,
          analysis_status: 'analyzing',
          updated_at: new Date(),
        })
        .where(eq(people.id, personId));

      const projectContext = foundationToAnalysisContext(foundation, projectType);

      // Analyze
      const analysis = await analyzePerson(rawContent, projectContext);

      if (cancelled) return;

      await db
        .update(people)
        .set({
          analysis,
          analysis_status: 'complete',
          // Write extracted identity back to dedicated columns
          name: analysis.name ?? person.name,
          title: analysis.title ?? person.title,
          company: analysis.company ?? person.company,
          persona_type: analysis.persona_type ?? person.persona_type,
          relevance_rank: analysis.relevance_rank ?? null,
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
          updated_at: new Date(),
        })
        .where(eq(people.id, personId));
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  });

  return NextResponse.json({ status: 'crawling' }, { status: 202 });
}
