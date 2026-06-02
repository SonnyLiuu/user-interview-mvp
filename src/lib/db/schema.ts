import { sql } from 'drizzle-orm';
import { pgTable, text, boolean, integer, timestamp, uuid, jsonb, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';

// Custom type for text arrays with proper typing
const textArray = customType<{ data: string[]; driverData: string[]; config?: { length?: number } }>({
  dataType: (config) => {
    if (config?.length) {
      return `text[${config.length}]`;
    }
    return 'text[]';
  },
  fromDriver: (value: string[]): string[] => value,
  toDriver: (value: string[]): string[] => value,
});

// Type definitions for complex fields
export type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
  timestamp?: string;
};

export type BriefAssumption = {
  assumption: string;
  status: 'unvalidated' | 'strengthened' | 'weakened';
  evidence: string[];
};

export type RecommendedConversation = {
  persona_type: string;
  why: string;
  what_to_learn: string;
  urgency: 'high' | 'medium' | 'low';
};

export type CrawledContent = {
  title?: string;
  description?: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

export type ContactInfo = {
  email?: string;
  twitter?: string;
  website?: string;
  linkedin?: string;
};

export type PersonAnalysisSection = {
  id: string;
  title: string;
  kind: 'text' | 'list';
  text?: string;
  items?: string[];
};

export type MatchFactors = {
  recipient_fit?: number;
  topic_overlap?: number;
  shared_context?: number;
  desired_response_usefulness?: number;
  personalization_quality?: number;
  evidence_confidence?: number;
};

export type DiscoveredUrl = {
  url: string;
  kind: 'github' | 'website' | 'blog';
  confidence: 'high' | 'medium';
  evidence: string;
  crawl_status: 'included' | 'failed';
  crawl_error?: string;
  added_at: string;
};

export type PersonAnalysis = {
  // Extracted identity — written back to dedicated columns after crawl
  name?: string;
  title?: string;
  company?: string;
  persona_type?: string;
  // Analysis content
  summary?: string;
  key_insights?: string[];
  recommended_questions?: string[];
  risk_factors?: string[];
  confidence_score?: number;
  relevance_rank?: 'low' | 'medium' | 'high';
  match_score?: number;
  match_rank?: 'low' | 'medium' | 'high';
  match_factors?: MatchFactors;
  match_explanation?: string;
  why_they_matter?: string;
  contact_info?: ContactInfo;
  sections?: PersonAnalysisSection[];
};

export type ProjectMatchProfileJson = {
  matchRubric?: string | null;
  priorityRecipientTypes?: string[];
  lowFitSignals?: string[];
  positivePatterns?: string[];
  negativePatterns?: string[];
  calibrationNotes?: string[];
};

export type InsightContent = {
  learningSummary: {
    headline: string;
    summary: string;
    callsAnalyzed: number;
    evidenceLevel: 'thin' | 'emerging' | 'strong';
    topTakeaway: string;
    nextFocus: string;
  };
  recurringThemes: {
    theme: string;
    description: string;
    callCount: number;
    evidenceStrength: 'weak' | 'emerging' | 'strong';
    supportingQuotes: {
      personName: string;
      quote: string;
    }[];
  }[];
  assumptionTracker: {
    assumption: string;
    status: 'strengthening' | 'weakening' | 'unclear' | 'new';
    confidence: 'low' | 'medium' | 'high';
    evidence: string[];
    nextQuestion: string;
  }[];
};

export type OutreachContent = {
  subject?: string;
  body?: string;
};

export type CallPrepContent = {
  objective?: string;
  goals?: string[];
  questions?: string[];
  signals?: string[];
  closing?: string;
};

export type OutreachProjectStatus = 'draft' | 'onboarding' | 'active' | 'paused' | 'completed' | 'archived';

export type OutreachProjectBrief = Record<string, unknown>;

export type OutreachProjectOnboardingState = Record<string, unknown>;

// ── users ────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerk_user_id: text('clerk_user_id').unique(),
  email: text('email').unique().notNull(),
  name: text('name'),
  avatar_url: text('avatar_url'),
  subscription: text('subscription').default('free'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── projects ──────────────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug'),
  project_type: text('project_type').notNull().default('startup'),
  intake_status: text('intake_status').default('not_started'),
  is_archived: boolean('is_archived').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('projects_active_user_created_at_idx')
    .on(table.user_id, table.created_at)
    .where(sql`${table.is_archived} = false`),
  uniqueIndex('projects_active_user_slug_idx')
    .on(table.user_id, table.slug)
    .where(sql`${table.is_archived} = false and ${table.slug} is not null`),
]);

// ── outreach_projects ────────────────────────────────────────────────────────
export const outreach_projects = pgTable('outreach_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  startup_project_id: uuid('startup_project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  status: text('status').$type<OutreachProjectStatus>().notNull().default('draft'),
  brief_json: jsonb('brief_json').$type<OutreachProjectBrief>(),
  onboarding_state_json: jsonb('onboarding_state_json').$type<OutreachProjectOnboardingState>(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('outreach_projects_startup_created_at_idx').on(table.startup_project_id, table.created_at),
  index('outreach_projects_startup_status_idx').on(table.startup_project_id, table.status),
  uniqueIndex('outreach_projects_one_active_information_discovery_idx')
    .on(table.startup_project_id, table.type)
    .where(sql`${table.type} = 'information_discovery' and ${table.status} <> 'archived'`),
  check('outreach_projects_type_check', sql`${table.type} in (
    'information_discovery',
    'customer_acquisition',
    'beta_users',
    'investor',
    'partnership',
    'recruiting',
    'advisor',
    'press_creator'
  )`),
  check('outreach_projects_status_check', sql`${table.status} in (
    'draft',
    'onboarding',
    'active',
    'paused',
    'completed',
    'archived'
  )`),
]);

// ── project_intake ────────────────────────────────────────────────────────────
export const project_intake = pgTable('project_intake', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).unique(),

  // Section 1: The Idea
  what_are_you_building: text('what_are_you_building'),
  for_whom: text('for_whom'),
  why_now: text('why_now'),

  // Section 2: The Problem
  pain_description: text('pain_description'),
  pain_frequency: text('pain_frequency'),
  current_solutions: text('current_solutions'),
  why_not_solved: text('why_not_solved'),
  consequence_if_unsolved: text('consequence_if_unsolved'),

  // Section 3: The Customer
  who_feels_pain: text('who_feels_pain'),
  who_pays: text('who_pays'),
  user_buyer_same_person: boolean('user_buyer_same_person'),
  who_influences: text('who_influences'),
  who_benefits_most: text('who_benefits_most'),

  // Section 4: The Opportunity
  who_has_budget: text('who_has_budget'),
  urgency_level: text('urgency_level'),
  most_promising_angle: text('most_promising_angle'),
  narrow_wedge: text('narrow_wedge'),

  // Section 5: Risks and Assumptions
  key_assumptions: textArray('key_assumptions'),
  biggest_failure_reasons: textArray('biggest_failure_reasons'),
  personal_connection: text('personal_connection'),

  // Chat history: [{ role: 'assistant' | 'user', content: string }]
  conversation: jsonb('conversation').$type<ChatMessage[]>(),

  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── project_briefs ────────────────────────────────────────────────────────────
export const project_briefs = pgTable('project_briefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  idea_summary: text('idea_summary'),
  strengths: textArray('strengths'),
  weaknesses: textArray('weaknesses'),
  most_promising_avenues: textArray('most_promising_avenues'),
  recommended_conversations: jsonb('recommended_conversations').$type<RecommendedConversation[]>(),
  assumptions: jsonb('assumptions').$type<BriefAssumption[]>(),

  debrief_count_at_generation: integer('debrief_count_at_generation').default(0),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  is_current: boolean('is_current').default(true),
}, (table) => [
  uniqueIndex('project_briefs_one_current_per_project')
    .on(table.project_id)
    .where(sql`${table.is_current} = true`),
]);

// ── people ────────────────────────────────────────────────────────────────────
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  outreach_project_id: uuid('outreach_project_id').references(() => outreach_projects.id, { onDelete: 'set null' }),

  name: text('name').notNull(),
  title: text('title'),
  company: text('company'),
  persona_type: text('persona_type'),

  source_urls: textArray('source_urls'),
  raw_pasted_text: text('raw_pasted_text'),
  additional_context: textArray('additional_context'),
  discovered_urls: jsonb('discovered_urls').$type<DiscoveredUrl[]>(),

  crawl_status: text('crawl_status').default('pending'),
  crawled_content: jsonb('crawled_content').$type<CrawledContent>(),
  crawl_error: text('crawl_error'),

  analysis: jsonb('analysis').$type<PersonAnalysis>(),
  analysis_version: integer('analysis_version').default(0),
  analysis_status: text('analysis_status').default('pending'),

  relevance_rank: text('relevance_rank'),
  match_score: integer('match_score'),
  match_rank: text('match_rank'),
  match_factors: jsonb('match_factors').$type<MatchFactors>(),
  match_explanation: text('match_explanation'),
  match_profile_version: integer('match_profile_version'),
  match_status: text('match_status'),
  research_depth: text('research_depth').default('deep'),
  expires_at: timestamp('expires_at', { withTimezone: true }),

  board_status: text('board_status'),
  outcome: text('outcome'),
  call_scheduled_at: timestamp('call_scheduled_at', { withTimezone: true }),
  last_contacted_at: timestamp('last_contacted_at', { withTimezone: true }),

  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('people_project_created_at_idx').on(table.project_id, table.created_at),
  index('people_project_updated_at_idx').on(table.project_id, table.updated_at),
  index('people_outreach_project_created_at_idx').on(table.outreach_project_id, table.created_at),
  index('people_outreach_project_updated_at_idx').on(table.outreach_project_id, table.updated_at),
]);

// ── outreach ──────────────────────────────────────────────────────────────────
export const outreach = pgTable('outreach', {
  id: uuid('id').primaryKey().defaultRandom(),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
  content: jsonb('content').$type<OutreachContent>(),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  is_current: boolean('is_current').default(true),
}, (table) => [
  uniqueIndex('outreach_one_current_per_person')
    .on(table.person_id)
    .where(sql`${table.is_current} = true`),
]);

// ── call_prep ─────────────────────────────────────────────────────────────────
export const call_prep = pgTable('call_prep', {
  id: uuid('id').primaryKey().defaultRandom(),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
  content: jsonb('content').$type<CallPrepContent>(),
  is_reviewed: boolean('is_reviewed').default(false),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  is_current: boolean('is_current').default(true),
}, (table) => [
  uniqueIndex('call_prep_one_current_per_person')
    .on(table.person_id)
    .where(sql`${table.is_current} = true`),
]);

// ── interactions ──────────────────────────────────────────────────────────────
export const interactions = pgTable('interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
  live_session_id: text('live_session_id'),
  type: text('type').default('call'),
  notes_raw: text('notes_raw'),
  transcript_raw: text('transcript_raw'),
  scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('interactions_live_session_id_unique_idx')
    .on(table.live_session_id)
    .where(sql`${table.live_session_id} is not null`),
]);

export type LiveCallSessionTopic = {
  id: string;
  label: string;
  category: string;
  checked?: boolean;
  checkedBy?: string | null;
  checkedAt?: string | null;
  evidence?: string | null;
  manualOverride?: boolean;
};

export type LiveCallSessionMetadata = Record<string, unknown>;

// ── live_call_sessions ───────────────────────────────────────────────────────
export const live_call_sessions = pgTable('live_call_sessions', {
  id: uuid('id').primaryKey(),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull().default('active'),
  capture_provider: text('capture_provider').notNull().default('zoom_rtms'),
  zoom_meeting_identifier: text('zoom_meeting_identifier'),
  zoom_meeting_id: text('zoom_meeting_id'),
  zoom_meeting_uuid: text('zoom_meeting_uuid'),
  rtms_stream_id: text('rtms_stream_id'),
  topics_json: jsonb('topics_json').$type<LiveCallSessionTopic[]>().notNull(),
  metadata: jsonb('metadata').$type<LiveCallSessionMetadata>(),
  started_at: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  ended_at: timestamp('ended_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('live_call_sessions_user_status_idx').on(table.user_id, table.status),
  index('live_call_sessions_person_started_idx').on(table.person_id, table.started_at),
  index('live_call_sessions_zoom_meeting_id_idx').on(table.zoom_meeting_id),
  index('live_call_sessions_zoom_meeting_uuid_idx').on(table.zoom_meeting_uuid),
  index('live_call_sessions_rtms_stream_id_idx').on(table.rtms_stream_id),
]);

// ── live_transcript_turns ────────────────────────────────────────────────────
export const live_transcript_turns = pgTable('live_transcript_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  live_session_id: uuid('live_session_id').references(() => live_call_sessions.id, { onDelete: 'cascade' }).notNull(),
  source: text('source').notNull(),
  speaker: text('speaker'),
  text: text('text').notNull(),
  external_turn_id: text('external_turn_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('live_transcript_turns_session_created_idx').on(table.live_session_id, table.created_at),
  uniqueIndex('live_transcript_turns_external_turn_unique_idx')
    .on(table.live_session_id, table.external_turn_id)
    .where(sql`${table.external_turn_id} is not null`),
]);

export const zoom_rtms_unbound_events = pgTable('zoom_rtms_unbound_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  event_type: text('event_type').notNull(),
  zoom_meeting_id: text('zoom_meeting_id'),
  zoom_meeting_uuid: text('zoom_meeting_uuid'),
  rtms_stream_id: text('rtms_stream_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('zoom_rtms_unbound_events_meeting_id_idx').on(table.zoom_meeting_id),
  index('zoom_rtms_unbound_events_meeting_uuid_idx').on(table.zoom_meeting_uuid),
]);

// ── debriefs ──────────────────────────────────────────────────────────────────
export const debriefs = pgTable('debriefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  interaction_id: uuid('interaction_id').references(() => interactions.id, { onDelete: 'cascade' }),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  what_was_learned: text('what_was_learned'),
  pain_signals: text('pain_signals').array(),
  unclear_items: text('unclear_items').array(),
  missed_openings: text('missed_openings').array(),
  objections_raised: text('objections_raised').array(),
  coaching_feedback: text('coaching_feedback'),
  next_person_suggestions: text('next_person_suggestions').array(),
  hypothesis_updates: jsonb('hypothesis_updates'),
  updated_assumptions: text('updated_assumptions').array(),

  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
});

// ── insights ──────────────────────────────────────────────────────────────────
export const insights = pgTable('insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  content: jsonb('content').$type<InsightContent>(),
  persona_coverage: jsonb('persona_coverage'),
  recurring_themes: text('recurring_themes').array(),
  unresolved_questions: text('unresolved_questions').array(),
  hypothesis_evolution: jsonb('hypothesis_evolution'),
  interview_quality_trend: text('interview_quality_trend'),
  summary_statement: text('summary_statement'),
  calls_analyzed: integer('calls_analyzed'),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  is_current: boolean('is_current').default(true),
});

// ── onboarding_sessions ───────────────────────────────────────────────────────
export const onboarding_sessions = pgTable('onboarding_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).unique(),
  status: text('status').default('active'), // 'active' | 'ready' | 'completed'
  current_slot: text('current_slot'),
  started_at: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  progress_json: jsonb('progress_json'),
});

// ── onboarding_messages ───────────────────────────────────────────────────────
export const onboarding_messages = pgTable('onboarding_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  session_id: uuid('session_id').references(() => onboarding_sessions.id, { onDelete: 'cascade' }),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'assistant' | 'user'
  content: text('content').notNull(),
  message_type: text('message_type'), // 'question' | 'choice_answer' | 'custom_answer' | 'system'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('onboarding_messages_session_created_at_idx').on(table.session_id, table.created_at),
]);

// ── onboarding_state ──────────────────────────────────────────────────────────
export const onboarding_state = pgTable('onboarding_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).unique(),
  state_json: jsonb('state_json'),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── project_foundations ───────────────────────────────────────────────────────
export const project_foundations = pgTable('project_foundations', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  foundation_json: jsonb('foundation_json'),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('project_foundations_project_generated_at_idx').on(table.project_id, table.generated_at),
]);

// ── project_match_profiles ───────────────────────────────────────────────────
export const project_match_profiles = pgTable('project_match_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  profile_json: jsonb('profile_json').$type<ProjectMatchProfileJson>(),
  signal_count_at_generation: integer('signal_count_at_generation').default(0),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('project_match_profiles_project_version_idx').on(table.project_id, table.version),
]);

// ── transcripts ───────────────────────────────────────────────────────────────
export const transcripts = pgTable('transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  type: text('type').notNull().default('call'), // 'call' | 'message'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('transcripts_person_created_at_idx').on(table.person_id, table.created_at),
]);

// ── person_events ─────────────────────────────────────────────────────────────
export const person_events = pgTable('person_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('person_events_person_created_at_idx').on(table.person_id, table.created_at),
]);

// ── Inferred types ────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type OutreachProject = typeof outreach_projects.$inferSelect;
export type ProjectIntake = typeof project_intake.$inferSelect;
export type ProjectBrief = typeof project_briefs.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Outreach = typeof outreach.$inferSelect;
export type CallPrep = typeof call_prep.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type LiveCallSession = typeof live_call_sessions.$inferSelect;
export type LiveTranscriptTurnRow = typeof live_transcript_turns.$inferSelect;
export type ZoomRtmsUnboundEvent = typeof zoom_rtms_unbound_events.$inferSelect;
export type Debrief = typeof debriefs.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type OnboardingSession = typeof onboarding_sessions.$inferSelect;
export type OnboardingMessage = typeof onboarding_messages.$inferSelect;
export type OnboardingStateRow = typeof onboarding_state.$inferSelect;
export type ProjectFoundation = typeof project_foundations.$inferSelect;
export type ProjectMatchProfile = typeof project_match_profiles.$inferSelect;
export type Transcript = typeof transcripts.$inferSelect;
export type PersonEvent = typeof person_events.$inferSelect;
