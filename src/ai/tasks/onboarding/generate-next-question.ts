import { resolveRoute } from '@/ai/router/model-router';
import { generateNextQuestionSchema } from '@/ai/schemas/onboarding';
import { buildGenerateNextQuestionMessages } from '@/ai/prompts/onboarding/generate-next-question';
import type { SlotKey, OnboardingState } from '@/lib/onboarding/slot-definitions';

export type GeneratedChoice = {
  id: string;
  label: string;
  normalizedValue: string;
  slotKey: SlotKey;
};

export type GenerateNextQuestionResult = {
  targetSlot: SlotKey;
  question: string;
  choices: GeneratedChoice[];
  customPlaceholder: string;
};

type RawResult = {
  question: string;
  choices: Omit<GeneratedChoice, 'slotKey'>[];
  customPlaceholder: string;
};

export async function generateNextQuestionWithChoices(
  targetSlot: SlotKey,
  recentMessages: { role: 'assistant' | 'user'; content: string }[],
  state: OnboardingState,
): Promise<GenerateNextQuestionResult> {
  const { provider, model } = resolveRoute('onboarding.generateNextQuestionWithChoices');

  const raw = await provider.generateJson<RawResult>({
    taskName: 'onboarding.generateNextQuestionWithChoices',
    model,
    messages: buildGenerateNextQuestionMessages(targetSlot, recentMessages, state),
    schemaName: 'GenerateNextQuestionResult',
    schema: generateNextQuestionSchema,
  });

  return {
    targetSlot,
    question: raw.question,
    choices: raw.choices.map((c) => ({ ...c, slotKey: targetSlot })),
    customPlaceholder: raw.customPlaceholder,
  };
}
