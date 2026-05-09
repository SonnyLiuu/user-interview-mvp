import { redirect } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { call_prep, people, projects, users } from '@/lib/db/schema';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import { auth } from '@clerk/nextjs/server';
import { BoardPageClient } from './BoardPageClient';

export const dynamic = 'force-dynamic';

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect('/login');

  const lookup = await getProjectBySlugOrId(slug);
  if (!lookup?.project) redirect('/dashboard');
  const { project } = lookup;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerk_user_id, clerkUserId));

  if (!user) redirect('/dashboard');

  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, project.id), eq(projects.user_id, user.id)));

  if (!proj) redirect('/dashboard');

  // All people for this project. `expires_at` is legacy-only; the board should
  // reflect the durable project pipeline.
  const boardPeople = await db
    .select()
    .from(people)
    .where(eq(people.project_id, project.id))
    .orderBy(people.updated_at);

  const peopleIds = boardPeople.map((person) => person.id);
  const callBriefRows = peopleIds.length > 0
    ? await db
        .select({ personId: call_prep.person_id, content: call_prep.content })
        .from(call_prep)
        .where(and(inArray(call_prep.person_id, peopleIds), eq(call_prep.is_current, true)))
    : [];

  const callBriefPersonIds = callBriefRows
    .filter((row) => !!row.content)
    .map((row) => row.personId)
    .filter((id): id is string => !!id);

  return <BoardPageClient initialPeople={boardPeople} slug={slug} initialCallBriefPersonIds={callBriefPersonIds} />;
}
