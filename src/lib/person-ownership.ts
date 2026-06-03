import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users } from '@/lib/db/schema';

export async function getOwnedPersonWithProject(personId: string, clerkUserId: string) {
  const rows = await db
    .select({ person: people, project: projects })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(people.id, personId), eq(users.clerk_user_id, clerkUserId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function getOwnedPerson(personId: string, clerkUserId: string) {
  const row = await getOwnedPersonWithProject(personId, clerkUserId);
  return row?.person ?? null;
}

export async function getOwnedPersonForLocalUser(personId: string, userId: string) {
  const rows = await db
    .select({ person: people, project: projects })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .where(and(eq(people.id, personId), eq(projects.user_id, userId)))
    .limit(1);

  return rows[0] ?? null;
}
