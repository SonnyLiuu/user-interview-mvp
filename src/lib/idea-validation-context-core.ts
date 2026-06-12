import type { Foundation, IdeaValidationBrief } from './backend-types';

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of value) {
    const text = cleanText(item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
  }
  return cleaned;
}

export function normalizeIdeaValidationBrief(value: unknown): IdeaValidationBrief | null {
  if (!value || typeof value !== 'object') return null;
  const brief = value as IdeaValidationBrief;
  return {
    type: 'idea_validation',
    label: cleanText(brief.label) || 'Idea Validation',
    desiredOutcome: cleanText(brief.desiredOutcome) || null,
    learningGoals: cleanList(brief.learningGoals),
    targetPeople: cleanList(brief.targetPeople),
    assumptionsToTest: cleanList(brief.assumptionsToTest),
    conversationBoundaries: cleanList(brief.conversationBoundaries),
    outreachGuidance: cleanText(brief.outreachGuidance) || null,
    starterAsk: cleanText(brief.starterAsk) || null,
  };
}

export function applyIdeaValidationBrief(
  foundation: Foundation | null | undefined,
  brief: IdeaValidationBrief | null | undefined,
): Foundation {
  const base: Foundation = { ...(foundation ?? {}) };
  if (!brief) return base;

  const targetPeople = cleanList(brief.targetPeople);
  const learningGoals = cleanList(brief.learningGoals);
  const assumptionsToTest = cleanList(brief.assumptionsToTest);
  const conversationBoundaries = cleanList(brief.conversationBoundaries);
  const desiredOutcome = cleanText(brief.desiredOutcome);

  return {
    ...base,
    activeOutreachProject: {
      type: 'idea_validation',
      label: cleanText(brief.label) || 'Idea Validation',
      desiredOutcome: desiredOutcome || null,
      learningGoals,
      targetPeople,
      assumptionsToTest,
      conversationBoundaries,
      outreachGuidance: cleanText(brief.outreachGuidance) || null,
      starterAsk: cleanText(brief.starterAsk) || null,
    },
    desiredOutcome: desiredOutcome || base.desiredOutcome,
    idealPeopleTypes: targetPeople.length ? targetPeople : base.idealPeopleTypes,
    learningGoals: learningGoals.length ? learningGoals : base.learningGoals,
    keyAssumptions: assumptionsToTest.length ? assumptionsToTest : base.keyAssumptions,
    messageBoundaries: conversationBoundaries.length ? conversationBoundaries : base.messageBoundaries,
    outreachGuidance: cleanText(brief.outreachGuidance) || base.outreachGuidance,
    starterAsk: cleanText(brief.starterAsk) || base.starterAsk,
  };
}
