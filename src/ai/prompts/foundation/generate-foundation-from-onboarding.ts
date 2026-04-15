import type { AIMessage } from '@/ai/providers/base';
import type { OnboardingState } from '@/lib/onboarding/slot-definitions';

export function buildGenerateFoundationMessages(
  messages: { role: 'assistant' | 'user'; content: string }[],
  state: OnboardingState,
): AIMessage[] {
  const transcript = messages
    .map((m) => `${m.role === 'assistant' ? 'AI' : 'Founder'}: ${m.content}`)
    .join('\n\n');

  const stateSnapshot = JSON.stringify(
    {
      ideaSummary: state.ideaSummary,
      targetUser: state.targetUser,
      painPoint: state.painPoint,
      valueProp: state.valueProp,
      idealPeopleTypes: state.idealPeopleTypes,
      differentiation: state.differentiation,
      disqualifiers: state.disqualifiers,
    },
    null,
    2,
  );

  return [
    {
      role: 'user',
      content: `Generate a Project Foundation document for a startup based on the onboarding conversation and collected state.

Collected state:
${stateSnapshot}

Full onboarding transcript:
${transcript}

Rules:
- Use the collected state as the primary source; use the transcript to fill gaps or improve clarity
- summary should read as a neutral, polished description — not first-person
- Keep all fields concise and specific
- If differentiation or disqualifiers were not discussed, omit or set to null/empty`,
    },
  ];
}
