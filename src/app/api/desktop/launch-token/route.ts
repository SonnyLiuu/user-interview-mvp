import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDesktopUser } from '@/lib/desktop-auth';
import { signDesktopLaunchToken } from '@/lib/desktop-launch-token';
import { normalizeZoomMeetingIdentifier } from '@/lib/zoom-meeting';
import { getOwnedPerson } from '@/lib/person-ownership';

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

  if (!(await getOwnedPerson(body.personId, clerkUserId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const zoomMeetingIdentifier = normalizeZoomMeetingIdentifier(body.zoomMeetingIdentifier);

  return NextResponse.json({
    ...signDesktopLaunchToken({ clerkUserId, personId: body.personId, zoomMeetingIdentifier }),
    zoomMeetingIdentifier,
  });
}
