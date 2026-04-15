import type { AIMessage } from '@/ai/providers/base';
import type { SlotKey, OnboardingState } from '@/lib/onboarding/slot-definitions';

const SLOT_CONTEXT: Record<SlotKey, string> = {
  ideaSummary: 'what the founder is building and for whom',
  targetUser: 'who the primary user is — the person who experiences the problem',
  painPoint: 'the core pain or problem the product addresses',
  valueProp: 'what specific value the product delivers to users',
  idealPeopleTypes: 'the types of people who would be ideal early users or customers',
  differentiation: 'what makes this different from existing solutions',
  disqualifiers: 'who would NOT be a good fit for this product',
};

export function buildGenerateNextQuestionMessages(
  targetSlot: SlotKey,
  recentMessages: { role: 'assistant' | 'user'; content: string }[],
  state: OnboardingState,
): AIMessage[] {
  const stateLines: string[] = [];
  if (state.ideaSummary) stateLines.push(`Idea: ${state.ideaSummary}`);
  if (state.targetUser) stateLines.push(`Target user: ${state.targetUser}`);
  if (state.painPoint) stateLines.push(`Pain point: ${state.painPoint}`);
  if (state.valueProp) stateLines.push(`Value prop: ${state.valueProp}`);
  if (state.idealPeopleTypes.length) stateLines.push(`Ideal people: ${state.idealPeopleTypes.join(', ')}`);
  if (state.differentiation) stateLines.push(`Differentiation: ${state.differentiation}`);
  if (state.disqualifiers.length) stateLines.push(`Disqualifiers: ${state.disqualifiers.join(', ')}`);

  const stateContext = stateLines.length ? stateLines.join('\n') : '(nothing collected yet)';

  const conversationSnippet = recentMessages
    .slice(-6)
    .map((m) => `${m.role === 'assistant' ? 'AI' : 'Founder'}: ${m.content}`)
    .join('\n');

  return [
    {
      role: 'user',
      content: `You are running a structured onboarding interview for a startup founder. Generate the next question and 3–5 answer choices.

Target slot: ${targetSlot} (${SLOT_CONTEXT[targetSlot]})

What we know so far:
${stateContext}

Recent conversation:
${conversationSnippet || '(none yet)'}

Requirements:
- Generate exactly 3–5 distinct, concrete choices relevant to this specific founder's context
- Each choice should target the "${targetSlot}" slot
- Do NOT include a "Something else" option — the UI adds that automatically
- Labels must be concise (under 60 characters)
- Assign a short unique id to each choice (e.g. "a", "b", "c")
- normalizedValue should be a clean sentence suitable for storage
- customPlaceholder should be a short prompt for the free-text field`,
    },
  ];
}
