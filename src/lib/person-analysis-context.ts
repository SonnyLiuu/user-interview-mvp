import type { Foundation, ProjectType } from '@/lib/backend-types';
import type { ProjectMatchProfileJson } from '@/lib/db/schema';

export type PersonAnalysisContext = {
  project_type?: ProjectType;
  idea_summary?: string | null;
  target_customer?: string | null;
  key_assumptions?: string[] | null;
  most_promising_avenues?: string[] | null;
  match_rubric?: string | null;
  low_fit_signals?: string[] | null;
  match_profile_version?: number | null;
  positive_patterns?: string[] | null;
  negative_patterns?: string[] | null;
};

type MatchProfile = {
  version: number;
  profile_json: ProjectMatchProfileJson | null;
};

// Drop AI-extracted identity fields that are obviously raw profile dumps
// rather than a real title/company. Anything over this length, or that
// contains LinkedIn UI cruft, is the model failing to extract structure.
const MAX_IDENTITY_FIELD_CHARS = 140;
const IDENTITY_GARBAGE_RE = /\b(?:followers?|Follow|Message More|Featured Post|Contact info|Activity|Posts? Comments? Videos? Images? Articles?|View .+?'s profile)\b/i;

export function sanitizeIdentityField(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_IDENTITY_FIELD_CHARS) return null;
  if (IDENTITY_GARBAGE_RE.test(trimmed)) return null;
  return trimmed;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function foundationToAnalysisContext(
  foundation: Foundation | null | undefined,
  projectType: ProjectType,
  matchProfile?: MatchProfile | null,
): PersonAnalysisContext {
  const profile = matchProfile?.profile_json;

  if (projectType === 'networking') {
    const requiredMentions = stringList(foundation?.requiredMentions);
    const optionalMentions = stringList(foundation?.optionalMentions);
    const boundaries = stringList(foundation?.messageBoundaries);
    const senderContext = foundation?.senderContext;
    const desiredOutcome = foundation?.desiredOutcome;
    const personalizationStrategy = foundation?.personalizationStrategy;
    const priorityRecipientTypes = stringList(foundation?.priorityRecipientTypes);
    const lowFitSignals = stringList(foundation?.lowFitSignals);
    const resolvedPriorityRecipientTypes = priorityRecipientTypes.length
      ? priorityRecipientTypes
      : profile?.priorityRecipientTypes ?? null;

    return {
      project_type: projectType,
      idea_summary: foundation
        ? [
            foundation.outreachGoal ?? foundation.summary,
            senderContext ? `Sender context: ${senderContext}` : null,
            foundation.sharedContext ? `Shared context: ${foundation.sharedContext}` : null,
            requiredMentions.length ? `Required mentions: ${requiredMentions.join('; ')}` : null,
            optionalMentions.length ? `Optional mentions: ${optionalMentions.join('; ')}` : null,
            desiredOutcome ? `Desired outcome: ${desiredOutcome}` : null,
            personalizationStrategy ? `Personalization strategy: ${personalizationStrategy}` : null,
            foundation.tone ? `Tone: ${foundation.tone}` : null,
            foundation.channelFormat ? `Channel format: ${foundation.channelFormat}` : null,
            boundaries.length ? `Message boundaries: ${boundaries.join('; ')}` : null,
          ].filter(Boolean).join('\n')
        : null,
      target_customer: foundation?.recipients ?? foundation?.targetUser ?? null,
      key_assumptions: foundation
        ? [
            foundation.sharedContext ?? foundation.painPoint,
            desiredOutcome,
            senderContext,
            personalizationStrategy,
            foundation.tone,
            foundation.channelFormat,
          ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : null,
      most_promising_avenues: resolvedPriorityRecipientTypes,
      match_rubric: profile?.matchRubric ?? foundation?.matchRubric ?? null,
      low_fit_signals: lowFitSignals.length ? lowFitSignals : profile?.lowFitSignals ?? [],
      match_profile_version: matchProfile?.version ?? null,
      positive_patterns: profile?.positivePatterns ?? [],
      negative_patterns: profile?.negativePatterns ?? [],
    };
  }

  return {
    project_type: projectType,
    idea_summary: foundation
      ? [
          foundation.summary,
          foundation.painPoint ? `Pain point: ${foundation.painPoint}` : null,
          foundation.valueProp ? `Value proposition: ${foundation.valueProp}` : null,
          foundation.desiredOutcome ? `Idea Validation outcome: ${foundation.desiredOutcome}` : null,
          foundation.learningGoals?.length ? `Learning goals: ${foundation.learningGoals.join('; ')}` : null,
          foundation.messageBoundaries?.length ? `Conversation boundaries: ${foundation.messageBoundaries.join('; ')}` : null,
        ].filter(Boolean).join('\n')
      : null,
    target_customer: foundation?.targetUser ?? null,
    key_assumptions: foundation
      ? [
          ...stringList(foundation.keyAssumptions),
          foundation.painPoint,
          foundation.valueProp,
          foundation.targetUser,
          foundation.desiredOutcome,
        ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : null,
    most_promising_avenues: foundation?.idealPeopleTypes ?? null,
    match_rubric: profile?.matchRubric ?? foundation?.matchRubric ?? null,
    low_fit_signals: profile?.lowFitSignals ?? stringList(foundation?.messageBoundaries),
    match_profile_version: matchProfile?.version ?? null,
    positive_patterns: profile?.positivePatterns ?? [],
    negative_patterns: profile?.negativePatterns ?? [],
  };
}
