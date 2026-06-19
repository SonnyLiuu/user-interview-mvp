import { generateObject } from './provider';
import type { PersonAnalysis } from '@/lib/db/schema';
import { GLOBAL_TAG_ALLOWLISTS } from '@/lib/global-people-core';
import { matchRankForScore, normalizeMatchScore, scoreFromRank } from '@/lib/match-profile';
import type { PersonAnalysisContext } from '@/lib/person-analysis-context';

const MAX_CRAWLED_CONTENT_CHARS = 24_000;

function limitSourceMaterial(content: string) {
  if (content.length <= MAX_CRAWLED_CONTENT_CHARS) {
    return content;
  }
  return `${content.slice(0, MAX_CRAWLED_CONTENT_CHARS)}\n\n[Content truncated before analysis.]`;
}

export async function analyzePerson(
  crawledContent: string,
  projectContext: PersonAnalysisContext
): Promise<PersonAnalysis> {
  const analysisContent = limitSourceMaterial(crawledContent);
  const isNetworking = projectContext.project_type === 'networking';
  const globalTagInstructions = `For global_tags: assign all supported tags from these allowlists; people can belong to multiple categories. Omit tags when unsupported by the source material.
- role_tags: ${GLOBAL_TAG_ALLOWLISTS.role_tags.join(', ')}
- market_tags: ${GLOBAL_TAG_ALLOWLISTS.market_tags.join(', ')}
- seniority_tags: ${GLOBAL_TAG_ALLOWLISTS.seniority_tags.join(', ')}
- project_fit_tags: ${GLOBAL_TAG_ALLOWLISTS.project_fit_tags.join(', ')}
- learning_value_tags: ${GLOBAL_TAG_ALLOWLISTS.learning_value_tags.join(', ')}`;
  const prompt = isNetworking ? `You are an expert at helping people prioritize and personalize professional networking outreach.

OUTREACH PROJECT CONTEXT:
Campaign: ${projectContext.idea_summary ?? 'Not specified'}
Target recipients: ${projectContext.target_customer ?? 'Not specified'}
Message context / ask: ${projectContext.key_assumptions?.join('; ') ?? 'Not specified'}
Most promising recipient types: ${projectContext.most_promising_avenues?.join('; ') ?? 'Not specified'}
Match rubric: ${projectContext.match_rubric ?? 'Not specified'}
Low-fit signals: ${projectContext.low_fit_signals?.join('; ') ?? 'Not specified'}
Positive calibration patterns from this project: ${projectContext.positive_patterns?.join('; ') ?? 'Not specified'}
Negative calibration patterns from this project: ${projectContext.negative_patterns?.join('; ') ?? 'Not specified'}

SOURCE MATERIAL ABOUT THIS PERSON:
${analysisContent}

Analyze this person's relevance to the outreach campaign. Be honest and specific - do not inflate relevance. If this person is genuinely a weak match, say so.

Research only the recipient background necessary for the outreach. The sender's goals, required mentions, desired response, and composition style matter more than a full biography.

For summary: write one sentence naming the outreach angle, not a career summary.
For key_insights: write 1-3 useful personalization hooks. Prefer lightweight hooks over comprehensive background.
For recommended_questions: write message notes or conversation openers the sender could use with this specific person. Make them brief and grounded in the outreach goal.
For risk_factors: write details to avoid mentioning or reasons personalization may be weak.
For why_they_matter: write compact card copy for the people page. Use 8-16 words, one sentence, no name, no company, no caveats. State the concrete outreach/interview value, like "Useful for pressure-testing market assumptions before scaling outreach."
For sections: produce mode-specific profile sections for the UI:
- outreach_angle: text, title "Outreach Angle"
- useful_background: list, title "Useful Background"
- personalization_hooks: list, title "Personalization Hooks"
- message_notes: list, title "Message Notes"
- avoid_mentioning: list, title "Avoid Mentioning"

For contact_info: extract any email, Twitter/X handle, LinkedIn URL, or personal website found in the source material. Only include what is actually present.

The source material may include user-pasted profile text, crawled web sources, or both. Treat user-pasted profile text as valid source material, especially for LinkedIn profiles that cannot be crawled.

For title: return only the person's role/title. Do not include the company, employer, or "at"/"@" company suffix. Put the current employer only in company.

For relevance_rank: score against recipient fit, shared context, and likely usefulness for the outreach goal.
- high: directly connected to the event, community, topic, organization, or target group; likely worth a personalized note.
- medium: useful adjacent fit; their role or background overlaps with the campaign but the shared context is weaker.
- low: weak fit; little visible overlap with the outreach goal, shared context, or target recipient group.

For match_score: return an integer from 0 to 100. Derive match_rank from the score: high >= 75, medium >= 45, low < 45.
For match_factors: score each factor from 0 to 100:
- recipient_fit: how well this person fits the target recipient types.
- topic_overlap: overlap with priority topics, communities, or organizations.
- shared_context: strength of event, relationship, community, timing, or mutual context.
- desired_response_usefulness: likelihood this person can usefully provide the desired response.
- personalization_quality: amount and specificity of usable personalization evidence.
- evidence_confidence: confidence based on source quality and amount of usable evidence.
For match_explanation: write 1-2 concise sentences explaining the score and the main limiter.

${globalTagInstructions}

Important: Do not assign a high match just because someone is generally impressive. Ground the score in this outreach project's rubric and calibration patterns.` : `You are an expert at helping early-stage founders identify the most valuable people to learn from during idea validation.

FOUNDER'S PROJECT CONTEXT:
Idea: ${projectContext.idea_summary ?? 'Not specified'}
Target customer: ${projectContext.target_customer ?? 'Not specified'}
Key assumptions to validate: ${projectContext.key_assumptions?.join('; ') ?? 'Not specified'}
Most promising avenues: ${projectContext.most_promising_avenues?.join('; ') ?? 'Not specified'}
Idea Validation match rubric: ${projectContext.match_rubric ?? 'Not specified'}
Low-fit signals: ${projectContext.low_fit_signals?.join('; ') ?? 'Not specified'}
Positive calibration patterns from this startup: ${projectContext.positive_patterns?.join('; ') ?? 'Not specified'}
Negative calibration patterns from this startup: ${projectContext.negative_patterns?.join('; ') ?? 'Not specified'}

SOURCE MATERIAL ABOUT THIS PERSON:
${analysisContent}

Analyze this person's relevance to the founder's idea validation goals. Be honest and specific — do not inflate relevance. If this person is genuinely a weak match, say so.

For recommended_questions: write questions the founder could ask this specific person that would validate or invalidate the project's key assumptions. Make them conversational and concrete, not generic.
For why_they_matter: write compact card copy for the people page. Use 8-16 words, one sentence, no name, no company, no caveats. State the concrete interview value, like "Strong fit for workflow pain and current workaround research."

For contact_info: extract any email, Twitter/X handle, LinkedIn URL, or personal website found in the source material. Only include what is actually present.

The source material may include user-pasted profile text, crawled web sources, or both. Treat user-pasted profile text as valid source material, especially for LinkedIn profiles that cannot be crawled.

For title: return only the person's role/title. Do not include the company, employer, or "at"/"@" company suffix. Put the current employer only in company.

For relevance_rank: score against the founder's specific hypothesis, customer type, and learning value.
- high: directly matches the target customer or buyer; currently experiences the pain; controls budget for this type of solution; or is actively doing the exact workflow the founder wants to understand.
- medium: useful learning fit; does not perfectly match the target customer, but has meaningful founder, startup, product, idea validation, go-to-market, or technical-building experience that could inform the hypothesis. This includes founders, former founders, startup operators, accelerator participants, technical builders, or people who work closely with early-stage founders.
- low: weak fit; minimal overlap with the target customer, startup context, idea validation, founder workflows, or the problem space.

For match_score: when an Idea Validation match rubric is provided, return an integer from 0 to 100 that reflects this person's fit for the current Idea Validation outreach project. Derive match_rank from the score: high >= 75, medium >= 45, low < 45.
For match_factors: when an Idea Validation match rubric is provided, score each factor from 0 to 100:
- recipient_fit: how well this person fits the target interviewee types.
- topic_overlap: overlap with the startup problem, workflow, or market.
- shared_context: strength of relevant founder, community, industry, or timing context.
- desired_response_usefulness: likelihood this person can answer the validation questions usefully.
- personalization_quality: amount and specificity of usable interview or outreach context.
- evidence_confidence: confidence based on source quality and usable evidence.
For match_explanation: when an Idea Validation match rubric is provided, write 1-2 concise sentences explaining why this person is or is not a strong learning conversation target.

${globalTagInstructions}

Important: Do not assign low relevance solely because the person is not the exact target customer. If the person is a founder, former founder, startup operator, technical builder, accelerator participant, or works closely with early-stage founders, they should usually be medium unless their background has almost no connection to startup formation, idea validation, or founder workflows.`;

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

  const analysis = await generateObject<PersonAnalysis>(prompt, {
    type: 'object',
    required: ['name', 'summary', 'relevance_rank', 'why_they_matter', 'key_insights', 'recommended_questions'],
    properties: {
      name: {
        type: 'string',
        description: 'Full name of the person, extracted from the crawled content.',
      },
      title: {
        type: 'string',
        description: 'Professional title or role only, excluding company/employer text (e.g. "Head of Product", not "Head of Product at Acme").',
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
        description: isNetworking ? 'One sentence describing the outreach angle, not a biography.' : 'One paragraph describing who this person is and what they do.',
      },
      relevance_rank: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: isNetworking ? 'How relevant this person is to the outreach project.' : 'How relevant this person is to the founder\'s current hypothesis.',
      },
      match_score: {
        type: 'number',
        description: isNetworking ? 'Outreach project match score from 0 to 100.' : 'Optional match score from 0 to 100.',
      },
      match_rank: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Rank derived from match_score: high >= 75, medium >= 45, low < 45.',
      },
      match_factors: {
        type: 'object',
        properties: {
          recipient_fit: { type: 'number' },
          topic_overlap: { type: 'number' },
          shared_context: { type: 'number' },
          desired_response_usefulness: { type: 'number' },
          personalization_quality: { type: 'number' },
          evidence_confidence: { type: 'number' },
        },
        description: 'Factor scores from 0 to 100 explaining the match score.',
      },
      match_explanation: {
        type: 'string',
        description: 'Concise explanation of the score and the main limiter.',
      },
      why_they_matter: {
        type: 'string',
        description: isNetworking
          ? 'Compact people-card synopsis: 8-16 words explaining the concrete outreach or interview value. No name, company, biography, caveat, or long rationale.'
          : 'Compact people-card synopsis: 8-16 words explaining the concrete interview value. No name, company, biography, caveat, or long rationale.',
      },
      key_insights: {
        type: 'array',
        items: { type: 'string' },
        description: isNetworking ? '1-3 lightweight personalization hooks useful for outreach.' : 'Bullet points of what was learned about this person from the crawled content.',
      },
      recommended_questions: {
        type: 'array',
        items: { type: 'string' },
        description: isNetworking ? 'Specific questions or openers to use with this person.' : 'Specific questions to ask this person to validate key project assumptions.',
      },
      risk_factors: {
        type: 'array',
        items: { type: 'string' },
        description: isNetworking ? 'Details to avoid mentioning or reasons personalization may be weak.' : 'Reasons this person might not be the right conversation target.',
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'title', 'kind'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            kind: { type: 'string', enum: ['text', 'list'] },
            text: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
          },
        },
        description: isNetworking ? 'Mode-specific person profile sections for networking outreach.' : 'Optional mode-specific profile sections.',
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
      global_tags: {
        type: 'object',
        properties: {
          role_tags: { type: 'array', items: { type: 'string', enum: GLOBAL_TAG_ALLOWLISTS.role_tags } },
          market_tags: { type: 'array', items: { type: 'string', enum: GLOBAL_TAG_ALLOWLISTS.market_tags } },
          seniority_tags: { type: 'array', items: { type: 'string', enum: GLOBAL_TAG_ALLOWLISTS.seniority_tags } },
          project_fit_tags: { type: 'array', items: { type: 'string', enum: GLOBAL_TAG_ALLOWLISTS.project_fit_tags } },
          learning_value_tags: { type: 'array', items: { type: 'string', enum: GLOBAL_TAG_ALLOWLISTS.learning_value_tags } },
        },
        description: 'Global recommendation tags for future people recommendations. Use only supported tags.',
      },
    },
  });

  if (!isNetworking && !projectContext.match_profile_version) return analysis;

  const score = normalizeMatchScore(analysis.match_score) ?? scoreFromRank(analysis.relevance_rank) ?? 0;
  const rank = matchRankForScore(score);
  return {
    ...analysis,
    match_score: score,
    match_rank: rank,
    relevance_rank: rank,
  };
}
