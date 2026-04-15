import { resolveRoute } from '@/ai/router/model-router';
import { extractKickoffIdeaSchema } from '@/ai/schemas/onboarding';
import { buildExtractKickoffIdeaMessages } from '@/ai/prompts/onboarding/extract-kickoff-idea';

export type ExtractKickoffIdeaResult = {
  ideaSummary: string;
  quality: 'weak' | 'solid';
};

export async function extractKickoffIdea(userMessage: string): Promise<ExtractKickoffIdeaResult> {
  const { provider, model } = resolveRoute('onboarding.extractKickoffIdea');

  return provider.generateJson<ExtractKickoffIdeaResult>({
    taskName: 'onboarding.extractKickoffIdea',
    model,
    messages: buildExtractKickoffIdeaMessages(userMessage),
    schemaName: 'ExtractKickoffIdeaResult',
    schema: extractKickoffIdeaSchema,
  });
}
