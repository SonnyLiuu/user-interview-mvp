import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people } from '@/lib/db/schema';
import { requireOwnedProjectBySlug } from '@/lib/project-access';
import { PeoplePageClient } from './PeoplePageClient';
import styles from './people-page.module.css';

export const dynamic = 'force-dynamic';

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { project } = await requireOwnedProjectBySlug(slug);

  // Load all people for this project. `expires_at` is legacy-only; researched
  // people are project records and should not disappear from the workspace.
  const now = new Date();
  const activePeople = await db
    .select()
    .from(people)
    .where(eq(people.project_id, project.id))
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
      <PeoplePageClient
        initialPeople={peopleForClient}
        projectId={project.id}
        slug={slug}
      />
    </div>
  );
}
