import Anthropic from '@anthropic-ai/sdk';
import { AIProviderError } from '@/lib/errors';
import { env } from '@/lib/server-env';

let client: Anthropic | null = null;

function getClient() {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    throw new AIProviderError('ANTHROPIC_API_KEY is not configured', 'anthropic');
  }

  client ??= new Anthropic({ apiKey });
  return client;
}

export async function generateObject<T>(prompt: string, schema: object, model = env.ANTHROPIC_MODEL): Promise<T> {
  const msg = await getClient().messages.create({
    model,
    max_tokens: 4096,
    tools: [{ name: 'output', description: 'Return structured output', input_schema: schema as Anthropic.Tool['input_schema'] }],
    tool_choice: { type: 'tool', name: 'output' },
    messages: [{ role: 'user', content: prompt }],
  });
  const block = msg.content[0];
  if (block.type !== 'tool_use') {
    throw new AIProviderError('Expected tool use response from Anthropic API', 'anthropic');
  }
  return block.input as T;
}
