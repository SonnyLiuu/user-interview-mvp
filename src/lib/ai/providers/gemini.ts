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

const MAX_OUTPUT_TOKENS = 8192;

export async function generateObject<T>(prompt: string, schema: object, model = env.GEMINI_MODEL): Promise<T> {
  const genModel = getClient().getGenerativeModel({
    model,
    generationConfig: {
      responseMimeType: 'application/json',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseSchema: schema as any,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });
  const result = await genModel.generateContent(prompt);
  const finishReason = result.response.candidates?.[0]?.finishReason;

  if (finishReason === 'MAX_TOKENS') {
    throw new AIProviderError(
      `Gemini response truncated at ${MAX_OUTPUT_TOKENS} tokens (finishReason=MAX_TOKENS)`,
      'gemini',
      undefined,
      true,
    );
  }

  const text = result.response.text();
  if (!text) {
    throw new AIProviderError('Empty response from Gemini API', 'gemini');
  }

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AIProviderError(
      `Failed to parse Gemini JSON response (finishReason=${finishReason ?? 'unknown'}): ${msg}`,
      'gemini',
      undefined,
      true,
    );
  }
}
