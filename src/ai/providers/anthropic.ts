import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIJsonRequest } from './base';
import { AIProviderError } from '@/lib/errors';
import { env } from '@/lib/server-env';

export const anthropicProvider: AIProvider = {
  async generateJson<T>(input: AIJsonRequest): Promise<T> {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const systemMessages = input.messages.filter((m) => m.role === 'system');
    const chatMessages = input.messages.filter((m) => m.role !== 'system');

    const msg = await client.messages.create({
      model: input.model,
      max_tokens: 4096,
      system: systemMessages.map((m) => m.content).join('\n') || undefined,
      tools: [
        {
          name: 'output',
          description: `Return structured output for task: ${input.taskName}`,
          input_schema: input.schema as Anthropic.Tool['input_schema'],
        },
      ],
      tool_choice: { type: 'tool', name: 'output' },
      messages: chatMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    const block = msg.content[0];
    if (block.type !== 'tool_use') {
      throw new AIProviderError('Expected tool_use response from Anthropic API', 'anthropic');
    }
    return block.input as T;
  },
};
