import { generateObject as generateOpenAIObject } from './providers/openai';
import { generateObject as generateAnthropicObject } from './providers/anthropic';
import { generateObject as generateGeminiObject } from './providers/gemini';
import { AIProviderError } from '@/lib/errors';
import { env } from '@/lib/server-env';

type Provider = 'openai' | 'anthropic' | 'gemini';

function getProvider(): Provider {
  return env.AI_PROVIDER;
}

function impl() {
  const p = getProvider();
  if (p === 'anthropic') return generateAnthropicObject;
  if (p === 'gemini') return generateGeminiObject;
  return generateOpenAIObject;
}

export async function generateObject<T>(prompt: string, schema: object, model?: string): Promise<T> {
  const call = impl();
  try {
    return await call<T>(prompt, schema, model);
  } catch (err) {
    if (err instanceof AIProviderError && err.retryable) {
      console.warn(`[ai] retrying after retryable ${err.provider} error: ${err.message}`);
      return await call<T>(prompt, schema, model);
    }
    throw err;
  }
}
