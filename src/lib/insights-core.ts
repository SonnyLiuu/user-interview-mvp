import type { InsightContent } from '@/lib/db/schema';

export const CURRENT_INSIGHT_SCHEMA_VERSION = 3;

export type InsightFreshnessStats = {
  interviewCount: number;
  latestDataAt: Date | null;
};

export type InterviewQuestionFlag = {
  question: string;
  issue: string;
  suggestion: string;
  severity: 'watch' | 'problem';
};

export type TranscriptEvidenceMoment = {
  quote: string;
  reason: string;
};

export type MissedProbe = {
  context: string;
  suggestedQuestion: string;
};

export type TranscriptTechniqueReview = {
  summary: string;
  evidenceSignals: string[];
  strongEvidenceMoments: TranscriptEvidenceMoment[];
  weakEvidenceMoments: TranscriptEvidenceMoment[];
  questionFlags: InterviewQuestionFlag[];
  missedProbes: MissedProbe[];
  suggestedFollowUps: string[];
  reliability: 'low' | 'medium' | 'high';
};

type CurrentInsightSnapshot = {
  calls_analyzed: number | null;
  generated_at: Date | null;
  content?: unknown;
};

const DEFAULT_HEADLINE = 'Early learning is taking shape';
const DEFAULT_SUMMARY = 'User Interview has interview data to synthesize, but the current evidence is still light.';
const DEFAULT_TAKEAWAY = 'Look for repeated pain, urgency, and current workaround patterns.';
const DEFAULT_NEXT_FOCUS = 'Run another focused interview and ask for concrete recent examples.';
const DEFAULT_COACH_VERDICT = 'The interviews have useful signals, but the founder should keep pressure on concrete past behavior.';
const DEFAULT_MAIN_RISK = 'The current evidence may be thin or biased if the interview accepts hypotheticals too quickly.';

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

function recordValue(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function dedupeStrings(values: string[], limit = 12) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function cleanInteger(value: unknown, fallback: number, min = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.round(value));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function clip(value: string, maxLength = 220) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function transcriptLines(transcript: string) {
  return transcript
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]{1,40}):\s*(.+)$/);
      return {
        speaker: match?.[1]?.trim() ?? '',
        text: (match?.[2] ?? line).trim(),
      };
    });
}

function founderQuestions(transcript: string) {
  return transcriptLines(transcript)
    .filter((line) => /^(founder|interviewer|host|moderator)$/i.test(line.speaker) || (!line.speaker && line.text.includes('?')))
    .flatMap((line) => line.text.match(/[^?]+\?/g) ?? [])
    .map((question) => clip(question))
    .filter(Boolean);
}

function intervieweeEvidenceSignals(transcript: string) {
  const signalPattern = /\b(manual|manually|time consuming|too long|give up|stop there|hard problem|case-by-case|personalized|constraint|wear different hats|hours?|minutes?|cannot be automated)\b/i;
  return transcriptLines(transcript)
    .filter((line) => /^(interviewee|participant|customer|user|prospect)$/i.test(line.speaker))
    .map((line) => line.text)
    .filter((text) => signalPattern.test(text))
    .map((text) => clip(text, 180));
}

function strongEvidenceMoments(transcript: string): TranscriptEvidenceMoment[] {
  const concretePattern = /\b(last time|yesterday|today|currently|usually|typically|every|per week|per month|\d+\s*(minutes?|hours?|days?)|manual|manually|spreadsheet|linkedin|website|blogs?|gave up|stop there|skipped|moved on|paid|tried|use|using)\b/i;
  return transcriptLines(transcript)
    .filter((line) => /^(interviewee|participant|customer|user|prospect)$/i.test(line.speaker))
    .map((line) => line.text)
    .filter((text) => concretePattern.test(text) && text.length > 24)
    .map((text) => ({
      quote: clip(text, 180),
      reason: 'Concrete behavior, timing, current process, or workaround detail.',
    }))
    .slice(0, 5);
}

function weakEvidenceMoments(transcript: string): TranscriptEvidenceMoment[] {
  const weakPattern = /\b(sure it would help|would help|probably|maybe|i think|i guess|sounds useful|sounds good|could be helpful|interesting)\b/i;
  return transcriptLines(transcript)
    .filter((line) => /^(interviewee|participant|customer|user|prospect)$/i.test(line.speaker))
    .map((line) => line.text)
    .filter((text) => weakPattern.test(text))
    .map((text) => ({
      quote: clip(text, 180),
      reason: 'Likely opinion or polite agreement; treat as low-confidence evidence unless backed by past behavior.',
    }))
    .slice(0, 4);
}

function hasSolutionValidationShape(question: string) {
  const text = question.toLowerCase();
  const proposesSolution = /\b(tool|product|feature|agent|automate|automation|helps?|solution|platform)\b/.test(text);
  const asksForApproval = /\b(would|could|can)\b.+\b(help|use|pay|buy|valuable|useful|interested|solve|save)\b/.test(text);
  const hypothetical = /\b(if|somebody|someone|came up with|there was|imagine)\b/.test(text);
  return proposesSolution && asksForApproval && hypothetical;
}

function hasHypotheticalValidationShape(question: string) {
  const text = question.toLowerCase();
  const asksForFutureIntent = /\b(would|will|could)\b.+\b(use|pay|buy|try|switch|adopt|help|valuable|useful|interested)\b/.test(text);
  const notGroundedInPast = !/\b(last time|most recent|currently|today|yesterday|how do you|what do you currently|tell me about)\b/.test(text);
  return asksForFutureIntent && notGroundedInPast;
}

function hasClosedValidationShape(question: string) {
  return /\b(would you say|do you think|would that|would this|is that|does that)\b.+\b(help|useful|valuable|interesting|solve|better)\b/i.test(question);
}

function hasCompoundShape(question: string) {
  const text = question.toLowerCase();
  const promptCount = (text.match(/\b(how|what|when|where|why|do you|have you|would you|could you|is there|are there)\b/g) ?? []).length;
  return promptCount > 1 && /\b(and|or|also)\b/.test(text);
}

function flagQuestion(question: string): InterviewQuestionFlag | null {
  if (hasSolutionValidationShape(question)) {
    return {
      question,
      issue: 'Leading solution-validation question. It describes the hoped-for product benefit and invites agreement instead of evidence.',
      suggestion: 'Ask for a recent concrete example instead: "Tell me about the last time you tried to speed up that research while keeping the message personal. What happened?"',
      severity: 'problem',
    };
  }

  if (hasHypotheticalValidationShape(question)) {
    return {
      question,
      issue: 'Hypothetical validation question. Future intent is weaker than evidence from what the interviewee already does.',
      suggestion: 'Ask for past behavior: "What did you do the last time this came up, and what did it cost you?"',
      severity: 'problem',
    };
  }

  if (hasClosedValidationShape(question)) {
    return {
      question,
      issue: 'Closed validation question. It is likely to produce a polite yes/no answer rather than a story about real behavior.',
      suggestion: 'Reframe toward behavior: "What have you already tried, and where did it break down?"',
      severity: 'watch',
    };
  }

  if (hasCompoundShape(question)) {
    return {
      question,
      issue: 'Compound question. Multiple prompts make it easier for the interviewee to answer only the easiest part.',
      suggestion: 'Split it into one prompt, then follow the answer: "What part took the most manual effort?"',
      severity: 'watch',
    };
  }

  return null;
}

function missedProbes(transcript: string): MissedProbe[] {
  const lines = transcriptLines(transcript);
  const out: MissedProbe[] = [];
  const vagueImportantPattern = /\b(time consuming|hard problem|case-by-case|constraint|too long|cannot be automated|give up|stop there|wear different hats)\b/i;
  const goodProbePattern = /\b(last time|for example|tell me about|walk me through|how often|how much|what happened|what did you|why|when|exactly)\b/i;

  for (let index = 0; index < lines.length - 1; index++) {
    const line = lines[index];
    const next = lines[index + 1];
    if (!/^(interviewee|participant|customer|user|prospect)$/i.test(line.speaker)) continue;
    if (!vagueImportantPattern.test(line.text)) continue;
    if (!/^(founder|interviewer|host|moderator)$/i.test(next.speaker)) continue;
    if (goodProbePattern.test(next.text)) continue;

    out.push({
      context: clip(line.text, 180),
      suggestedQuestion: 'Can you walk me through the last time that happened, step by step?',
    });
    if (out.length >= 4) break;
  }

  return out;
}

function summarizeTranscript(transcript: string, evidenceSignals: string[]) {
  if (evidenceSignals.length) return evidenceSignals[0];
  const firstIntervieweeLine = transcriptLines(transcript).find((line) =>
    /^(interviewee|participant|customer|user|prospect)$/i.test(line.speaker) && line.text.length > 20
  );
  return firstIntervieweeLine
    ? clip(firstIntervieweeLine.text)
    : 'Transcript captured for review; look for concrete behavior, urgency, and current workarounds.';
}

function reliabilityForReview(
  questionFlags: InterviewQuestionFlag[],
  strongMoments: TranscriptEvidenceMoment[],
  weakMoments: TranscriptEvidenceMoment[],
  probes: MissedProbe[],
): TranscriptTechniqueReview['reliability'] {
  const problemFlags = questionFlags.filter((flag) => flag.severity === 'problem').length;
  if (problemFlags > 0) return 'low';
  if (strongMoments.length >= 3 && problemFlags === 0 && probes.length <= 1) return 'high';
  if (strongMoments.length >= 1 && problemFlags <= 1 && weakMoments.length <= 2) return 'medium';
  return 'low';
}

export function analyzeTranscriptTechnique(transcript: string, notes = ''): TranscriptTechniqueReview {
  const combined = [transcript, notes].filter(Boolean).join('\n');
  const evidenceSignals = dedupeStrings(intervieweeEvidenceSignals(combined), 5);
  const strongMoments = strongEvidenceMoments(combined);
  const weakMoments = weakEvidenceMoments(combined);
  const questionFlags = founderQuestions(combined)
    .map(flagQuestion)
    .filter((flag): flag is InterviewQuestionFlag => flag !== null)
    .slice(0, 4);
  const probes = missedProbes(combined);
  const reliability = reliabilityForReview(questionFlags, strongMoments, weakMoments, probes);

  const suggestedFollowUps = dedupeStrings([
    questionFlags.length
      ? 'Replace solution-validation questions with recent-behavior prompts before describing the product.'
      : '',
    probes.length
      ? 'When the interviewee says something is hard or time consuming, pause and ask for the last concrete example.'
      : '',
    evidenceSignals.length
      ? 'Ask for the last specific instance, the exact time spent, and what they did after the workaround became painful.'
      : 'Ask for concrete recent examples, current workarounds, and moments when the problem became urgent.',
    'Probe what they have already tried, paid for, delegated, or abandoned.',
  ], 3);

  return {
    summary: summarizeTranscript(combined, evidenceSignals),
    evidenceSignals,
    strongEvidenceMoments: strongMoments,
    weakEvidenceMoments: weakMoments,
    questionFlags,
    missedProbes: probes,
    suggestedFollowUps,
    reliability,
  };
}

export function evidenceLevelForCalls(callCount: number): InsightContent['learningSummary']['evidenceLevel'] {
  if (callCount >= 5) return 'strong';
  if (callCount >= 2) return 'emerging';
  return 'thin';
}

function hasCurrentInsightSchema(content: unknown) {
  const root = recordValue(content);
  const coach = recordValue(root.interviewCoach);
  return root.schemaVersion === CURRENT_INSIGHT_SCHEMA_VERSION &&
    typeof coach.verdict === 'string' &&
    typeof coach.mainRisk === 'string' &&
    Array.isArray(coach.trustworthyEvidence) &&
    Array.isArray(coach.cautionAreas);
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
  if (current.content !== undefined && !hasCurrentInsightSchema(current.content)) return false;
  if (!stats.latestDataAt) return true;
  return current.generated_at >= stats.latestDataAt;
}

function normalizeEvidenceMoments(value: unknown, fallback: InsightContent['interviewCoach']['trustworthyEvidence']) {
  if (!Array.isArray(value)) return fallback;
  const moments = value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      personName: cleanString(item.personName, 'Interviewee'),
      quote: cleanString(item.quote, ''),
      reason: cleanString(item.reason, 'Concrete evidence from the interview.'),
    }))
    .filter((item) => item.quote)
    .slice(0, 6);
  return moments.length ? moments : fallback;
}

function normalizeCautionAreas(value: unknown, fallback: InsightContent['interviewCoach']['cautionAreas']) {
  if (!Array.isArray(value)) return fallback;
  const cautions = value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      personName: cleanString(item.personName, 'Interviewee'),
      quote: cleanString(item.quote, ''),
      concern: cleanString(item.concern, 'Treat this as low-confidence evidence.'),
      betterProbe: cleanString(item.betterProbe, 'What did you do the last time this happened?'),
    }))
    .filter((item) => item.quote || item.concern)
    .slice(0, 6);
  return cautions.length ? cautions : fallback;
}

function normalizeCoachingPatterns(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      pattern: cleanString(item.pattern, 'Interview pattern'),
      whyItMatters: cleanString(item.whyItMatters, 'This affects how trustworthy the learning is.'),
      example: cleanString(item.example, ''),
      fix: cleanString(item.fix, 'Ask for a recent concrete example.'),
    }))
    .filter((item) => item.pattern)
    .slice(0, 4);
}

export function normalizeInsightContent(
  value: unknown,
  fallback: { callsAnalyzed: number; assumptions?: string[] } = { callsAnalyzed: 0 },
): InsightContent {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const learning = root.learningSummary && typeof root.learningSummary === 'object'
    ? root.learningSummary as Record<string, unknown>
    : {};
  const coach = root.interviewCoach && typeof root.interviewCoach === 'object'
    ? root.interviewCoach as Record<string, unknown>
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
  const defaultTrustworthyEvidence: InsightContent['interviewCoach']['trustworthyEvidence'] = [];
  const defaultCautionAreas: InsightContent['interviewCoach']['cautionAreas'] = [];
  const recurringPatterns = normalizeCoachingPatterns(coach.recurringPatterns);

  return {
    schemaVersion: CURRENT_INSIGHT_SCHEMA_VERSION,
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
    interviewCoach: {
      verdict: cleanString(coach.verdict, DEFAULT_COACH_VERDICT),
      reliability: enumValue(coach.reliability, ['low', 'medium', 'high'] as const, callsAnalyzed >= 3 ? 'medium' : 'low'),
      mainRisk: cleanString(coach.mainRisk, DEFAULT_MAIN_RISK),
      recurringPatterns: recurringPatterns.length ? recurringPatterns : [{
        pattern: 'Push from opinion into behavior',
        whyItMatters: 'Founder discovery is most reliable when answers describe what already happened.',
        example: 'The founder asks whether something would help instead of asking what the interviewee did last time.',
        fix: 'Ask for the last specific instance, current workaround, time spent, and consequence.',
      }],
      trustworthyEvidence: normalizeEvidenceMoments(coach.trustworthyEvidence, defaultTrustworthyEvidence),
      cautionAreas: normalizeCautionAreas(coach.cautionAreas, defaultCautionAreas),
    },
  };
}
