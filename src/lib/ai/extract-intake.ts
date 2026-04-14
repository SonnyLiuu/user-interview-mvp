import { generateObject } from './provider';
import type { ProjectIntake } from '@/lib/db/schema';

type ConversationMessage = { role: 'assistant' | 'user'; content: string };

export async function extractIntakeFields(
  conversation: ConversationMessage[]
): Promise<Partial<ProjectIntake>> {
  const transcript = conversation
    .map((m) => `${m.role === 'user' ? 'Founder' : 'Advisor'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Extract structured intake information from this founder office hours conversation.

CONVERSATION:
${transcript}

Extract all fields you can infer from the conversation. Leave fields null if not discussed.`;

  return generateObject<Partial<ProjectIntake>>(prompt, {
    type: 'object',
    properties: {
      what_are_you_building: { type: ['string', 'null'] },
      for_whom: { type: ['string', 'null'] },
      why_now: { type: ['string', 'null'] },
      pain_description: { type: ['string', 'null'] },
      pain_frequency: { type: ['string', 'null'] },
      current_solutions: { type: ['string', 'null'] },
      why_not_solved: { type: ['string', 'null'] },
      consequence_if_unsolved: { type: ['string', 'null'] },
      who_feels_pain: { type: ['string', 'null'] },
      who_pays: { type: ['string', 'null'] },
      user_buyer_same_person: { type: ['boolean', 'null'] },
      who_influences: { type: ['string', 'null'] },
      who_benefits_most: { type: ['string', 'null'] },
      who_has_budget: { type: ['string', 'null'] },
      urgency_level: { type: ['string', 'null'] },
      most_promising_angle: { type: ['string', 'null'] },
      narrow_wedge: { type: ['string', 'null'] },
      key_assumptions: { type: ['array', 'null'], items: { type: 'string' } },
      biggest_failure_reasons: { type: ['array', 'null'], items: { type: 'string' } },
      personal_connection: { type: ['string', 'null'] },
    },
  });
}
