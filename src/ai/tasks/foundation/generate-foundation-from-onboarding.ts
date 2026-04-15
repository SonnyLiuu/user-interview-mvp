import { resolveRoute } from '@/ai/router/model-router';
import { generateFoundationSchema } from '@/ai/schemas/foundation';
import { buildGenerateFoundationMessages } from '@/ai/prompts/foundation/generate-foundation-from-onboarding';
import type { OnboardingState } from '@/lib/onboarding/slot-definitions';

export type Foundation = {
  summary: string;
  targetUser: string;
  painPoint: string;
  valueProp: string;
  idealPeopleTypes: string[];
  differentiation?: string | null;
  disqualifiers?: string[];
};

export type GenerateFoundationResult = {
  foundation: Foundation;
};

export async function generateFoundationFromOnboarding(
  messages: { role: 'assistant' | 'user'; content: string }[],
  state: OnboardingState,
): Promise<GenerateFoundationResult> {
  const { provider, model } = resolveRoute('foundation.generateFoundationFromOnboarding');

  return provider.generateJson<GenerateFoundationResult>({
    taskName: 'foundation.generateFoundationFromOnboarding',
    model,
    messages: buildGenerateFoundationMessages(messages, state),
    schemaName: 'GenerateFoundationResult',
    schema: generateFoundationSchema,
  });
}
