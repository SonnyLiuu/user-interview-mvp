import type { AIProvider, AIJsonRequest } from './base';

export const openaiProvider: AIProvider = {
  async generateJson<T>(input: AIJsonRequest): Promise<T> {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: input.model,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: input.schemaName,
          schema: input.schema as Record<string, unknown>,
        },
      },
    });

    const text = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(text) as T;
  },
};
