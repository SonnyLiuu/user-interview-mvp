import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users, project_briefs } from '@/lib/db/schema';
import { crawlUrls, CrawlDepth } from '@/lib/firecrawl';
import { analyzePerson } from '@/lib/ai/analyze-person';

type Params = { params: Promise<{ personId: string }> };

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
    return NextResponse.json({ error: 'No source URLs to crawl' }, { status: 400 });
  }

  // Mark as crawling immediately so the UI can show the loading state
  await db
    .update(people)
    .set({ crawl_status: 'crawling', crawl_error: null, updated_at: new Date() })
    .where(eq(people.id, personId));

  // Run crawl + analysis after the response is sent so the client gets 202 instantly
  after(async () => {
    try {
      // Crawl
      const rawContent = await crawlUrls(
        person.source_urls!,
        (person.research_depth as CrawlDepth) ?? 'deep'
      );

      await db
        .update(people)
        .set({
          crawled_content: { content: rawContent },
          crawl_status: 'complete',
          analysis_status: 'analyzing',
          updated_at: new Date(),
        })
        .where(eq(people.id, personId));

      // Fetch project brief for grounding the analysis
      const briefs = await db
        .select()
        .from(project_briefs)
        .where(and(eq(project_briefs.project_id, person.project_id!), eq(project_briefs.is_current, true)))
        .orderBy(desc(project_briefs.generated_at))
        .limit(1);

      const brief = briefs[0];
      const projectContext = {
        idea_summary: brief?.idea_summary ?? null,
        target_customer: null,
        key_assumptions: brief?.assumptions?.map((a) => a.assumption) ?? null,
        most_promising_avenues: brief?.most_promising_avenues ?? null,
      };

      // Analyze
      const analysis = await analyzePerson(rawContent, projectContext);

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
