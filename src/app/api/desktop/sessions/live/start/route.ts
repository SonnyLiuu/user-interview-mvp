import { NextResponse } from 'next/server';
import { signBackendAccessToken } from '@/lib/backend-auth';
import { buildBackendUrl } from '@/lib/backend-utils';
import { verifyDesktopLaunchToken } from '@/lib/desktop-launch-token';
import { getDesktopUser } from '@/lib/desktop-auth';
import { normalizeFoundryBaseUrl } from '@/lib/desktop-live-session';
import { env } from '@/lib/server-env';
import { normalizeZoomMeetingIdentifier } from '@/lib/zoom-meeting';

type StartLiveSessionInput = {
  personId?: string;
  launchToken?: string;
  captureProvider?: string;
  zoomMeetingIdentifier?: string;
};

function foundryBaseUrl() {
  return normalizeFoundryBaseUrl(
    env.FOUNDRY_DESKTOP_API_PUBLIC_URL ||
    env.FOUNDRY_API_BASE_URL ||
    'http://127.0.0.1:8001',
  );
}

export async function POST(request: Request) {
  const user = await getDesktopUser(request);
  if (!user || !user.clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: StartLiveSessionInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.personId) {
    return NextResponse.json({ error: 'personId required' }, { status: 400 });
  }
  if (!body.launchToken) {
    return NextResponse.json({ error: 'launchToken required' }, { status: 400 });
  }
  const zoomMeetingIdentifier = normalizeZoomMeetingIdentifier(body.zoomMeetingIdentifier);
  if (!verifyDesktopLaunchToken({
    token: body.launchToken,
    clerkUserId: user.clerkUserId,
    personId: body.personId,
    zoomMeetingIdentifier,
  })) {
    return NextResponse.json({ error: 'Invalid launch token' }, { status: 403 });
  }

  const token = signBackendAccessToken({
    clerkUserId: user.clerkUserId,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });

  let upstream: Response;
  let upstreamText: string;
  try {
    upstream = await fetch(buildBackendUrl('/v1/desktop/live-sessions'), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        personId: body.personId,
        captureProvider: body.captureProvider || 'desktop_audio',
        zoomMeetingIdentifier,
      }),
      cache: 'no-store',
    });
    upstreamText = await upstream.text();
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(upstreamText);
  } catch {
    console.error(
      `[live-session:start] Backend returned non-JSON response (status=${upstream.status}):`,
      upstreamText.slice(0, 1000),
    );
    return NextResponse.json(
      { error: 'Backend response error', status: upstream.status },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  return NextResponse.json({
    ...(payload && typeof payload === 'object' ? payload : {}),
    foundryBaseUrl: foundryBaseUrl(),
  });
}
