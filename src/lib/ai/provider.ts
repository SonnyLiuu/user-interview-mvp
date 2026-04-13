import * as openai from './providers/openai';
import * as anthropic from './providers/anthropic';

type Provider = 'openai' | 'anthropic';

function getProvider(): Provider {
  const p = process.env.AI_PROVIDER;
  if (p === 'anthropic') return 'anthropic';
  return 'openai'; // default
}

function impl() {
  return getProvider() === 'anthropic' ? anthropic : openai;
}

export async function generateText(prompt: string, model?: string): Promise<string> {
  return impl().generateText(prompt, model);
}

export async function generateObject<T>(prompt: string, schema: object, model?: string): Promise<T> {
  return impl().generateObject<T>(prompt, schema, model);
}
