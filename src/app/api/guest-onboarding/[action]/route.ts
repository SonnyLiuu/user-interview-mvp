import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getBackendAccessToken, signGuestOnboardingToken } from '@/lib/backend-auth';
import {
  GUEST_ONBOARDING_COOKIE,
  GUEST_ONBOARDING_MAX_AGE,
} from '@/lib/guest-onboarding';
import { env } from '@/lib/server-env';

const ALLOWED_ACTIONS = new Set(['session', 'status', 'profile', 'chat', 'preview', 'claim']);

function clientIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || '';
}

function setGuestCookie(response: NextResponse, token: string) {
  response.cookies.set(GUEST_ONBOARDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GUEST_ONBOARDING_MAX_AGE,
  });
}

async function forward(req: NextRequest, action: string, method: string) {
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let guestToken = req.cookies.get(GUEST_ONBOARDING_COOKIE)?.value;
  if (!guestToken && action === 'session' && method === 'POST') {
    guestToken = crypto.randomBytes(32).toString('base64url');
  }
  if (!guestToken) {
    return NextResponse.json(
      { error: 'Your startup session was not found. Start again.', code: 'guest_session_missing' },
      { status: 404 },
    );
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  let body: string | undefined;

  if (action === 'claim') {
    headers.set('Authorization', `Bearer ${await getBackendAccessToken()}`);
    body = JSON.stringify({ guestToken });
  } else {
    headers.set(
      'Authorization',
      `Bearer ${signGuestOnboardingToken(guestToken, clientIp(req))}`,
    );
    if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
      body = await req.text();
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${env.FOUNDRY_API_BASE_URL}/v1/guest-onboarding/${action}`, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'The startup intake is temporarily unavailable.' }, { status: 502 });
  }

  const responseBody = await upstream.text();
  const response = new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
    },
  });

  if (upstream.ok && action === 'session' && method === 'POST') {
    setGuestCookie(response, guestToken);
  }
  if ((upstream.ok && action === 'claim') || (action === 'session' && method === 'DELETE')) {
    response.cookies.delete(GUEST_ONBOARDING_COOKIE);
  }
  return response;
}

type RouteContext = { params: Promise<{ action: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  return forward(req, (await context.params).action, 'GET');
}

export async function POST(req: NextRequest, context: RouteContext) {
  return forward(req, (await context.params).action, 'POST');
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return forward(req, (await context.params).action, 'DELETE');
}
