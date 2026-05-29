import type { InsightContent } from '@/lib/db/schema';

export type InsightFreshnessStats = {
  interviewCount: number;
  latestDataAt: Date | null;
};

type CurrentInsightSnapshot = {
  calls_analyzed: number | null;
  generated_at: Date | null;
};

const DEFAULT_HEADLINE = 'Early learning is taking shape';
const DEFAULT_SUMMARY = 'Foundry has interview data to synthesize, but the current evidence is still light.';
const DEFAULT_TAKEAWAY = 'Look for repeated pain, urgency, and current workaround patterns.';
const DEFAULT_NEXT_FOCUS = 'Run another focused interview and ask for concrete recent examples.';

function cleanString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function cleanStringList(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return cleaned.length ? cleaned : fallback;
}

function cleanInteger(value: unknown, fallback: number, min = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.round(value));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

export function evidenceLevelForCalls(callCount: number): InsightContent['learningSummary']['evidenceLevel'] {
  if (callCount >= 5) return 'strong';
  if (callCount >= 2) return 'emerging';
  return 'thin';
}

export function hasInterviewData(stats: { completedInteractionCount: number; transcriptCount: number }) {
  return stats.completedInteractionCount > 0 || stats.transcriptCount > 0;
}

export function isInsightFresh(
  current: CurrentInsightSnapshot | null | undefined,
  stats: InsightFreshnessStats,
) {
  if (!current || !current.generated_at) return false;
  if ((current.calls_analyzed ?? 0) !== stats.interviewCount) return false;
  if (!stats.latestDataAt) return true;
  return current.generated_at >= stats.latestDataAt;
}

export function normalizeInsightContent(
  value: unknown,
  fallback: { callsAnalyzed: number; assumptions?: string[] } = { callsAnalyzed: 0 },
): InsightContent {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const learning = root.learningSummary && typeof root.learningSummary === 'object'
    ? root.learningSummary as Record<string, unknown>
    : {};
  const callsAnalyzed = cleanInteger(
    learning.callsAnalyzed,
    fallback.callsAnalyzed,
  );

  const recurringThemes = Array.isArray(root.recurringThemes)
    ? root.recurringThemes
        .filter((theme): theme is Record<string, unknown> => !!theme && typeof theme === 'object')
        .map((theme) => {
          const supportingQuotes = Array.isArray(theme.supportingQuotes)
            ? theme.supportingQuotes
                .filter((quote): quote is Record<string, unknown> => !!quote && typeof quote === 'object')
                .map((quote) => ({
                  personName: cleanString(quote.personName, 'Interviewee'),
                  quote: cleanString(quote.quote, ''),
                }))
                .filter((quote) => quote.quote)
                .slice(0, 2)
            : [];
          return {
            theme: cleanString(theme.theme, 'Emerging theme'),
            description: cleanString(theme.description, 'This theme needs more interview evidence.'),
            callCount: cleanInteger(theme.callCount, 1, 1),
            evidenceStrength: enumValue(theme.evidenceStrength, ['weak', 'emerging', 'strong'] as const, 'weak'),
            supportingQuotes,
          };
        })
        .filter((theme) => theme.theme)
        .slice(0, 5)
    : [];

  const assumptionTracker = Array.isArray(root.assumptionTracker)
    ? root.assumptionTracker
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          assumption: cleanString(item.assumption, 'Interview assumption'),
          status: enumValue(item.status, ['strengthening', 'weakening', 'unclear', 'new'] as const, 'unclear'),
          confidence: enumValue(item.confidence, ['low', 'medium', 'high'] as const, 'low'),
          evidence: cleanStringList(item.evidence, ['Needs more evidence.']).slice(0, 3),
          nextQuestion: cleanString(item.nextQuestion, 'What concrete example would confirm or disconfirm this?'),
        }))
        .filter((item) => item.assumption)
        .slice(0, 8)
    : [];

  const fallbackAssumptions = cleanStringList(fallback.assumptions).slice(0, 5);

  return {
    learningSummary: {
      headline: cleanString(learning.headline, DEFAULT_HEADLINE),
      summary: cleanString(learning.summary, DEFAULT_SUMMARY),
      callsAnalyzed,
      evidenceLevel: enumValue(learning.evidenceLevel, ['thin', 'emerging', 'strong'] as const, evidenceLevelForCalls(callsAnalyzed)),
      topTakeaway: cleanString(learning.topTakeaway, DEFAULT_TAKEAWAY),
      nextFocus: cleanString(learning.nextFocus, DEFAULT_NEXT_FOCUS),
    },
    recurringThemes: recurringThemes.length ? recurringThemes : [{
      theme: 'Evidence is still thin',
      description: 'More interviews are needed before recurring themes become reliable.',
      callCount: Math.max(1, callsAnalyzed),
      evidenceStrength: 'weak',
      supportingQuotes: [],
    }],
    assumptionTracker: assumptionTracker.length
      ? assumptionTracker
      : (fallbackAssumptions.length ? fallbackAssumptions : ['The target user has a painful enough problem to change behavior.']).map((assumption) => ({
          assumption,
          status: 'unclear',
          confidence: 'low',
          evidence: ['Needs more interview evidence.'],
          nextQuestion: 'What recent concrete example would make this assumption more or less true?',
        })),
  };
}
