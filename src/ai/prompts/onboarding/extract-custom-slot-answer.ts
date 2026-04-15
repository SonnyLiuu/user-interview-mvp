import type { AIMessage } from '@/ai/providers/base';
import type { SlotKey } from '@/lib/onboarding/slot-definitions';

export function buildExtractCustomSlotAnswerMessages(
  targetSlot: SlotKey,
  customText: string,
  recentMessages: { role: 'assistant' | 'user'; content: string }[],
  isArraySlot: boolean,
): AIMessage[] {
  const conversationSnippet = recentMessages
    .slice(-4)
    .map((m) => `${m.role === 'assistant' ? 'AI' : 'Founder'}: ${m.content}`)
    .join('\n');

  return [
    {
      role: 'user',
      content: `A founder typed a custom answer during onboarding. Extract a clean value for the target slot.

Target slot: ${targetSlot}
${isArraySlot ? 'This slot stores an array — extract one or more distinct items.' : 'This slot stores a single string.'}

Recent conversation:
${conversationSnippet || '(none)'}

Founder's custom answer:
"""
${customText}
"""

Rules:
- Extract only what's relevant to the "${targetSlot}" slot
- quality is "solid" if specific and clearly addresses the slot; "weak" if vague
- ${isArraySlot ? 'Return value as an array of strings (even if just one item)' : 'Return value as a single string'}`,
    },
  ];
}
