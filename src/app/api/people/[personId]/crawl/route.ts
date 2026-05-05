import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users, project_foundations } from '@/lib/db/schema';
import { crawlUrls, CrawlDepth } from '@/lib/firecrawl';
import { analyzePerson } from '@/lib/ai/analyze-person';
import type { Foundation } from '@/lib/backend-types';

type Params = { params: Promise<{ personId: string }> };

function foundationToAnalysisContext(foundation: Foundation | null) {
  return {
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

export async function POST(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;

  // Verify ownership and fetch person data
  const rows = await db
    .select({ person: people })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(people.id, personId), eq(users.clerk_user_id, clerkUserId)))
    .limit(1);

  const person = rows[0]?.person;
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!person.source_urls?.length) {
    await markResearchError(personId, 'No source URLs to crawl');
    return NextResponse.json({ error: 'No source URLs to crawl' }, { status: 400 });
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

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        cancelled = true;
        reject(new Error('Research timed out after 3 minutes'));
      }, TIMEOUT_MS)
    );

    const work = (async () => {
      // Crawl
      const rawContent = await crawlUrls(
        person.source_urls!,
        (person.research_depth as CrawlDepth) ?? 'deep'
      );

      if (cancelled) return;

      await db
        .update(people)
        .set({
          crawled_content: { content: rawContent },
          crawl_status: 'complete',
          analysis_status: 'analyzing',
          updated_at: new Date(),
        })
        .where(eq(people.id, personId));

      const projectContext = foundationToAnalysisContext(foundation);

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
    }
  });

  return NextResponse.json({ status: 'crawling' }, { status: 202 });
}
