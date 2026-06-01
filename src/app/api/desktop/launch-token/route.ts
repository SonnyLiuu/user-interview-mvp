import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects, users } from '@/lib/db/schema';
import { getDesktopUser } from '@/lib/desktop-auth';
import { signDesktopLaunchToken } from '@/lib/desktop-launch-token';
import { normalizeZoomMeetingIdentifier } from '@/lib/zoom-meeting';

type LaunchTokenInput = {
  personId?: string;
  zoomMeetingIdentifier?: string;
};

async function getAuthenticatedClerkUserId(request: Request) {
  const { userId } = await auth();
  if (userId) return userId;

  const desktopUser = await getDesktopUser(request);
  return desktopUser?.clerkUserId ?? null;
}

async function ownsPerson(personId: string, clerkUserId: string) {
  const [row] = await db
    .select({ id: people.id })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .innerJoin(users, eq(projects.user_id, users.id))
    .where(and(eq(people.id, personId), eq(users.clerk_user_id, clerkUserId)))
    .limit(1);

  return !!row;
}

export async function POST(request: NextRequest) {
  const clerkUserId = await getAuthenticatedClerkUserId(request);
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: LaunchTokenInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.personId) {
    return NextResponse.json({ error: 'personId required' }, { status: 400 });
  }

  if (!(await ownsPerson(body.personId, clerkUserId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const zoomMeetingIdentifier = normalizeZoomMeetingIdentifier(body.zoomMeetingIdentifier);

  return NextResponse.json({
    ...signDesktopLaunchToken({ clerkUserId, personId: body.personId, zoomMeetingIdentifier }),
    zoomMeetingIdentifier,
  });
}
