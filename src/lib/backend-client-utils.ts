'use client';

/**
 * Shared backend utilities for client-side operations
 */

export function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}