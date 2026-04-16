import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users } from '@/lib/db/schema';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import { auth } from '@clerk/nextjs/server';
import { PersonDetailClient } from './PersonDetailClient';

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ slug: string; personId: string }>;
}) {
  const { slug, personId } = await params;

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect('/login');

  const lookup = await getProjectBySlugOrId(slug);
  if (!lookup?.project) redirect('/dashboard');
  const { project } = lookup;

  // Verify user owns the project
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

  // Load the person — must belong to this project
  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.project_id, project.id)));

  if (!person) notFound();

  return (
    <PersonDetailClient
      person={person}
      slug={slug}
    />
  );
}
