/**
 * Custom error classes for consistent error handling
 */

export class ConfigurationError extends Error {
  constructor(message: string, public readonly configKey?: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ExternalServiceError extends Error {
  constructor(
    message: string,
    public readonly service: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public readonly operation?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: 'anthropic' | 'openai',
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/**
 * Type guard to check if an error is a custom error type
 */
export function isCustomError(error: unknown): error is Error & { name: string } {
  return error instanceof Error && 'name' in error;
}

/**
 * Get user-friendly error message for client consumption
 */
export function getClientErrorMessage(error: unknown): string {
  if (error instanceof AuthenticationError) {
    return 'Please sign in to continue';
  }

  if (error instanceof AuthorizationError) {
    return 'You do not have permission to perform this action';
  }

  if (error instanceof ValidationError) {
    return error.message;
  }

  if (error instanceof ConfigurationError) {
    return 'Service configuration error. Please try again later.';
  }

  if (error instanceof ExternalServiceError) {
    return 'External service temporarily unavailable. Please try again later.';
  }

  if (error instanceof AIProviderError) {
    return 'AI service temporarily unavailable. Please try again later.';
  }

  if (error instanceof DatabaseError) {
    return 'Database temporarily unavailable. Please try again later.';
  }

  // For generic errors, return a safe default
  return 'An unexpected error occurred. Please try again.';
}