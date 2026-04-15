import { resolveRoute } from '@/ai/router/model-router';
import {
  extractCustomSlotAnswerStringSchema,
  extractCustomSlotAnswerArraySchema,
} from '@/ai/schemas/onboarding';
import { buildExtractCustomSlotAnswerMessages } from '@/ai/prompts/onboarding/extract-custom-slot-answer';
import type { SlotKey, OnboardingState } from '@/lib/onboarding/slot-definitions';

export type ExtractCustomSlotAnswerResult = {
  slotKey: SlotKey;
  value: string | string[];
  quality: 'weak' | 'solid';
};

const ARRAY_SLOTS: SlotKey[] = ['idealPeopleTypes', 'disqualifiers'];

export async function extractCustomSlotAnswer(
  targetSlot: SlotKey,
  customText: string,
  recentMessages: { role: 'assistant' | 'user'; content: string }[],
  _state: OnboardingState,
): Promise<ExtractCustomSlotAnswerResult> {
  const isArraySlot = ARRAY_SLOTS.includes(targetSlot);
  const { provider, model } = resolveRoute('onboarding.extractCustomSlotAnswer');
  const messages = buildExtractCustomSlotAnswerMessages(targetSlot, customText, recentMessages, isArraySlot);

  if (isArraySlot) {
    const raw = await provider.generateJson<{ values: string[]; quality: 'weak' | 'solid' }>({
      taskName: 'onboarding.extractCustomSlotAnswer',
      model,
      messages,
      schemaName: 'ExtractCustomSlotAnswerArrayResult',
      schema: extractCustomSlotAnswerArraySchema,
    });
    return { slotKey: targetSlot, value: raw.values, quality: raw.quality };
  }

  const raw = await provider.generateJson<{ value: string; quality: 'weak' | 'solid' }>({
    taskName: 'onboarding.extractCustomSlotAnswer',
    model,
    messages,
    schemaName: 'ExtractCustomSlotAnswerStringResult',
    schema: extractCustomSlotAnswerStringSchema,
  });
  return { slotKey: targetSlot, value: raw.value, quality: raw.quality };
}
