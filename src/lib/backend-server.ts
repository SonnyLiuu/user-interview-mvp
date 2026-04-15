import 'server-only';

import { getBackendAccessToken } from '@/lib/backend-auth';
import { ExternalServiceError } from '@/lib/errors';
import { buildBackendUrl, createBackendHeaders } from '@/lib/backend-utils';
import type {
  FoundationViewPayload,
  LatestProjectPayload,
  ProjectLookupPayload,
  ProjectNavItem,
  WorkspaceSummaryPayload,
} from '@/lib/backend-types';

async function backendFetchServer<T>(path: string, init?: RequestInit, options?: { allowNotFound?: boolean }): Promise<T> {
  const token = await getBackendAccessToken();
  const headers = createBackendHeaders({
    authorization: `Bearer ${token}`,
  });

  // Merge with any additional headers from init
  if (init?.headers) {
    const additionalHeaders = new Headers(init.headers);
    additionalHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const response = await fetch(buildBackendUrl(path), {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (response.status === 404 && options?.allowNotFound) {
    return null as T;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ExternalServiceError(
      body || `Backend request failed`,
      'foundry-api',
      response.status
    );
  }

  return response.json() as Promise<T>;
}

export async function getLatestProject() {
  return backendFetchServer<LatestProjectPayload>('/v1/dashboard/latest-project');
}

export async function listProjects() {
  return backendFetchServer<ProjectNavItem[]>('/v1/projects');
}

export async function getProjectBySlugOrId(slugOrId: string) {
  return backendFetchServer<ProjectLookupPayload | null>(
    `/v1/projects/by-slug/${encodeURIComponent(slugOrId)}`,
    undefined,
    { allowNotFound: true },
  );
}

export async function getWorkspaceSummary(projectId: string) {
  return backendFetchServer<WorkspaceSummaryPayload | null>(
    `/v1/projects/${projectId}/workspace-summary`,
    undefined,
    { allowNotFound: true },
  );
}

export async function getFoundationView(projectId: string) {
  return backendFetchServer<FoundationViewPayload | null>(
    `/v1/projects/${projectId}/foundation-view`,
    undefined,
    { allowNotFound: true },
  );
}
