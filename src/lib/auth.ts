import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export async function getAuthenticatedUserId(): Promise<string> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error('Unauthenticated');

  // Fast path — already in DB with clerk_user_id
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerk_user_id, clerkUserId))
    .limit(1);

  if (existing) return existing.id;

  // Fallback — webhook hasn't fired yet (local dev) or user predates clerk_user_id column.
  // Fetch full user from Clerk and upsert.
  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error('Unauthenticated');

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email;
  const avatar_url = clerkUser.imageUrl ?? '';

  // Try to find an existing row by email (users who signed up before this column was added)
  const [byEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (byEmail) {
    // Backfill clerk_user_id
    await db.update(users).set({ clerk_user_id: clerkUserId }).where(eq(users.id, byEmail.id));
    return byEmail.id;
  }

  // First time — create the user row
  const [created] = await db
    .insert(users)
    .values({ clerk_user_id: clerkUserId, email, name, avatar_url })
    .returning({ id: users.id });

  return created.id;
}
