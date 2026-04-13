import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

export async function generateText(prompt: string, model = DEFAULT_MODEL): Promise<string> {
  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Anthropic');
  return block.text;
}

export async function generateObject<T>(prompt: string, schema: object, model = DEFAULT_MODEL): Promise<T> {
  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    tools: [{ name: 'output', description: 'Return structured output', input_schema: schema as Anthropic.Tool['input_schema'] }],
    tool_choice: { type: 'tool', name: 'output' },
    messages: [{ role: 'user', content: prompt }],
  });
  const block = msg.content[0];
  if (block.type !== 'tool_use') throw new Error('Expected tool use response from Anthropic');
  return block.input as T;
}
