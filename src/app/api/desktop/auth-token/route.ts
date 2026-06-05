import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { signDesktopAuthToken } from '@/lib/desktop-auth-token';
import { getDesktopUser } from '@/lib/desktop-auth';

async function getAuthenticatedClerkUserId(request: Request) {
  const { userId } = await auth();
  if (userId) return userId;

  const desktopUser = await getDesktopUser(request);
  return desktopUser?.clerkUserId ?? null;
}

export async function POST(request: Request) {
  const clerkUserId = await getAuthenticatedClerkUserId(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(signDesktopAuthToken({ clerkUserId }));
}
