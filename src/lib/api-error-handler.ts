import { NextResponse } from 'next/server';
import { getClientErrorMessage, isCustomError } from '@/lib/errors';

/**
 * Utility function to handle errors in API routes and return appropriate responses
 */
export function handleApiError(error: unknown) {
  console.error('API Error:', error);

  // For custom errors, return user-friendly messages
  if (isCustomError(error)) {
    const clientMessage = getClientErrorMessage(error);

    // Return appropriate status codes based on error type
    switch (error.name) {
      case 'AuthenticationError':
        return NextResponse.json({ error: clientMessage }, { status: 401 });
      case 'AuthorizationError':
        return NextResponse.json({ error: clientMessage }, { status: 403 });
      case 'ValidationError':
        return NextResponse.json({ error: clientMessage }, { status: 400 });
      case 'ConfigurationError':
      case 'DatabaseError':
      case 'ExternalServiceError':
      case 'AIProviderError':
        return NextResponse.json({ error: clientMessage }, { status: 500 });
      default:
        return NextResponse.json({ error: clientMessage }, { status: 500 });
    }
  }

  // For unknown errors, return a generic message
  return NextResponse.json(
    { error: 'An unexpected error occurred. Please try again.' },
    { status: 500 }
  );
}

/**
 * Wrapper for API route handlers to automatically handle errors
 */
export function withErrorHandler<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}