import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const DEFAULT_MODEL = 'gpt-4o';

export async function generateText(prompt: string, model = DEFAULT_MODEL): Promise<string> {
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = res.choices[0].message.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return content;
}

export async function generateObject<T>(prompt: string, schema: object, model = DEFAULT_MODEL): Promise<T> {
  const res = await client.chat.completions.create({
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
  if (!toolCall || toolCall.type !== 'function') throw new Error('No function call in OpenAI response');
  return JSON.parse(toolCall.function.arguments) as T;
}
