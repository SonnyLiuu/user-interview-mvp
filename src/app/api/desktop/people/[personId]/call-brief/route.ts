import { NextResponse } from 'next/server';
import { signBackendAccessToken } from '@/lib/backend-auth';
import { buildBackendUrl } from '@/lib/backend-utils';
import { getDesktopUser } from '@/lib/desktop-auth';

type Params = { params: Promise<{ personId: string }> };

function copyUpstreamHeaders(headers: Headers) {
  const nextHeaders = new Headers();
  const contentType = headers.get('content-type');
  if (contentType) nextHeaders.set('content-type', contentType);
  return nextHeaders;
}

export async function GET(request: Request, { params }: Params) {
  const user = await getDesktopUser(request);
  if (!user || !user.clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { personId } = await params;
  const token = signBackendAccessToken({
    clerkUserId: user.clerkUserId,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });

  let upstream: Response;
  try {
    upstream = await fetch(
      buildBackendUrl(`/v1/people/${encodeURIComponent(personId)}/call-brief`),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    );
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream.headers),
  });
}

