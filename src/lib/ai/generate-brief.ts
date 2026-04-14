import { generateObject } from './provider';
import type { ProjectIntake } from '@/lib/db/schema';

export type BriefOutput = {
  idea_summary: string;
  strengths: string[];
  weaknesses: string[];
  most_promising_avenues: string[];
  assumptions: Array<{
    assumption: string;
    status: 'unvalidated';
    evidence: string[];
  }>;
  recommended_conversations: Array<{
    persona_type: string;
    why: string;
    what_to_learn: string;
    urgency: 'high' | 'medium' | 'low';
  }>;
};

export async function generateBrief(intake: ProjectIntake): Promise<BriefOutput> {
  const prompt = `You are an experienced startup advisor. Based on this founder's intake information, generate a structured project brief.

INTAKE DATA:
What they're building: ${intake.what_are_you_building ?? 'Not specified'}
For whom: ${intake.for_whom ?? 'Not specified'}
Why now: ${intake.why_now ?? 'Not specified'}
Pain: ${intake.pain_description ?? 'Not specified'}
Current solutions: ${intake.current_solutions ?? 'Not specified'}
Who feels the pain: ${intake.who_feels_pain ?? 'Not specified'}
Who pays: ${intake.who_pays ?? 'Not specified'}
Who has budget: ${intake.who_has_budget ?? 'Not specified'}
Most promising angle: ${intake.most_promising_angle ?? 'Not specified'}
Key assumptions: ${intake.key_assumptions?.join(', ') ?? 'Not specified'}
Biggest failure reasons: ${intake.biggest_failure_reasons?.join(', ') ?? 'Not specified'}
Personal connection: ${intake.personal_connection ?? 'Not specified'}

Generate a sharp, honest brief. Strengths should highlight genuine signals. Weaknesses should name real risks — vague customer definition, unclear pain severity, etc. Assumptions must be the 3–5 things that must be true for this to work as a business. Recommended conversations should be specific persona types.`;

  return generateObject<BriefOutput>(prompt, {
    type: 'object',
    required: ['idea_summary', 'strengths', 'weaknesses', 'most_promising_avenues', 'assumptions', 'recommended_conversations'],
    properties: {
      idea_summary: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' } },
      weaknesses: { type: 'array', items: { type: 'string' } },
      most_promising_avenues: { type: 'array', items: { type: 'string' } },
      assumptions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['assumption', 'status', 'evidence'],
          properties: {
            assumption: { type: 'string' },
            status: { type: 'string', enum: ['unvalidated'] },
            evidence: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      recommended_conversations: {
        type: 'array',
        items: {
          type: 'object',
          required: ['persona_type', 'why', 'what_to_learn', 'urgency'],
          properties: {
            persona_type: { type: 'string' },
            why: { type: 'string' },
            what_to_learn: { type: 'string' },
            urgency: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      },
    },
  });
}
