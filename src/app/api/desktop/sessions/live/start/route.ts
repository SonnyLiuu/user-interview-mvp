import { NextResponse } from 'next/server';
import { signBackendAccessToken } from '@/lib/backend-auth';
import { buildBackendUrl } from '@/lib/backend-utils';
import { getDesktopUser } from '@/lib/desktop-auth';
import { env } from '@/lib/server-env';

type StartLiveSessionInput = {
  personId?: string;
};

function foundryBaseUrl() {
  const raw = (env.FOUNDRY_API_BASE_URL || 'http://127.0.0.1:8001').trim();
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return `http://${raw}`;
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
