import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AIJsonRequest } from './base';
import { AIProviderError } from '@/lib/errors';
import { env } from '@/lib/server-env';

export const geminiProvider: AIProvider = {
  async generateJson<T>(input: AIJsonRequest): Promise<T> {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);

    const systemParts = input.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const chatMessages = input.messages.filter((m) => m.role !== 'system');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = genAI.getGenerativeModel({
      model: input.model,
      systemInstruction: systemParts || undefined,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: input.schema as any,
      },
    });

    const userContent = chatMessages.map((m) => m.content).join('\n');
    const result = await model.generateContent(userContent);
    const text = result.response.text();
    if (!text) {
      throw new AIProviderError('Empty response from Gemini API', 'gemini');
    }
    return JSON.parse(text) as T;
  },
};
