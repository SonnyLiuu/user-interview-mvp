import type { AIMessage } from '@/ai/providers/base';

export function buildExtractKickoffIdeaMessages(userMessage: string): AIMessage[] {
  return [
    {
      role: 'user',
      content: `A founder has just described their startup idea. Extract a concise summary and assess quality.

Founder message:
"""
${userMessage}
"""

Rules:
- ideaSummary must be 1–3 sentences, written as a neutral description (not first-person)
- quality is "solid" if the message clearly conveys: what is being built AND who it is for
- quality is "weak" if either of those is vague or missing`,
    },
  ];
}
