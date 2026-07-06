import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people } from '@/lib/db/schema';
import { listOutreachProjects } from '@/lib/backend-server';
import type { OutreachProjectRecord } from '@/lib/backend-types';
import { getOutreachProjectTypeConfig } from '@/lib/outreach-projects';
import { requireOwnedProjectBySlug } from '@/lib/project-access';
import { tagModeForOutreachProjectType } from '@/components/people/persona-tags';
import { PeoplePageClient } from './PeoplePageClient';
import EntryGoalWelcome from '@/components/welcome/EntryGoalWelcome';
import styles from './people-page.module.css';

export const dynamic = 'force-dynamic';

function buildResearchOverview(project: OutreachProjectRecord | null) {
  if (!project) {
    return 'Add people you may want to interview to automatically research their background and fit before moving them into outreach.';
  }

  const config = getOutreachProjectTypeConfig(project.type);
  return `Deep research automatically finds personal websites, Github profiles, and more to generate an informed brief on their interview fit.`;
}

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ outreachProjectId?: string | string[]; welcome?: string }>;
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
  const researchTitle = selectedOutreachProject
    ? `${getOutreachProjectTypeConfig(selectedOutreachProject.type).label} Research`
    : 'Cumulative Research';
  const researchOverview = buildResearchOverview(selectedOutreachProject);
  const tagMode = project.project_type === 'startup'
    ? selectedOutreachProject
      ? tagModeForOutreachProjectType(selectedOutreachProject.type)
      : 'none'
    : 'none';

  // Cumulative shows every person in the startup; scoped outreach views contain
  // only people explicitly created for that outreach project.
  const now = new Date();
  const peopleFilters = selectedOutreachProject
    ? and(eq(people.project_id, project.id), eq(people.outreach_project_id, selectedOutreachProject.id))
    : eq(people.project_id, project.id);
  const activePeople = await db
    .select()
    .from(people)
    .where(peopleFilters)
    .orderBy(people.created_at);

  // Recover stale in-progress records — if after() was orphaned by a page refresh or
  // server restart, the status stays 'crawling'/'analyzing' forever. Reset to error
  // so the Retry button appears on next load.
  const STALE_MS = 10 * 60 * 1000;
  const staleThreshold = new Date(now.getTime() - STALE_MS);

  const staleIds = activePeople
    .filter(
      (p) =>
        (p.crawl_status === 'crawling' || p.analysis_status === 'analyzing') &&
        p.updated_at != null &&
        p.updated_at < staleThreshold
    )
    .map((p) => p.id);

  let peopleForClient = activePeople;

  if (staleIds.length > 0) {
    await db
      .update(people)
      .set({ crawl_status: 'error', analysis_status: 'error', crawl_error: 'Research timed out', updated_at: new Date() })
      .where(inArray(people.id, staleIds));

    const correctedAt = new Date();
    const staleSet = new Set(staleIds);
    peopleForClient = activePeople.map((p) =>
      staleSet.has(p.id)
        ? { ...p, crawl_status: 'error', analysis_status: 'error', crawl_error: 'Research timed out', updated_at: correctedAt }
        : p
    );
  }

  return (
    <div className={styles.page}>
      {query?.welcome === '1' && (
        <EntryGoalWelcome entryGoal={project.entry_goal} projectId={project.id} />
      )}
      <PeoplePageClient
        key={`${project.id}:${selectedOutreachProject?.id ?? 'all'}`}
        initialPeople={peopleForClient}
        projectId={project.id}
        outreachProjectId={selectedOutreachProject?.id ?? null}
        tagMode={tagMode}
        researchOverview={researchOverview}
        researchTitle={researchTitle}
        slug={slug}
      />
    </div>
  );
}
