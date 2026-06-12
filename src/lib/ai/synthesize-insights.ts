import 'server-only';

import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  insights,
  interactions,
  people,
  person_events,
  project_briefs,
  project_foundations,
  project_intake,
  outreach_projects,
  transcripts,
  type InsightContent,
} from '@/lib/db/schema';
import type { Foundation, IdeaValidationBrief } from '@/lib/backend-types';
import { generateObject } from '@/lib/ai/provider';
import {
  applyIdeaValidationBrief,
  normalizeIdeaValidationBrief,
} from '@/lib/idea-validation-context-core';
import { getOutreachProjectTypeConfig } from '@/lib/outreach-projects';
import {
  CURRENT_INSIGHT_SCHEMA_VERSION,
  analyzeTranscriptTechnique,
  evidenceLevelForCalls,
  hasInterviewData,
  isInsightFresh,
  normalizeInsightContent,
  type TranscriptTechniqueReview,
} from '@/lib/insights-core';

const MAX_RECORDS = 20;
const MAX_TEXT_CHARS = 6000;

type CompletedInteractionRow = {
  id: string;
  personId: string | null;
  personName: string;
  personaType: string | null;
  outreachProjectType: string | null;
  notesRaw: string | null;
  transcriptRaw: string | null;
  completedAt: Date | null;
  createdAt: Date | null;
};

type TranscriptRow = {
  id: string;
  personId: string | null;
  personName: string;
  personaType: string | null;
  outreachProjectType: string | null;
  content: string;
  createdAt: Date | null;
};

type EventMetadata = {
  interaction_id?: unknown;
  checked_count?: unknown;
  topic_count?: unknown;
  checked_labels?: unknown;
  auto_checked_count?: unknown;
  auto_checked_topics?: unknown;
};

type InsightSourceRecord = {
  id: string;
  source: 'interaction' | 'transcript';
  personId: string | null;
  personName: string;
  personaType: string | null;
  outreachProjectType: string;
  outreachProjectLabel: string;
  completedAt: Date | null;
  notes: string;
  transcript: string;
  checkedLabels: string[];
  checkedCount: number | null;
  topicCount: number | null;
};

type InsightDataSet = {
  completedInteractionCount: number;
  transcriptCount: number;
  interviewCount: number;
  latestDataAt: Date | null;
  records: InsightSourceRecord[];
  assumptions: string[];
  foundation: Foundation | null;
  activeIdeaValidationBrief: IdeaValidationBrief | null;
  contextUpdatedAt: Date | null;
};

export type TranscriptInsightRecord = {
  id: string;
  source: 'interaction' | 'transcript';
  personId: string | null;
  personName: string;
  personaType: string | null;
  outreachProjectType: string;
  outreachProjectLabel: string;
  completedAt: Date | null;
  transcript: string;
  notes: string;
  checkedLabels: string[];
  checkedCount: number | null;
  topicCount: number | null;
  review: TranscriptTechniqueReview;
};

export type ProjectInsightsState =
  | {
      kind: 'empty';
      completedInteractionCount: number;
      transcriptCount: number;
      activeIdeaValidationBrief: IdeaValidationBrief | null;
    }
  | {
      kind: 'ready';
      content: InsightContent;
      generatedAt: Date | null;
      callsAnalyzed: number;
      latestDataAt: Date | null;
      activeIdeaValidationBrief: IdeaValidationBrief | null;
      transcriptInsights: TranscriptInsightRecord[];
    };

const insightSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'number' },
    learningSummary: {
      type: 'object',
      additionalProperties: false,
      properties: {
        headline: { type: 'string' },
        summary: { type: 'string' },
        callsAnalyzed: { type: 'number' },
        evidenceLevel: { type: 'string', enum: ['thin', 'emerging', 'strong'] },
        topTakeaway: { type: 'string' },
        nextFocus: { type: 'string' },
      },
      required: ['headline', 'summary', 'callsAnalyzed', 'evidenceLevel', 'topTakeaway', 'nextFocus'],
    },
    recurringThemes: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          theme: { type: 'string' },
          description: { type: 'string' },
          callCount: { type: 'number' },
          evidenceStrength: { type: 'string', enum: ['weak', 'emerging', 'strong'] },
          supportingQuotes: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                personName: { type: 'string' },
                quote: { type: 'string' },
              },
              required: ['personName', 'quote'],
            },
          },
        },
        required: ['theme', 'description', 'callCount', 'evidenceStrength', 'supportingQuotes'],
      },
    },
    assumptionTracker: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          assumption: { type: 'string' },
          status: { type: 'string', enum: ['strengthening', 'weakening', 'unclear', 'new'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          evidence: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string' },
          },
          nextQuestion: { type: 'string' },
        },
        required: ['assumption', 'status', 'confidence', 'evidence', 'nextQuestion'],
      },
    },
    interviewCoach: {
      type: 'object',
      additionalProperties: false,
      properties: {
        verdict: { type: 'string' },
        reliability: { type: 'string', enum: ['low', 'medium', 'high'] },
        mainRisk: { type: 'string' },
        recurringPatterns: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              pattern: { type: 'string' },
              whyItMatters: { type: 'string' },
              example: { type: 'string' },
              fix: { type: 'string' },
            },
            required: ['pattern', 'whyItMatters', 'example', 'fix'],
          },
        },
        trustworthyEvidence: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              personName: { type: 'string' },
              quote: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['personName', 'quote', 'reason'],
          },
        },
        cautionAreas: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              personName: { type: 'string' },
              quote: { type: 'string' },
              concern: { type: 'string' },
              betterProbe: { type: 'string' },
            },
            required: ['personName', 'quote', 'concern', 'betterProbe'],
          },
        },
      },
      required: [
        'verdict',
        'reliability',
        'mainRisk',
        'recurringPatterns',
        'trustworthyEvidence',
        'cautionAreas',
      ],
    },
  },
  required: ['schemaVersion', 'learningSummary', 'recurringThemes', 'assumptionTracker', 'interviewCoach'],
};

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function metadataNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function truncateText(value: string, maxChars = MAX_TEXT_CHARS) {
  const text = value.trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 24).trim()}\n[truncated for synthesis]`;
}

function latestDate(values: (Date | null | undefined)[]) {
  const times = values
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .map((value) => value.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

function dedupe(values: string[], limit = 12) {
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

function assumptionsFromFoundation(foundation: Foundation | null): string[] {
  if (!foundation) return [];
  const activeIdeaValidation = foundation.activeOutreachProject;
  return dedupe([
    cleanString(foundation.painPoint) ? `The problem is painful: ${cleanString(foundation.painPoint)}` : '',
    cleanString(foundation.targetUser) ? `The target user is correct: ${cleanString(foundation.targetUser)}` : '',
    cleanString(foundation.valueProp) ? `The value proposition matters: ${cleanString(foundation.valueProp)}` : '',
    cleanString(foundation.biggestUnknown) ? `Biggest unknown: ${cleanString(foundation.biggestUnknown)}` : '',
    cleanString(foundation.outreachGoal) ? `The outreach goal is resonating: ${cleanString(foundation.outreachGoal)}` : '',
    cleanString(foundation.sharedContext) ? `Shared context is relevant: ${cleanString(foundation.sharedContext)}` : '',
    cleanString(foundation.desiredOutcome) ? `The desired outcome is useful: ${cleanString(foundation.desiredOutcome)}` : '',
    ...cleanList(foundation.learningGoals).map((goal) => `Learning goal: ${goal}`),
    ...cleanList(foundation.keyAssumptions).map((assumption) => `Idea Validation assumption: ${assumption}`),
    ...(activeIdeaValidation ? cleanList(activeIdeaValidation.assumptionsToTest).map((assumption) => `Idea Validation assumption: ${assumption}`) : []),
    ...(activeIdeaValidation ? cleanList(activeIdeaValidation.learningGoals).map((goal) => `Learning goal: ${goal}`) : []),
    ...cleanList(foundation.lowFitSignals).map((signal) => `Low-fit signal to watch: ${signal}`),
    ...cleanList(foundation.messageBoundaries).map((boundary) => `Keep Idea Validation grounded: ${boundary}`),
  ]);
}

function eventMetadataByInteraction(events: { metadata: unknown }[]) {
  const byInteractionId = new Map<string, EventMetadata>();
  for (const row of events) {
    const metadata = row.metadata && typeof row.metadata === 'object'
      ? row.metadata as EventMetadata
      : {};
    const interactionId = typeof metadata.interaction_id === 'string' ? metadata.interaction_id : '';
    if (interactionId) byInteractionId.set(interactionId, metadata);
  }
  return byInteractionId;
}

function buildInteractionRecords(
  rows: CompletedInteractionRow[],
  events: Map<string, EventMetadata>,
) {
  return rows.map((row): InsightSourceRecord => {
    const metadata = events.get(row.id) ?? {};
    const outreachConfig = getOutreachProjectTypeConfig(row.outreachProjectType);
    return {
      id: row.id,
      source: 'interaction',
      personId: row.personId,
      personName: row.personName,
      personaType: row.personaType,
      outreachProjectType: outreachConfig.type,
      outreachProjectLabel: outreachConfig.label,
      completedAt: row.completedAt ?? row.createdAt,
      notes: truncateText(row.notesRaw ?? '', 2500),
      transcript: truncateText(row.transcriptRaw ?? ''),
      checkedLabels: cleanList(metadata.checked_labels),
      checkedCount: metadataNumber(metadata.checked_count),
      topicCount: metadataNumber(metadata.topic_count),
    };
  });
}

function buildTranscriptOnlyRecords(
  transcriptRows: TranscriptRow[],
  interactionRows: CompletedInteractionRow[],
) {
  const duplicateKeys = new Set(
    interactionRows
      .filter((row) => row.personId && row.transcriptRaw?.trim())
      .map((row) => `${row.personId}:${row.transcriptRaw!.trim()}`),
  );

  return transcriptRows
    .filter((row) => !duplicateKeys.has(`${row.personId}:${row.content.trim()}`))
    .map((row): InsightSourceRecord => {
      const outreachConfig = getOutreachProjectTypeConfig(row.outreachProjectType);
      return {
        id: row.id,
        source: 'transcript',
        personId: row.personId,
        personName: row.personName,
        personaType: row.personaType,
        outreachProjectType: outreachConfig.type,
        outreachProjectLabel: outreachConfig.label,
        completedAt: row.createdAt,
        notes: '',
        transcript: truncateText(row.content),
        checkedLabels: [],
        checkedCount: null,
        topicCount: null,
      };
    });
}

function buildPrompt(data: InsightDataSet) {
  const records = data.records.slice(0, MAX_RECORDS).map((record, index) => ({
    ...(() => {
      const review = analyzeTranscriptTechnique(record.transcript, record.notes);
      return {
        deterministicCoachingSignals: {
          reliability: review.reliability,
          questionFlags: review.questionFlags,
          missedProbes: review.missedProbes,
          strongEvidenceMoments: review.strongEvidenceMoments,
          weakEvidenceMoments: review.weakEvidenceMoments,
        },
      };
    })(),
    number: index + 1,
    source: record.source,
    personName: record.personName,
    personaType: record.personaType,
    outreachProjectType: record.outreachProjectType,
    outreachProjectLabel: record.outreachProjectLabel,
    completedAt: record.completedAt?.toISOString() ?? null,
    checkedTopics: record.checkedLabels,
    checklistCoverage: record.checkedCount !== null && record.topicCount !== null
      ? `${record.checkedCount}/${record.topicCount}`
      : null,
    notes: record.notes,
    transcript: record.transcript,
  }));

  return [
    'You synthesize idea validation interview evidence for a founder.',
    `Return only the structured output with schemaVersion ${CURRENT_INSIGHT_SCHEMA_VERSION}. Be specific, skeptical, and grounded in the interview data.`,
    'Do not invent quotes. Supporting quotes must be short direct excerpts from transcript or notes.',
    'If evidence is thin, say so plainly. Prefer practical next questions over generic advice.',
    'Be strict about interview quality: call out leading, hypothetical solution-validation questions, especially questions that describe a tool or benefit and ask whether it would help.',
    'When a founder asks a leading product-validation question, recommend a recent-behavior question that does not reveal the proposed solution.',
    'Separate trustworthy evidence from caution areas. Trustworthy evidence comes from concrete past or current behavior. Caution areas include polite agreement, hypotheticals, vague claims, or answers following leading questions.',
    'The Interview Coach should name concrete interview-quality risks. Any coaching claim should point to a specific interview record/person and the exact question or exchange when possible.',
    '',
    `Calls/interview records analyzed: ${data.interviewCount}`,
    `Evidence level: ${evidenceLevelForCalls(data.interviewCount)}`,
    '',
    'Foundation or project context:',
    JSON.stringify(data.foundation ?? {}, null, 2),
    '',
    'Assumptions to track:',
    JSON.stringify(data.assumptions, null, 2),
    '',
    'Interview records:',
    JSON.stringify(records, null, 2),
  ].join('\n');
}

function buildTranscriptInsights(records: InsightSourceRecord[]): TranscriptInsightRecord[] {
  return records
    .filter((record) => record.transcript.trim() || record.notes.trim())
    .map((record) => {
      const review = analyzeTranscriptTechnique(record.transcript, record.notes);
      return {
        id: record.id,
        source: record.source,
        personId: record.personId,
        personName: record.personName,
        personaType: record.personaType,
        outreachProjectType: record.outreachProjectType,
        outreachProjectLabel: record.outreachProjectLabel,
        completedAt: record.completedAt,
        transcript: record.transcript,
        notes: record.notes,
        checkedLabels: record.checkedLabels,
        checkedCount: record.checkedCount,
        topicCount: record.topicCount,
        review,
      };
    })
    .sort((a, b) => {
      const urgencyA = a.review.questionFlags.filter((flag) => flag.severity === 'problem').length * 3 +
        a.review.questionFlags.length +
        a.review.missedProbes.length * 2 +
        a.review.weakEvidenceMoments.length;
      const urgencyB = b.review.questionFlags.filter((flag) => flag.severity === 'problem').length * 3 +
        b.review.questionFlags.length +
        b.review.missedProbes.length * 2 +
        b.review.weakEvidenceMoments.length;
      return urgencyB - urgencyA;
    });
}

async function loadInsightData(projectId: string): Promise<InsightDataSet> {
  const [
    interactionRows,
    transcriptRows,
    eventRows,
    [brief],
    [intake],
    [foundationRow],
    [activeIdeaValidationRow],
  ] = await Promise.all([
    db
      .select({
        id: interactions.id,
        personId: interactions.person_id,
        personName: people.name,
        personaType: people.persona_type,
        outreachProjectType: outreach_projects.type,
        notesRaw: interactions.notes_raw,
        transcriptRaw: interactions.transcript_raw,
        completedAt: interactions.completed_at,
        createdAt: interactions.created_at,
      })
      .from(interactions)
      .innerJoin(people, eq(interactions.person_id, people.id))
      .leftJoin(
        outreach_projects,
        eq(outreach_projects.id, sql`coalesce(${interactions.outreach_project_id}, ${people.outreach_project_id})`),
      )
      .where(and(eq(people.project_id, projectId), isNotNull(interactions.completed_at)))
      .orderBy(desc(interactions.completed_at))
      .limit(MAX_RECORDS),
    db
      .select({
        id: transcripts.id,
        personId: transcripts.person_id,
        personName: people.name,
        personaType: people.persona_type,
        outreachProjectType: outreach_projects.type,
        content: transcripts.content,
        createdAt: transcripts.created_at,
      })
      .from(transcripts)
      .innerJoin(people, eq(transcripts.person_id, people.id))
      .leftJoin(
        outreach_projects,
        eq(outreach_projects.id, sql`coalesce(${transcripts.outreach_project_id}, ${people.outreach_project_id})`),
      )
      .where(eq(people.project_id, projectId))
      .orderBy(desc(transcripts.created_at))
      .limit(MAX_RECORDS),
    db
      .select({ metadata: person_events.metadata })
      .from(person_events)
      .innerJoin(people, eq(person_events.person_id, people.id))
      .where(and(eq(people.project_id, projectId), eq(person_events.type, 'desktop_call_session_saved'))),
    db
      .select()
      .from(project_briefs)
      .where(and(eq(project_briefs.project_id, projectId), eq(project_briefs.is_current, true)))
      .orderBy(desc(project_briefs.generated_at))
      .limit(1),
    db
      .select()
      .from(project_intake)
      .where(eq(project_intake.project_id, projectId))
      .limit(1),
    db
      .select()
      .from(project_foundations)
      .where(eq(project_foundations.project_id, projectId))
      .orderBy(desc(project_foundations.generated_at))
      .limit(1),
    db
      .select({
        brief: outreach_projects.brief_json,
        updatedAt: outreach_projects.updated_at,
      })
      .from(outreach_projects)
      .where(and(
        eq(outreach_projects.startup_project_id, projectId),
        eq(outreach_projects.type, 'idea_validation'),
        eq(outreach_projects.status, 'active'),
      ))
      .orderBy(desc(outreach_projects.updated_at))
      .limit(1),
  ]);

  const events = eventMetadataByInteraction(eventRows);
  const interactionRecords = buildInteractionRecords(interactionRows, events);
  const transcriptOnlyRecords = buildTranscriptOnlyRecords(transcriptRows, interactionRows);
  const records = [...interactionRecords, ...transcriptOnlyRecords]
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
    .slice(0, MAX_RECORDS);
  const baseFoundation = foundationRow?.foundation_json as Foundation | null | undefined ?? null;
  const activeIdeaValidationBrief = normalizeIdeaValidationBrief(activeIdeaValidationRow?.brief) ?? null;
  const foundation = activeIdeaValidationBrief
    ? applyIdeaValidationBrief(baseFoundation, activeIdeaValidationBrief)
    : baseFoundation;
  const briefAssumptions = Array.isArray(brief?.assumptions)
    ? brief.assumptions.map((item) => cleanString(item?.assumption)).filter(Boolean)
    : [];
  const assumptions = dedupe([
    ...briefAssumptions,
    ...cleanList(intake?.key_assumptions),
    ...assumptionsFromFoundation(foundation),
  ]);

  return {
    completedInteractionCount: interactionRows.length,
    transcriptCount: transcriptRows.length,
    interviewCount: records.length,
    latestDataAt: latestDate([
      ...interactionRows.map((row) => row.completedAt ?? row.createdAt),
      ...transcriptRows.map((row) => row.createdAt),
    ]),
    records,
    assumptions,
    foundation,
    activeIdeaValidationBrief,
    contextUpdatedAt: activeIdeaValidationRow?.updatedAt ?? null,
  };
}

export async function getProjectTranscriptInsight(
  projectId: string,
  source: TranscriptInsightRecord['source'],
  recordId: string,
): Promise<TranscriptInsightRecord | null> {
  if (source === 'interaction') {
    const [row] = await db
      .select({
        id: interactions.id,
        personId: interactions.person_id,
        personName: people.name,
        personaType: people.persona_type,
        outreachProjectType: outreach_projects.type,
        notesRaw: interactions.notes_raw,
        transcriptRaw: interactions.transcript_raw,
        completedAt: interactions.completed_at,
        createdAt: interactions.created_at,
      })
      .from(interactions)
      .innerJoin(people, eq(interactions.person_id, people.id))
      .leftJoin(
        outreach_projects,
        eq(outreach_projects.id, sql`coalesce(${interactions.outreach_project_id}, ${people.outreach_project_id})`),
      )
      .where(and(eq(people.project_id, projectId), eq(interactions.id, recordId)))
      .limit(1);

    if (!row) return null;

    const eventRows = row.personId
      ? await db
        .select({ metadata: person_events.metadata })
        .from(person_events)
        .where(and(eq(person_events.person_id, row.personId), eq(person_events.type, 'desktop_call_session_saved')))
      : [];
    const metadata = eventMetadataByInteraction(eventRows).get(row.id) ?? {};
    const outreachConfig = getOutreachProjectTypeConfig(row.outreachProjectType);
    const transcript = row.transcriptRaw ?? '';
    const notes = row.notesRaw ?? '';

    return {
      id: row.id,
      source: 'interaction',
      personId: row.personId,
      personName: row.personName,
      personaType: row.personaType,
      outreachProjectType: outreachConfig.type,
      outreachProjectLabel: outreachConfig.label,
      completedAt: row.completedAt ?? row.createdAt,
      transcript,
      notes,
      checkedLabels: cleanList(metadata.checked_labels),
      checkedCount: metadataNumber(metadata.checked_count),
      topicCount: metadataNumber(metadata.topic_count),
      review: analyzeTranscriptTechnique(transcript, notes),
    };
  }

  const [row] = await db
    .select({
      id: transcripts.id,
      personId: transcripts.person_id,
      personName: people.name,
      personaType: people.persona_type,
      outreachProjectType: outreach_projects.type,
      content: transcripts.content,
      createdAt: transcripts.created_at,
    })
    .from(transcripts)
    .innerJoin(people, eq(transcripts.person_id, people.id))
    .leftJoin(
      outreach_projects,
      eq(outreach_projects.id, sql`coalesce(${transcripts.outreach_project_id}, ${people.outreach_project_id})`),
    )
    .where(and(eq(people.project_id, projectId), eq(transcripts.id, recordId)))
    .limit(1);

  if (!row) return null;

  const outreachConfig = getOutreachProjectTypeConfig(row.outreachProjectType);

  return {
    id: row.id,
    source: 'transcript',
    personId: row.personId,
    personName: row.personName,
    personaType: row.personaType,
    outreachProjectType: outreachConfig.type,
    outreachProjectLabel: outreachConfig.label,
    completedAt: row.createdAt,
    transcript: row.content,
    notes: '',
    checkedLabels: [],
    checkedCount: null,
    topicCount: null,
    review: analyzeTranscriptTechnique(row.content),
  };
}

async function synthesizeInsightContent(data: InsightDataSet) {
  try {
    const generated = await generateObject<InsightContent>(
      buildPrompt(data),
      insightSchema,
    );
    return normalizeInsightContent(generated, {
      callsAnalyzed: data.interviewCount,
      assumptions: data.assumptions,
    });
  } catch (error) {
    console.warn('[insights] synthesis failed; using fallback insight content', error);
    return normalizeInsightContent(null, {
      callsAnalyzed: data.interviewCount,
      assumptions: data.assumptions,
    });
  }
}

export async function getProjectInsightsState(projectId: string): Promise<ProjectInsightsState> {
  const data = await loadInsightData(projectId);
  const transcriptInsights = buildTranscriptInsights(data.records);
  if (!hasInterviewData({
    completedInteractionCount: data.completedInteractionCount,
    transcriptCount: data.transcriptCount,
  })) {
    return {
      kind: 'empty',
      completedInteractionCount: data.completedInteractionCount,
      transcriptCount: data.transcriptCount,
      activeIdeaValidationBrief: data.activeIdeaValidationBrief,
    };
  }

  const [current] = await db
    .select()
    .from(insights)
    .where(and(eq(insights.project_id, projectId), eq(insights.is_current, true)))
    .orderBy(desc(insights.generated_at))
    .limit(1);

  if (current && current.content && isInsightFresh({
    calls_analyzed: current.calls_analyzed,
    generated_at: current.generated_at,
    content: current.content,
  }, {
    interviewCount: data.interviewCount,
    latestDataAt: latestDate([data.latestDataAt, data.contextUpdatedAt]),
  })) {
    return {
      kind: 'ready',
      content: normalizeInsightContent(current.content, {
        callsAnalyzed: data.interviewCount,
        assumptions: data.assumptions,
      }),
      generatedAt: current.generated_at,
      callsAnalyzed: current.calls_analyzed ?? data.interviewCount,
      latestDataAt: data.latestDataAt,
      activeIdeaValidationBrief: data.activeIdeaValidationBrief,
      transcriptInsights,
    };
  }

  const content = await synthesizeInsightContent(data);
  await db
    .update(insights)
    .set({ is_current: false })
    .where(and(eq(insights.project_id, projectId), eq(insights.is_current, true)));

  const [created] = await db
    .insert(insights)
    .values({
      project_id: projectId,
      content,
      summary_statement: content.learningSummary.summary,
      recurring_themes: content.recurringThemes.map((theme) => theme.theme),
      hypothesis_evolution: { assumptionTracker: content.assumptionTracker },
      interview_quality_trend: content.learningSummary.evidenceLevel,
      calls_analyzed: data.interviewCount,
      is_current: true,
    })
    .returning();

  return {
    kind: 'ready',
    content,
    generatedAt: created.generated_at,
    callsAnalyzed: created.calls_analyzed ?? data.interviewCount,
    latestDataAt: data.latestDataAt,
    activeIdeaValidationBrief: data.activeIdeaValidationBrief,
    transcriptInsights,
  };
}
