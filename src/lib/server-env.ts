import 'server-only';

export interface EnvConfig {
  DATABASE_URL: string;
  DATABASE_URL_UNPOOLED?: string;
  CLERK_SECRET_KEY: string;
  CLERK_WEBHOOK_SECRET: string;
  FOUNDRY_API_BASE_URL?: string;
  FOUNDRY_BACKEND_SHARED_SECRET: string;
  AI_PROVIDER: 'openai' | 'anthropic';
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

type EnvState = {
  config?: EnvConfig;
  startupValidated?: boolean;
};

const REQUIRED_BASE_VARS = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SECRET',
  'FOUNDRY_BACKEND_SHARED_SECRET',
] as const;

const ENV_STATE_KEY = Symbol.for('startup-foundry.server-env');

export class EnvironmentError extends Error {
  constructor(message: string, public readonly variables: string[]) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

function getEnvState(): EnvState {
  const globalScope = globalThis as typeof globalThis & {
    [ENV_STATE_KEY]?: EnvState;
  };

  globalScope[ENV_STATE_KEY] ??= {};
  return globalScope[ENV_STATE_KEY];
}

function isProvided(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function shouldSkipValidation() {
  return process.env.SKIP_ENV_VALIDATION === 'true' || process.env.NODE_ENV === 'test';
}

function buildFallbackConfig(): EnvConfig {
  return {
    DATABASE_URL: process.env.DATABASE_URL || 'build-time-placeholder',
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || 'build-time-placeholder',
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET || 'build-time-placeholder',
    FOUNDRY_API_BASE_URL: process.env.FOUNDRY_API_BASE_URL,
    FOUNDRY_BACKEND_SHARED_SECRET: process.env.FOUNDRY_BACKEND_SHARED_SECRET || 'build-time-placeholder',
    AI_PROVIDER: process.env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
}

function readAndValidateEnvironment(): EnvConfig {
  const missingVars: string[] = REQUIRED_BASE_VARS.filter((name) => !isProvided(process.env[name]));
  const aiProvider = process.env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';

  if (aiProvider === 'openai' && !isProvided(process.env.OPENAI_API_KEY)) {
    missingVars.push('OPENAI_API_KEY');
  }

  if (aiProvider === 'anthropic' && !isProvided(process.env.ANTHROPIC_API_KEY)) {
    missingVars.push('ANTHROPIC_API_KEY');
  }

  if (missingVars.length > 0) {
    throw new EnvironmentError(
      `Missing required environment variables: ${missingVars.join(', ')}`,
      missingVars
    );
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET!,
    FOUNDRY_API_BASE_URL: process.env.FOUNDRY_API_BASE_URL,
    FOUNDRY_BACKEND_SHARED_SECRET: process.env.FOUNDRY_BACKEND_SHARED_SECRET!,
    AI_PROVIDER: aiProvider,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
}

export function getEnv(): EnvConfig {
  const state = getEnvState();

  if (state.config) {
    return state.config;
  }

  state.config = shouldSkipValidation()
    ? buildFallbackConfig()
    : readAndValidateEnvironment();

  return state.config;
}

export function validateEnvOnStartup() {
  const state = getEnvState();

  if (state.startupValidated) {
    return getEnv();
  }

  const config = getEnv();

  if (shouldSkipValidation()) {
    console.warn('Environment validation skipped');
  } else {
    console.log('Environment validation passed');
  }

  state.startupValidated = true;
  return config;
}

export const env = new Proxy({} as EnvConfig, {
  get(_target, prop) {
    return getEnv()[prop as keyof EnvConfig];
  },
});
