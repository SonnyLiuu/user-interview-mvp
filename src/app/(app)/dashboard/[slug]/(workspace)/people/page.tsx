import { redirect } from 'next/navigation';
import { and, isNull, or, gt, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users } from '@/lib/db/schema';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import { auth } from '@clerk/nextjs/server';
import { PeoplePageClient } from './PeoplePageClient';
import styles from './people-page.module.css';

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

  // Load active people: not yet on the board, and not expired
  const now = new Date();
  const activePeople = await db
    .select()
    .from(people)
    .where(
      and(
        eq(people.project_id, project.id),
        isNull(people.board_status),
        or(isNull(people.expires_at), gt(people.expires_at, now))
      )
    )
    .orderBy(people.created_at);

  return (
    <div className={styles.page}>
      <PeoplePageClient
        initialPeople={activePeople}
        projectId={project.id}
        slug={slug}
      />
    </div>
  );
}
