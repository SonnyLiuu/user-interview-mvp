import OpenAI from 'openai';
import { AIProviderError } from '@/lib/errors';
import { env } from '@/lib/server-env';

let client: OpenAI | null = null;

function getClient() {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new AIProviderError('OPENAI_API_KEY is not configured', 'openai');
  }

  client ??= new OpenAI({ apiKey });
  return client;
}

export async function generateObject<T>(prompt: string, schema: object, model = env.OPENAI_MODEL): Promise<T> {
  const res = await getClient().chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    tools: [{
      type: 'function',
      function: {
        name: 'output',
        description: 'Return structured output',
        parameters: schema as Record<string, unknown>,
      },
    }],
    tool_choice: { type: 'function', function: { name: 'output' } },
  });
  const toolCall = res.choices[0].message.tool_calls?.[0];
  if (!toolCall || toolCall.type !== 'function') {
    throw new AIProviderError('No function call in OpenAI response', 'openai');
  }
  return JSON.parse(toolCall.function.arguments) as T;
}
