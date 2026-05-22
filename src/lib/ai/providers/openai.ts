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

const MAX_OUTPUT_TOKENS = 8192;

export async function generateObject<T>(prompt: string, schema: object, model = env.OPENAI_MODEL): Promise<T> {
  const res = await getClient().chat.completions.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
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

  const choice = res.choices[0];
  const finishReason = choice?.finish_reason;

  if (finishReason === 'length') {
    throw new AIProviderError(
      `OpenAI response truncated at ${MAX_OUTPUT_TOKENS} tokens (finish_reason=length)`,
      'openai',
      undefined,
      true,
    );
  }

  const toolCall = choice?.message.tool_calls?.[0];
  if (!toolCall || toolCall.type !== 'function') {
    throw new AIProviderError('No function call in OpenAI response', 'openai');
  }

  try {
    return JSON.parse(toolCall.function.arguments) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIProviderError(
      `Failed to parse OpenAI tool arguments (finish_reason=${finishReason}): ${msg}`,
      'openai',
      undefined,
      true,
    );
  }
}
