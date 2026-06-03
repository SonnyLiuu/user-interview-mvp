import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, project_foundations } from '@/lib/db/schema';
import { applyInformationDiscoveryBrief, getActiveInformationDiscoveryBrief } from '@/lib/information-discovery-context';
import { getOwnedPersonWithProject } from '@/lib/person-ownership';
import { hasResearchSourceMaterial, markPersonResearchError, runPersonResearchJob } from '@/lib/person-research';
import type { Foundation, ProjectType } from '@/lib/backend-types';

type Params = { params: Promise<{ personId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { personId } = await params;

  const owned = await getOwnedPersonWithProject(personId, clerkUserId);
  const person = owned?.person;
  const projectType = (owned?.project.project_type ?? 'startup') as ProjectType;
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!hasResearchSourceMaterial(person)) {
    await markPersonResearchError(personId, 'No source URLs or pasted text to analyze');
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
    await markPersonResearchError(personId, 'Project foundation is required before analyzing people');
    return NextResponse.json(
      { error: 'Project foundation is required before analyzing people' },
      { status: 400 },
    );
  }

  const activeDiscoveryBrief = projectType === 'startup'
    ? await getActiveInformationDiscoveryBrief(person.project_id!)
    : null;
  const contextualFoundation = activeDiscoveryBrief
    ? applyInformationDiscoveryBrief(foundation, activeDiscoveryBrief)
    : foundation;
  const usesMatchProfile = projectType === 'networking' || !!activeDiscoveryBrief;

  // Mark as crawling immediately so the UI can show the loading state
  await db
    .update(people)
    .set({ crawl_status: 'crawling', crawl_error: null, match_status: usesMatchProfile ? 'pending' : person.match_status, updated_at: new Date() })
    .where(eq(people.id, personId));

  // Run crawl + analysis after the response is sent so the client gets 202 instantly
  after(() => runPersonResearchJob({
    person,
    projectType,
    contextualFoundation,
    usesMatchProfile,
  }));

  return NextResponse.json({ status: 'crawling' }, { status: 202 });
}
