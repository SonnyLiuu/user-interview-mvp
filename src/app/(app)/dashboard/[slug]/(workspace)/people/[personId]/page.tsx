import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { call_prep, outreach, outreach_projects, people, transcripts } from '@/lib/db/schema';
import { tagModeForOutreachProjectType } from '@/components/people/persona-tags';
import { requireOwnedProjectBySlug } from '@/lib/project-access';
import { PersonDetailClient } from './PersonDetailClient';

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ slug: string; personId: string }>;
}) {
  const { slug, personId } = await params;
  const { project } = await requireOwnedProjectBySlug(slug);

  // Load the person — must belong to this project
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.project_id, project.id)));

  if (!person) notFound();

  const [personOutreachProject] = person.outreach_project_id
    ? await db
      .select({ type: outreach_projects.type })
      .from(outreach_projects)
      .where(eq(outreach_projects.id, person.outreach_project_id))
      .limit(1)
    : [];
  const tagMode = project.project_type === 'startup'
    ? tagModeForOutreachProjectType(personOutreachProject?.type ?? 'idea_validation')
    : 'none';

  const [initialOutreach] = await db
    .select({ id: outreach.id, content: outreach.content })
    .from(outreach)
    .where(and(eq(outreach.person_id, personId), eq(outreach.is_current, true)))
    .orderBy(desc(outreach.generated_at))
    .limit(1);

  const [initialCallPrep] = await db
    .select({ id: call_prep.id, content: call_prep.content })
    .from(call_prep)
    .where(and(eq(call_prep.person_id, personId), eq(call_prep.is_current, true)))
    .orderBy(desc(call_prep.generated_at))
    .limit(1);

  const initialTranscripts = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.person_id, personId))
    .orderBy(desc(transcripts.created_at));

  return (
    <PersonDetailClient
      person={person}
      slug={slug}
      projectType={project.project_type}
      tagMode={tagMode}
      initialOutreach={initialOutreach ?? null}
      initialCallPrep={initialCallPrep ?? null}
      initialTranscripts={initialTranscripts}
    />
  );
}
