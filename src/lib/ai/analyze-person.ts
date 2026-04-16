import { generateObject } from './provider';
import type { PersonAnalysis } from '@/lib/db/schema';

type ProjectContext = {
  idea_summary?: string | null;
  target_customer?: string | null;
  key_assumptions?: string[] | null;
  most_promising_avenues?: string[] | null;
};

export async function analyzePerson(
  crawledContent: string,
  projectContext: ProjectContext
): Promise<PersonAnalysis> {
  const prompt = `You are an expert at helping early-stage founders identify the most valuable people to learn from during customer discovery.

FOUNDER'S PROJECT CONTEXT:
Idea: ${projectContext.idea_summary ?? 'Not specified'}
Target customer: ${projectContext.target_customer ?? 'Not specified'}
Key assumptions to validate: ${projectContext.key_assumptions?.join('; ') ?? 'Not specified'}
Most promising avenues: ${projectContext.most_promising_avenues?.join('; ') ?? 'Not specified'}

CRAWLED INFORMATION ABOUT THIS PERSON:
${crawledContent}

Analyze this person's relevance to the founder's discovery goals. Be honest and specific — do not inflate relevance. If this person is genuinely a weak match, say so.

For recommended_questions: write questions the founder could ask this specific person that would validate or invalidate the project's key assumptions. Make them conversational and concrete, not generic.

For contact_info: extract any email, Twitter/X handle, LinkedIn URL, or personal website found in the crawled content. Only include what is actually present.

For relevance_rank: score against the founder's specific hypothesis and customer type.
- high: directly experiences the pain or controls budget for this type of solution
- medium: adjacent knowledge or partial fit
- low: minimal overlap with the founder's current focus`;

  return generateObject<PersonAnalysis>(prompt, {
    type: 'object',
    required: ['name', 'summary', 'relevance_rank', 'why_they_matter', 'key_insights', 'recommended_questions'],
    properties: {
      name: {
        type: 'string',
        description: 'Full name of the person, extracted from the crawled content.',
      },
      title: {
        type: 'string',
        description: 'Professional title or role (e.g. "Head of Product at Acme").',
      },
      company: {
        type: 'string',
        description: 'Current company or organization name.',
      },
      persona_type: {
        type: 'string',
        enum: ['potential_user', 'buyer', 'operator', 'domain_expert', 'skeptic', 'connector'],
        description: 'The persona type that best describes this person relative to the founder\'s startup.',
      },
      summary: {
        type: 'string',
        description: 'One paragraph describing who this person is and what they do.',
      },
      relevance_rank: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'How relevant this person is to the founder\'s current hypothesis.',
      },
      why_they_matter: {
        type: 'string',
        description: 'One sentence explaining why the founder should talk to this person, grounded in the project hypothesis.',
      },
      key_insights: {
        type: 'array',
        items: { type: 'string' },
        description: 'Bullet points of what was learned about this person from the crawled content.',
      },
      recommended_questions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific questions to ask this person to validate key project assumptions.',
      },
      risk_factors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Reasons this person might not be the right conversation target.',
      },
      confidence_score: {
        type: 'number',
        description: 'Confidence in the analysis quality, 0–1, based on how much usable content was found.',
      },
      contact_info: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          twitter: { type: 'string' },
          linkedin: { type: 'string' },
          website: { type: 'string' },
        },
        description: 'Contact information found in the crawled content. Only include fields that were actually found.',
      },
    },
  });
}
