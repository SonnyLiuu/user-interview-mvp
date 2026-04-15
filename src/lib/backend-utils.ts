import 'server-only';

import { env } from '@/lib/server-env';

/**
 * Shared backend utilities for server-side operations
 */

export function getBackendBaseUrl(): string {
  return env.FOUNDRY_API_BASE_URL || 'http://127.0.0.1:8001';
}

export function buildBackendUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getBackendBaseUrl()}${normalizedPath}`;
}

export function createBackendHeaders(additionalHeaders?: Record<string, string>): Headers {
  const headers = new Headers();
  // Add any common headers here if needed
  if (additionalHeaders) {
    Object.entries(additionalHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }
  return headers;
}
