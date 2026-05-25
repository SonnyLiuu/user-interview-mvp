import { generateObject } from './provider';
import type { PersonAnalysis } from '@/lib/db/schema';

type ProjectContext = {
  project_type?: 'startup' | 'networking';
  idea_summary?: string | null;
  target_customer?: string | null;
  key_assumptions?: string[] | null;
  most_promising_avenues?: string[] | null;
};

const MAX_CRAWLED_CONTENT_CHARS = 24_000;

function limitSourceMaterial(content: string) {
  if (content.length <= MAX_CRAWLED_CONTENT_CHARS) {
    return content;
  }
  return `${content.slice(0, MAX_CRAWLED_CONTENT_CHARS)}\n\n[Content truncated before analysis.]`;
}

export async function analyzePerson(
  crawledContent: string,
  projectContext: ProjectContext
): Promise<PersonAnalysis> {
  const analysisContent = limitSourceMaterial(crawledContent);
  const isNetworking = projectContext.project_type === 'networking';
  const prompt = isNetworking ? `You are an expert at helping people prioritize and personalize professional networking outreach.

OUTREACH PROJECT CONTEXT:
Campaign: ${projectContext.idea_summary ?? 'Not specified'}
Target recipients: ${projectContext.target_customer ?? 'Not specified'}
Message context / ask: ${projectContext.key_assumptions?.join('; ') ?? 'Not specified'}
Most promising recipient types: ${projectContext.most_promising_avenues?.join('; ') ?? 'Not specified'}

SOURCE MATERIAL ABOUT THIS PERSON:
${analysisContent}

Analyze this person's relevance to the outreach campaign. Be honest and specific - do not inflate relevance. If this person is genuinely a weak match, say so.

For recommended_questions: write questions or conversation openers the sender could use with this specific person. Make them conversational, concrete, and grounded in the recipient's background.

For contact_info: extract any email, Twitter/X handle, LinkedIn URL, or personal website found in the source material. Only include what is actually present.

The source material may include user-pasted profile text, crawled web sources, or both. Treat user-pasted profile text as valid source material, especially for LinkedIn profiles that cannot be crawled.

For relevance_rank: score against recipient fit, shared context, and likely usefulness for the outreach goal.
- high: directly connected to the event, community, topic, organization, or target group; likely worth a personalized note.
- medium: useful adjacent fit; their role or background overlaps with the campaign but the shared context is weaker.
- low: weak fit; little visible overlap with the outreach goal, shared context, or target recipient group.

Important: Do not assign high relevance just because someone is generally impressive. Ground the score in this outreach project's context.` : `You are an expert at helping early-stage founders identify the most valuable people to learn from during customer discovery.

FOUNDER'S PROJECT CONTEXT:
Idea: ${projectContext.idea_summary ?? 'Not specified'}
Target customer: ${projectContext.target_customer ?? 'Not specified'}
Key assumptions to validate: ${projectContext.key_assumptions?.join('; ') ?? 'Not specified'}
Most promising avenues: ${projectContext.most_promising_avenues?.join('; ') ?? 'Not specified'}

SOURCE MATERIAL ABOUT THIS PERSON:
${analysisContent}

Analyze this person's relevance to the founder's discovery goals. Be honest and specific — do not inflate relevance. If this person is genuinely a weak match, say so.

For recommended_questions: write questions the founder could ask this specific person that would validate or invalidate the project's key assumptions. Make them conversational and concrete, not generic.

For contact_info: extract any email, Twitter/X handle, LinkedIn URL, or personal website found in the source material. Only include what is actually present.

The source material may include user-pasted profile text, crawled web sources, or both. Treat user-pasted profile text as valid source material, especially for LinkedIn profiles that cannot be crawled.

For relevance_rank: score against the founder's specific hypothesis, customer type, and learning value.
- high: directly matches the target customer or buyer; currently experiences the pain; controls budget for this type of solution; or is actively doing the exact workflow the founder wants to understand.
- medium: useful learning fit; does not perfectly match the target customer, but has meaningful founder, startup, product, customer discovery, go-to-market, or technical-building experience that could inform the hypothesis. This includes founders, former founders, startup operators, accelerator participants, technical builders, or people who work closely with early-stage founders.
- low: weak fit; minimal overlap with the target customer, startup context, customer discovery, founder workflows, or the problem space.

Important: Do not assign low relevance solely because the person is not the exact target customer. If the person is a founder, former founder, startup operator, technical builder, accelerator participant, or works closely with early-stage founders, they should usually be medium unless their background has almost no connection to startup formation, customer discovery, or founder workflows.`;

  const personaTypeDescription = isNetworking ? `The persona type that best describes this person relative to the outreach project:
- potential_user: a target recipient with direct relevance to the campaign.
- buyer: a decision maker, organizer, sponsor, or senior stakeholder.
- operator: an experienced builder or practitioner with relevant execution experience.
- domain_expert: an expert with deep knowledge of the event topic, community, workflow, or domain.
- skeptic: a critical voice likely to challenge weak assumptions or positioning.
- connector: an introducer who can connect the sender to better recipients.` : `The persona type that best describes this person relative to the founder's startup:
- potential_user: a target user who may directly use the product or feel the pain.
- buyer: a decision maker who can decide, approve, or block adoption.
- operator: an experienced builder with relevant startup, product, or company-building experience.
- domain_expert: an industry expert with deep knowledge of the market, workflow, or domain.
- skeptic: a critical voice likely to challenge weak assumptions.
- connector: an introducer who can connect the founder to better interviewees.`;

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
        description: personaTypeDescription,
      },
      summary: {
        type: 'string',
        description: 'One paragraph describing who this person is and what they do.',
      },
      relevance_rank: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: isNetworking ? 'How relevant this person is to the outreach project.' : 'How relevant this person is to the founder\'s current hypothesis.',
      },
      why_they_matter: {
        type: 'string',
        description: isNetworking ? 'One sentence explaining why this person is worth contacting, grounded in the outreach project.' : 'One sentence explaining why the founder should talk to this person, grounded in the project hypothesis.',
      },
      key_insights: {
        type: 'array',
        items: { type: 'string' },
        description: 'Bullet points of what was learned about this person from the crawled content.',
      },
      recommended_questions: {
        type: 'array',
        items: { type: 'string' },
        description: isNetworking ? 'Specific questions or openers to use with this person.' : 'Specific questions to ask this person to validate key project assumptions.',
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
