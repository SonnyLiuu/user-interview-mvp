import { NextResponse } from 'next/server';

export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Unauthenticated';
}

export function jsonRouteError(
  error: unknown,
  fallbackMessage = 'Internal server error'
) {
  if (isUnauthenticatedError(error)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.error(error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

export function textRouteError(
  error: unknown,
  fallbackMessage = 'Internal server error'
) {
  if (isUnauthenticatedError(error)) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.error(error);
  return new Response(fallbackMessage, { status: 500 });
}
