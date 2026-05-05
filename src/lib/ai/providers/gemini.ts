import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProviderError } from '@/lib/errors';
import { env } from '@/lib/server-env';

let client: GoogleGenerativeAI | null = null;

function getClient() {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    throw new AIProviderError('GEMINI_API_KEY is not configured', 'gemini');
  }

  client ??= new GoogleGenerativeAI(apiKey);
  return client;
}

export async function generateObject<T>(prompt: string, schema: object, model = env.GEMINI_MODEL): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const genModel = getClient().getGenerativeModel({
    model,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema as any,
    },
  });
  const result = await genModel.generateContent(prompt);
  const text = result.response.text();
  if (!text) {
    throw new AIProviderError('Empty response from Gemini API', 'gemini');
  }
  return JSON.parse(text) as T;
}
