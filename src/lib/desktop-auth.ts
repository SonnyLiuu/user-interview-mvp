import { clerkClient, verifyToken } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { verifyDesktopAuthToken } from '@/lib/desktop-auth-token';

async function getOrCreateDesktopUser(clerkUserId: string) {
  const [user] = await db
    .select({
      id: users.id,
      clerkUserId: users.clerk_user_id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatar_url,
    })
    .from(users)
    .where(eq(users.clerk_user_id, clerkUserId))
    .limit(1);

  if (user) return user;

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    `${clerkUserId}@clerk.local`;
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
    clerkUser.username ||
    null;

  const [createdUser] = await db
    .insert(users)
    .values({
      clerk_user_id: clerkUserId,
      email,
      name,
      avatar_url: clerkUser.imageUrl,
    })
    .onConflictDoUpdate({
      target: users.clerk_user_id,
      set: {
        email,
        name,
        avatar_url: clerkUser.imageUrl,
      },
    })
    .returning({
      id: users.id,
      clerkUserId: users.clerk_user_id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatar_url,
    });

  return createdUser ?? null;
}

export async function getDesktopUser(request: Request) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (!token) return null;

  try {
    const desktopToken = verifyDesktopAuthToken(token);
    if (desktopToken) return getOrCreateDesktopUser(desktopToken.clerkUserId);

    const verifiedToken = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    return getOrCreateDesktopUser(verifiedToken.sub);
  } catch {
    return null;
  }
}
