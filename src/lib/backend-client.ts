'use client';

import { normalizePath } from '@/lib/backend-client-utils';

export function getBackendProxyUrl(path: string) {
  return `/api/backend${normalizePath(path)}`;
}

export function backendClientFetch(path: string, init?: RequestInit) {
  return fetch(getBackendProxyUrl(path), {
    cache: 'no-store',
    ...init,
  });
}
