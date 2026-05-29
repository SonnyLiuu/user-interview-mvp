import { NextResponse } from 'next/server';
import { signBackendAccessToken } from '@/lib/backend-auth';
import { buildBackendUrl } from '@/lib/backend-utils';
import { verifyDesktopLaunchToken } from '@/lib/desktop-launch-token';
import { getDesktopUser } from '@/lib/desktop-auth';
import { normalizeFoundryBaseUrl } from '@/lib/desktop-live-session';
import { env } from '@/lib/server-env';

type StartLiveSessionInput = {
  personId?: string;
  launchToken?: string;
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
  if (!verifyDesktopLaunchToken({
    token: body.launchToken,
    clerkUserId: user.clerkUserId,
    personId: body.personId,
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
  try {
    upstream = await fetch(buildBackendUrl('/v1/desktop/live-sessions'), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ personId: body.personId }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    payload = { error: 'Invalid backend response' };
  }

  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  return NextResponse.json({
    ...(payload && typeof payload === 'object' ? payload : {}),
    foundryBaseUrl: foundryBaseUrl(),
  });
}
