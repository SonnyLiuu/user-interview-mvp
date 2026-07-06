import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { call_prep, people } from '@/lib/db/schema';
import { listOutreachProjects } from '@/lib/backend-server';
import { requireOwnedProjectBySlug } from '@/lib/project-access';
import { BoardPageClient } from './BoardPageClient';

export const dynamic = 'force-dynamic';

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ outreachProjectId?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { project } = await requireOwnedProjectBySlug(slug);
  const requestedOutreachProjectId = Array.isArray(query?.outreachProjectId)
    ? query?.outreachProjectId[0]
    : query?.outreachProjectId;
  const outreachProjects = project.project_type === 'startup'
    ? await listOutreachProjects(project.id)
    : [];
  const selectedOutreachProject =
    outreachProjects.find((candidate) => (
      candidate.id === requestedOutreachProjectId && candidate.status !== 'archived'
    )) ?? null;
  const boardScopeFilter = project.project_type === 'startup' && selectedOutreachProject
    ? eq(people.outreach_project_id, selectedOutreachProject.id)
    : undefined;

  // `expires_at` is legacy-only; the board should reflect the durable project
  // pipeline for the selected outreach project, or the cumulative startup when
  // no outreach project is selected.
  const boardPeople = await db
    .select()
    .from(people)
    .where(boardScopeFilter ? and(eq(people.project_id, project.id), boardScopeFilter) : eq(people.project_id, project.id))
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
      key={`${project.id}:${selectedOutreachProject?.id ?? 'cumulative'}`}
      initialPeople={boardPeople}
      projectId={project.id}
      slug={slug}
      initialCallBriefPersonIds={callBriefPersonIds}
    />
  );
}
