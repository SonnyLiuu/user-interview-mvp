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

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: 'anthropic' | 'openai' | 'gemini',
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
