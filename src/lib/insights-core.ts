import type { InsightContent } from '@/lib/db/schema';

export const CURRENT_INSIGHT_SCHEMA_VERSION = 7;

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
  reliability: 'low' | 'medium' | 'high';
  evidenceSignals: string[];
  strongEvidenceMoments: TranscriptEvidenceMoment[];
  weakEvidenceMoments: TranscriptEvidenceMoment[];
  questionFlags: InterviewQuestionFlag[];
  missedProbes: MissedProbe[];
  suggestedFollowUps: string[];
};

type CurrentInsightSnapshot = {
  calls_analyzed: number | null;
  generated_at: Date | null;
  content?: unknown;
};

const DEFAULT_OVERVIEW_OPENER = 'The interviews so far are beginning to separate useful signals from open questions. Treat the current learning as directional until more people repeat the same pain, workaround, and urgency patterns.';
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

function strongEvidenceReason(quote: string): string {
  const q = quote.toLowerCase();

  const isPast = /\b(last time|yesterday|tried|paid|gave up|stopped|skipped|moved on|abandoned|switched)\b/i.test(q);
  const isCurrent = /\b(currently|usually|typically|every day|every week|per week|per month|right now|at the moment)\b/i.test(q);
  const isQuantified = /\b\d+\s*(minutes?|hours?|days?|weeks?|months?|percent|dollars?|people|times?)\b/i.test(q);
  const isTool = /\b(manual|manually|spreadsheet|linkedin|website|blog|csv|excel|google doc|notion|airtable|trello|asana|slack|email|pdf|chrome)\b/i.test(q);
  const isFrustration = /\b(gave up|stop there|skipped|moved on|frustrating|painful|waste|hate|annoying|too long)\b/i.test(q);

  if (isPast && isTool) return 'Recounts a specific past situation using a named tool or workaround — real behavior, not opinion.';
  if (isPast && isQuantified) return 'Describes a concrete past action with quantifiable detail — specific, measurable evidence.';
  if (isPast) return 'Describes a specific past action or decision — grounded in real experience, not hypotheticals.';
  if (isCurrent && isTool) return 'Describes their current, day-to-day process using a real tool — habitual behavior is strong evidence.';
  if (isCurrent && isQuantified) return 'Describes ongoing behavior with measurable frequency — recurring evidence is more reliable.';
  if (isCurrent) return 'Describes a current habit or routine — what they actually do now is stronger than what they say they would do.';
  if (isFrustration && isTool) return 'Shows frustration tied to a real tool or process — pain-driven evidence signals a real problem worth solving.';
  if (isFrustration) return 'Expresses concrete frustration or a breaking point — emotional weight strengthens the signal.';
  if (isTool) return 'Names a real tool or process they use — anchored in actual behavior, not abstract preference.';
  if (isQuantified) return 'Includes a specific number, time, or frequency — quantifiable evidence carries more weight than vague claims.';
  return 'Contains concrete behavioral detail — grounded in action rather than speculation.';
}

function strongEvidenceMoments(transcript: string): TranscriptEvidenceMoment[] {
  const concretePattern = /\b(last time|yesterday|today|currently|usually|typically|every|per week|per month|\d+\s*(minutes?|hours?|days?)|manual|manually|spreadsheet|linkedin|website|blogs?|gave up|stop there|skipped|moved on|paid|tried|use|using)\b/i;
  return transcriptLines(transcript)
    .filter((line) => /^(interviewee|participant|customer|user|prospect)$/i.test(line.speaker))
    .map((line) => line.text)
    .filter((text) => concretePattern.test(text) && text.length > 24)
    .map((text) => ({
      quote: clip(text, 180),
      reason: strongEvidenceReason(text),
    }))
    .slice(0, 5);
}

function weakEvidenceReason(quote: string): string {
  const q = quote.toLowerCase();
  if (/\bsure it would help\b|\bwould help\b|\bcould help\b/i.test(q))
    return 'Hypothetical endorsement of your idea — describes what they imagine might help, not what they already do.';
  if (/\bprobably\b|\bmaybe\b|\bperhaps\b/i.test(q))
    return 'Hedged language suggests uncertainty — they are guessing rather than reporting from experience.';
  if (/\bi think\b|\bi guess\b|\bi believe\b|\bi feel like\b/i.test(q))
    return 'Prefaced with "I think" or "I guess" — opinion, not observed behavior. Ask for the last time this actually happened.';
  if (/\bsounds useful\b|\bsounds good\b|\bcould be helpful\b|\bseems helpful\b/i.test(q))
    return 'Polite agreement with your description — socially agreeable language, not a sign of real need.';
  if (/\binteresting\b/i.test(q))
    return 'Non-committal interest — "interesting" is often polite conversation, not evidence of intent to act.';
  return 'Opinion-based or hypothetical — treat as low-confidence unless confirmed by a concrete past example.';
}

function weakEvidenceMoments(transcript: string): TranscriptEvidenceMoment[] {
  const weakPattern = /\b(sure it would help|would help|probably|maybe|i think|i guess|sounds useful|sounds good|could be helpful|interesting)\b/i;
  return transcriptLines(transcript)
    .filter((line) => /^(interviewee|participant|customer|user|prospect)$/i.test(line.speaker))
    .map((line) => line.text)
    .filter((text) => weakPattern.test(text))
    .map((text) => ({
      quote: clip(text, 180),
      reason: weakEvidenceReason(text),
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

function missedProbeQuestion(context: string): string {
  const q = context.toLowerCase();
  if (/\btime consuming\b/i.test(q)) return 'How much time did that take last time — what were you unable to do because of it?';
  if (/\bhard problem\b/i.test(q)) return 'What made it hard specifically? Walk me through the last time you hit that wall.';
  if (/\bcase.by.case\b/i.test(q)) return 'Give me the most recent example — who was it for and what was different about it?';
  if (/\bconstraint\b/i.test(q)) return 'What constraint hit you hardest last time? What did you sacrifice to work around it?';
  if (/\btoo long\b/i.test(q)) return 'How long exactly? And what did you miss out on because of the delay?';
  if (/\bcannot be automated\b/i.test(q)) return 'What part specifically can\'t be automated — and what do you do manually instead?';
  if (/\bgive up\b|\bstop there\b/i.test(q)) return 'What made you stop? What did you try before deciding to give up?';
  if (/\bwear different hats\b/i.test(q)) return 'Which hat takes the most time? When was the last time you had to switch mid-task?';
  return 'Can you give me a concrete recent example of that?';
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
      suggestedQuestion: missedProbeQuestion(line.text),
    });
    if (out.length >= 4) break;
  }

  return out;
}

function summarizeTranscript(transcript: string, evidenceSignals: string[]) {
  if (!transcript.trim()) return 'No transcript text was captured for this interview.';

  const strongMoments = strongEvidenceMoments(transcript);
  const weakMoments = weakEvidenceMoments(transcript);
  const signalCount = evidenceSignals.length;

  const parts: string[] = [];
  const strongestQuote = strongMoments[0]?.quote;

  if (strongMoments.length) {
    parts.push(`The strongest signal came from a moment where the interviewee described a concrete behavior`);
    if (strongestQuote) {
      parts.push(`— "${strongestQuote.slice(0, 120)}${strongestQuote.length > 120 ? '...' : ''}"`);
    }
    parts.push(`This is credible because it reflects actual past or current behavior rather than opinion.`);
  } else if (signalCount) {
    parts.push(`The interview surfaced ${signalCount} behavioral signal${signalCount === 1 ? '' : 's'}, but none reached the threshold of strong evidence grounded in concrete past behavior.`);
  }

  if (weakMoments.length) {
    parts.push(`${weakMoments.length} moment${weakMoments.length === 1 ? '' : 's'} relied on opinion or hypothetical language — treat these as directional, not confirmatory.`);
  }

  if (!parts.length) {
    parts.push('Review the transcript for concrete past behavior, current workarounds, and urgency signals.');
  }

  return parts.join(' ');
}

function transcriptReliability(
  strongMoments: TranscriptEvidenceMoment[],
  weakMoments: TranscriptEvidenceMoment[],
  questionFlags: InterviewQuestionFlag[],
  probes: MissedProbe[],
): TranscriptTechniqueReview['reliability'] {
  const problemFlags = questionFlags.filter((flag) => flag.severity === 'problem').length;
  const watchFlags = questionFlags.length - problemFlags;
  const score =
    strongMoments.length * 2 -
    weakMoments.length -
    problemFlags * 2 -
    watchFlags -
    probes.length;

  if (problemFlags > 0 || score <= 0) return 'low';
  if (strongMoments.length >= 3 && score >= 5) return 'high';
  return 'medium';
}

export function overarchingAnalysis(review: TranscriptTechniqueReview): string {
  const parts: string[] = [];

  if (review.evidenceSignals.length) {
    parts.push(
      `This interview surfaced ${review.evidenceSignals.length} behavioral signal${review.evidenceSignals.length === 1 ? '' : 's'}` +
      ` related to the interviewee's real workflow.`,
    );
  }

  const strongCount = review.strongEvidenceMoments.length;
  const weakCount = review.weakEvidenceMoments.length;
  if (strongCount + weakCount > 0) {
    const evidenceBits: string[] = [];
    if (strongCount) evidenceBits.push(`${strongCount} strong evidence moment${strongCount === 1 ? '' : 's'} grounded in concrete behavior`);
    if (weakCount) evidenceBits.push(`${weakCount} moment${weakCount === 1 ? '' : 's'} of weaker, opinion-based evidence`);
    parts.push(`The transcript contains ${evidenceBits.join(' and ')}.`);
  }

  const problemFlags = review.questionFlags.filter((f) => f.severity === 'problem').length;
  const watchFlags = review.questionFlags.filter((f) => f.severity === 'watch').length;
  if (problemFlags + watchFlags > 0) {
    const flagBits: string[] = [];
    if (problemFlags) flagBits.push(`${problemFlags} leading or hypothetical question${problemFlags === 1 ? '' : 's'} that weaken${problemFlags === 1 ? 's' : ''} reliability`);
    if (watchFlags) flagBits.push(`${watchFlags} compound or closed question${watchFlags === 1 ? '' : 's'} to tighten`);
    parts.push(`Interview quality note: ${flagBits.join(' and ')}.`);
  }

  if (review.missedProbes.length) {
    parts.push(
      `${review.missedProbes.length} missed follow-up${review.missedProbes.length === 1 ? '' : 's'} — ` +
      `the interviewee dropped a useful signal that wasn't probed deeper.`,
    );
  }

  if (!parts.length) {
    parts.push('This interview captured conversation data for review. Look for concrete past behavior, current workarounds, and urgency signals.');
  }

  return parts.join(' ');
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
    reliability: transcriptReliability(strongMoments, weakMoments, questionFlags, probes),
    evidenceSignals,
    strongEvidenceMoments: strongMoments,
    weakEvidenceMoments: weakMoments,
    questionFlags,
    missedProbes: probes,
    suggestedFollowUps,
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
    typeof root.overviewOpener === 'string' &&
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

  const personaBreakdown = Array.isArray(root.personaBreakdown)
    ? root.personaBreakdown
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => {
          const repQuote = item.representativeQuote && typeof item.representativeQuote === 'object'
            ? item.representativeQuote as Record<string, unknown>
            : null;
          return {
            personaType: cleanString(item.personaType, 'unknown'),
            headline: cleanString(item.headline, 'No clear signal yet from this group.'),
            keyFinding: cleanString(item.keyFinding, 'More interviews with this persona type are needed.'),
            peopleCount: cleanInteger(item.peopleCount, 0),
            representativeQuote: repQuote && cleanString(repQuote.quote, '') && cleanString(repQuote.personName, '')
              ? {
                  personName: cleanString(repQuote.personName, 'Interviewee'),
                  quote: cleanString(repQuote.quote, ''),
                }
              : null,
          };
        })
        .filter((item) => item.personaType !== 'unknown' && item.peopleCount > 0)
    : [];

  return {
    schemaVersion: CURRENT_INSIGHT_SCHEMA_VERSION,
    overviewOpener: cleanString(root.overviewOpener, DEFAULT_OVERVIEW_OPENER),
    learningSummary: {
      callsAnalyzed,
      evidenceLevel: enumValue(learning.evidenceLevel, ['thin', 'emerging', 'strong'] as const, evidenceLevelForCalls(callsAnalyzed)),
      topTakeaway: cleanString(learning.topTakeaway, DEFAULT_TAKEAWAY),
      nextFocus: cleanString(learning.nextFocus, DEFAULT_NEXT_FOCUS),
    },
    recurringThemes: recurringThemes.length ? recurringThemes : [{
      theme: 'No repeated interview issue yet',
      description: 'More interviews are needed before the biggest issues and repeated patterns become reliable.',
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
    personaBreakdown,
    interviewCoach: {
      verdict: cleanString(coach.verdict, DEFAULT_COACH_VERDICT),
      reliability: enumValue(coach.reliability, ['low', 'medium', 'high'] as const, callsAnalyzed >= 3 ? 'medium' : 'low'),
      mainRisk: cleanString(coach.mainRisk, DEFAULT_MAIN_RISK),
      recurringPatterns: recurringPatterns.length ? recurringPatterns : [{
        pattern: 'Push from opinion into behavior',
        whyItMatters: 'Founder learning is most reliable when answers describe what already happened.',
        example: 'The founder asks whether something would help instead of asking what the interviewee did last time.',
        fix: 'Ask for the last specific instance, current workaround, time spent, and consequence.',
      }],
      trustworthyEvidence: normalizeEvidenceMoments(coach.trustworthyEvidence, defaultTrustworthyEvidence),
      cautionAreas: normalizeCautionAreas(coach.cautionAreas, defaultCautionAreas),
    },
  };
}

// ── AI-enhanced transcript analysis ──────────────────────────────────────────

const enhancedReviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overarchingAnalysis: { type: 'string' },
    strongEvidenceMoments: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          quote: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['quote', 'reason'],
      },
    },
    weakEvidenceMoments: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          quote: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['quote', 'reason'],
      },
    },
    missedProbes: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          context: { type: 'string' },
          suggestedQuestion: { type: 'string' },
        },
        required: ['context', 'suggestedQuestion'],
      },
    },
  },
  required: ['overarchingAnalysis', 'strongEvidenceMoments', 'weakEvidenceMoments', 'missedProbes'],
};

type EnhancedReview = {
  overarchingAnalysis: string;
  strongEvidenceMoments: { quote: string; reason: string }[];
  weakEvidenceMoments: { quote: string; reason: string }[];
  missedProbes: { context: string; suggestedQuestion: string }[];
};

function buildEnhancedPrompt(transcript: string, notes: string): string {
  const combined = [transcript, notes].filter(Boolean).join('\n');
  const trimmed = combined.length > 8000
    ? `${combined.slice(0, 8000).trim()}\n[transcript truncated for analysis]`
    : combined;

  return [
    'You analyze a single customer-discovery interview transcript for a startup founder.',
    'Return only structured JSON. Be specific, skeptical, and grounded in what the interviewee actually said.',
    '',
    'Rules for overarchingAnalysis (3-5 sentences, single paragraph):',
    '- Open with the most important thing this interview revealed about the problem space — not a summary of topics discussed.',
    '- Be opinionated: was the evidence strong or thin? What was the most credible moment vs the weakest?',
    '- Call out the dominant interview-technique issue if one exists (leading questions, missed probes, hypothetical validation).',
    '- End with what the founder should prioritize learning next based on this conversation.',
    '- Never start with "This interview surfaced..." or use sentence templates. Write like a sharp colleague giving you an honest read.',
    '',
    'Rules for evidence moments:',
    '- Each strong evidence moment must include a specific, contextual reason WHY it is strong — mention what makes this particular quote credible (past behavior, named tool, specific timeframe, measurable detail, etc). Never use generic labels.',
    '- Each weak evidence moment must explain WHY this particular quote is weak — call out the specific hedging, hypothetical, or polite-agreement language in the quote.',
    '- Each missed probe must have a suggested question tailored to what the interviewee just said — never repeat the same question across probes.',
    '',
    'Transcript + notes:',
    trimmed,
  ].join('\n');
}

export async function enhanceTranscriptTechnique(
  transcript: string,
  notes: string,
): Promise<TranscriptTechniqueReview> {
  // Run deterministic analysis first for question flags and reliability
  const base = analyzeTranscriptTechnique(transcript, notes);

  if (!transcript.trim() && !notes.trim()) return base;

  try {
    const { generateObject } = await import('./ai/provider.ts');
    const enhanced = await generateObject<EnhancedReview>(
      buildEnhancedPrompt(transcript, notes),
      enhancedReviewSchema,
    );

    return {
      summary: enhanced.overarchingAnalysis,
      reliability: base.reliability,
      evidenceSignals: base.evidenceSignals,
      strongEvidenceMoments: enhanced.strongEvidenceMoments.map((m) => ({
        quote: m.quote,
        reason: m.reason,
      })),
      weakEvidenceMoments: enhanced.weakEvidenceMoments.map((m) => ({
        quote: m.quote,
        reason: m.reason,
      })),
      questionFlags: base.questionFlags,
      missedProbes: enhanced.missedProbes.map((p) => ({
        context: p.context,
        suggestedQuestion: p.suggestedQuestion,
      })),
      suggestedFollowUps: base.suggestedFollowUps,
    };
  } catch (error) {
    console.warn('[insights-core] AI enhancement failed, using deterministic analysis', error);
    return base;
  }
}
