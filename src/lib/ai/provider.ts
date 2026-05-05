import { generateObject as generateOpenAIObject } from './providers/openai';
import { generateObject as generateAnthropicObject } from './providers/anthropic';
import { generateObject as generateGeminiObject } from './providers/gemini';
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
  return impl()<T>(prompt, schema, model);
}
