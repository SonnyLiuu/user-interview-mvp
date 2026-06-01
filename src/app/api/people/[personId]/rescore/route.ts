import { NextRequest, NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, project_foundations, projects, users, type CrawledContent, type ProjectMatchProfileJson } from '@/lib/db/schema';
import { analyzePerson } from '@/lib/ai/analyze-person';
import { applyInformationDiscoveryBrief, getActiveInformationDiscoveryBrief } from '@/lib/information-discovery-context';
import { ensureProjectMatchProfile, matchRankForScore, normalizeMatchScore, scoreFromRank } from '@/lib/match-profile';
import type { Foundation, ProjectType } from '@/lib/backend-types';

type Params = { params: Promise<{ personId: string }> };

function foundationToAnalysisContext(
  foundation: Foundation | null,
  projectType: ProjectType,
  matchProfile?: { version: number; profile_json: ProjectMatchProfileJson | null } | null,
) {
  const profile = matchProfile?.profile_json;
  if (projectType !== 'networking') {
    return {
      project_type: projectType,
      idea_summary: [
        foundation?.summary,
        foundation?.desiredOutcome ? `Information Discovery outcome: ${foundation.desiredOutcome}` : null,
        foundation?.learningGoals?.length ? `Learning goals: ${foundation.learningGoals.join('; ')}` : null,
        foundation?.messageBoundaries?.length ? `Conversation boundaries: ${foundation.messageBoundaries.join('; ')}` : null,
      ].filter(Boolean).join('\n') || null,
      target_customer: foundation?.targetUser ?? null,
      key_assumptions: [
        ...(Array.isArray(foundation?.keyAssumptions) ? foundation.keyAssumptions : []),
        foundation?.painPoint,
        foundation?.valueProp,
        foundation?.targetUser,
        foundation?.desiredOutcome,
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
      most_promising_avenues: foundation?.idealPeopleTypes ?? null,
      match_rubric: profile?.matchRubric ?? foundation?.matchRubric ?? null,
      low_fit_signals: profile?.lowFitSignals ?? (Array.isArray(foundation?.messageBoundaries) ? foundation.messageBoundaries : []),
      match_profile_version: matchProfile?.version ?? null,
      positive_patterns: profile?.positivePatterns ?? [],
      negative_patterns: profile?.negativePatterns ?? [],
    };
  }

  const priorityRecipientTypes = Array.isArray(foundation?.priorityRecipientTypes)
    ? foundation.priorityRecipientTypes.filter((item): item is string => typeof item === 'string')
    : profile?.priorityRecipientTypes ?? foundation?.idealPeopleTypes ?? null;
  const lowFitSignals = Array.isArray(foundation?.lowFitSignals)
    ? foundation.lowFitSignals.filter((item): item is string => typeof item === 'string')
    : profile?.lowFitSignals ?? [];
  const senderContext = foundation?.senderContext;
  const desiredOutcome = foundation?.desiredOutcome;
  const personalizationStrategy = foundation?.personalizationStrategy;

  return {
    project_type: projectType,
    idea_summary: [
      foundation?.outreachGoal ?? foundation?.summary,
      senderContext ? `Sender context: ${senderContext}` : null,
      foundation?.sharedContext ? `Shared context: ${foundation.sharedContext}` : null,
      desiredOutcome ? `Desired outcome: ${desiredOutcome}` : null,
      personalizationStrategy ? `Personalization strategy: ${personalizationStrategy}` : null,
      foundation?.channelFormat ? `Channel format: ${foundation.channelFormat}` : null,
    ].filter(Boolean).join('\n'),
    target_customer: foundation?.recipients ?? foundation?.targetUser ?? null,
    key_assumptions: [
      foundation?.sharedContext,
      desiredOutcome,
      senderContext,
      personalizationStrategy,
      foundation?.tone,
      foundation?.channelFormat,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    most_promising_avenues: priorityRecipientTypes,
    match_rubric: profile?.matchRubric ?? foundation?.matchRubric ?? null,
    low_fit_signals: lowFitSignals,
    match_profile_version: matchProfile?.version ?? null,
    positive_patterns: profile?.positivePatterns ?? [],
    negative_patterns: profile?.negativePatterns ?? [],
  };
}

function contentText(content: CrawledContent | null): string {
  if (!content) return '';
  return typeof content.content === 'string' ? content.content.trim() : '';
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;
  const rows = await db
    .select({ person: people, projectType: projects.project_type })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(people.id, personId), eq(users.clerk_user_id, clerkUserId)))
    .limit(1);

  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const projectType = (row.projectType ?? 'startup') as ProjectType;
  const activeDiscoveryBrief = projectType === 'startup'
    ? await getActiveInformationDiscoveryBrief(row.person.project_id!)
    : null;
  if (projectType !== 'networking' && !activeDiscoveryBrief) {
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
      const contextualFoundation = activeDiscoveryBrief
        ? applyInformationDiscoveryBrief(foundation, activeDiscoveryBrief)
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
