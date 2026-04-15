import 'server-only';

import { NextRequest } from 'next/server';
import { getBackendAccessToken } from '@/lib/backend-auth';
import { buildBackendUrl, createBackendHeaders } from '@/lib/backend-utils';

function copyUpstreamHeaders(headers: Headers) {
  const nextHeaders = new Headers();
  const contentType = headers.get('content-type');
  if (contentType) nextHeaders.set('content-type', contentType);
  return nextHeaders;
}

export async function proxyToBackend(req: NextRequest, path: string) {
  const token = await getBackendAccessToken();
  const headers = createBackendHeaders({
    authorization: `Bearer ${token}`,
  });
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const upstream = await fetch(buildBackendUrl(path), {
    method: req.method,
    headers,
    body: hasBody ? await req.text() : undefined,
    cache: 'no-store',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream.headers),
  });
}
