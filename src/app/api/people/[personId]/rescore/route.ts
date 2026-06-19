import { NextRequest, NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, project_foundations, type CrawledContent } from '@/lib/db/schema';
import { analyzePerson } from '@/lib/ai/analyze-person';
import { applyIdeaValidationBrief, getActiveIdeaValidationBrief } from '@/lib/idea-validation-context';
import { ensureProjectMatchProfile, matchRankForScore, normalizeMatchScore, scoreFromRank } from '@/lib/match-profile';
import { foundationToAnalysisContext } from '@/lib/person-analysis-context';
import { getOwnedPersonWithProject } from '@/lib/person-ownership';
import type { Foundation, ProjectType } from '@/lib/backend-types';

type Params = { params: Promise<{ personId: string }> };

function contentText(content: CrawledContent | null): string {
  if (!content) return '';
  return typeof content.content === 'string' ? content.content.trim() : '';
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const row = await getOwnedPersonWithProject(personId, clerkUserId);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const projectType = (row.project.project_type ?? 'startup') as ProjectType;
  const activeIdeaValidationBrief = projectType === 'startup'
    ? await getActiveIdeaValidationBrief(row.person.project_id!, row.person.outreach_project_id)
    : null;
  if (projectType !== 'networking' && !activeIdeaValidationBrief) {
    return NextResponse.json({ error: 'Only people with an active outreach match profile can be rescored' }, { status: 400 });
  }
  const sourceText = contentText(row.person.crawled_content as CrawledContent | null);
  if (!sourceText) return NextResponse.json({ error: 'No stored source material to rescore' }, { status: 400 });

  await db
    .update(people)
    .set({ match_status: 'pending', updated_at: new Date() })
    .where(eq(people.id, personId));

  after(async () => {
    try {
      const [foundationRow] = await db
        .select()
        .from(project_foundations)
        .where(eq(project_foundations.project_id, row.person.project_id!))
        .orderBy(desc(project_foundations.generated_at))
        .limit(1);
      const foundation = foundationRow?.foundation_json as Foundation | null | undefined;
      const contextualFoundation = activeIdeaValidationBrief
        ? applyIdeaValidationBrief(foundation, activeIdeaValidationBrief)
        : foundation;
      const matchProfile = await ensureProjectMatchProfile(row.person.project_id!, contextualFoundation);
      const analysis = await analyzePerson(sourceText, foundationToAnalysisContext(contextualFoundation ?? null, projectType, matchProfile));
      const matchScore = normalizeMatchScore(analysis.match_score) ?? scoreFromRank(analysis.relevance_rank) ?? null;
      const matchRank = matchScore === null ? analysis.relevance_rank ?? null : matchRankForScore(matchScore);

      await db
        .update(people)
        .set({
          analysis,
          analysis_status: 'complete',
          relevance_rank: matchRank,
          match_score: matchScore,
          match_rank: matchRank,
          match_factors: analysis.match_factors ?? null,
          match_explanation: analysis.match_explanation ?? analysis.why_they_matter ?? null,
          match_profile_version: matchProfile.version,
          match_status: 'current',
          updated_at: new Date(),
        })
        .where(eq(people.id, personId));
    } catch (err) {
      console.error(`Rescore failed for person ${personId}:`, err);
      await db
        .update(people)
        .set({ match_status: 'error', updated_at: new Date() })
        .where(eq(people.id, personId));
    }
  });

  return NextResponse.json({ status: 'pending' }, { status: 202 });
}
