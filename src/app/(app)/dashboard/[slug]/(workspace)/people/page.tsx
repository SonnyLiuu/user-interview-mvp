import { redirect } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users } from '@/lib/db/schema';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import { auth } from '@clerk/nextjs/server';
import { PeoplePageClient } from './PeoplePageClient';
import styles from './people-page.module.css';

export const dynamic = 'force-dynamic';

export default async function PeoplePage({
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

  // Resolve the user's DB id
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerk_user_id, clerkUserId));

  if (!user) redirect('/dashboard');

  // Verify this project belongs to the user
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, project.id), eq(projects.user_id, user.id)));

  if (!proj) redirect('/dashboard');

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
