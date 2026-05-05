import * as openai from './providers/openai';
import * as anthropic from './providers/anthropic';
import * as gemini from './providers/gemini';
import { env } from '@/lib/server-env';

type Provider = 'openai' | 'anthropic' | 'gemini';

function getProvider(): Provider {
  return env.AI_PROVIDER;
}

function impl() {
  const p = getProvider();
  if (p === 'anthropic') return anthropic;
  if (p === 'gemini') return gemini;
  return openai;
}

export async function generateText(prompt: string, model?: string): Promise<string> {
  return impl().generateText(prompt, model);
}

export async function generateObject<T>(prompt: string, schema: object, model?: string): Promise<T> {
  return impl().generateObject<T>(prompt, schema, model);
}
