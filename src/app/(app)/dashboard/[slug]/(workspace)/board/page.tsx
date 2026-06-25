import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { call_prep, people } from '@/lib/db/schema';
import { requireOwnedProjectBySlug } from '@/lib/project-access';
import { BoardPageClient } from './BoardPageClient';

export const dynamic = 'force-dynamic';

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { project } = await requireOwnedProjectBySlug(slug);

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

  return (
    <BoardPageClient
      key={project.id}
      initialPeople={boardPeople}
      projectId={project.id}
      slug={slug}
      initialCallBriefPersonIds={callBriefPersonIds}
    />
  );
}
