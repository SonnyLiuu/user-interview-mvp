import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getProjectBySlugOrId } from '@/lib/backend-server';
import type { ProjectLookupPayload } from '@/lib/backend-types';
import { db } from '@/lib/db';
import { projects, users } from '@/lib/db/schema';

type OwnedProject = {
  clerkUserId: string;
  userId: string;
  project: ProjectLookupPayload['project'];
  foundationExists: boolean;
};

export async function requireOwnedProjectBySlug(slug: string): Promise<OwnedProject> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect('/login');

  const lookup = await getProjectBySlugOrId(slug);
  if (!lookup?.project) redirect('/dashboard');

  const [owned] = await db
    .select({ userId: users.id })
    .from(projects)
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(projects.id, lookup.project.id), eq(users.clerk_user_id, clerkUserId)));

  if (!owned) redirect('/dashboard');

  return {
    clerkUserId,
    userId: owned.userId,
    project: lookup.project,
    foundationExists: lookup.foundationExists,
  };
}
