import { pgTable, text, boolean, integer, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';

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
  intake_status: text('intake_status').default('not_started'),
  is_archived: boolean('is_archived').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

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
  key_assumptions: text('key_assumptions').array(),
  biggest_failure_reasons: text('biggest_failure_reasons').array(),
  personal_connection: text('personal_connection'),

  // Chat history: [{ role: 'assistant' | 'user', content: string }]
  conversation: jsonb('conversation'),

  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── project_briefs ────────────────────────────────────────────────────────────
export const project_briefs = pgTable('project_briefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  idea_summary: text('idea_summary'),
  strengths: text('strengths').array(),
  weaknesses: text('weaknesses').array(),
  most_promising_avenues: text('most_promising_avenues').array(),
  recommended_conversations: jsonb('recommended_conversations'),
  assumptions: jsonb('assumptions'),

  debrief_count_at_generation: integer('debrief_count_at_generation').default(0),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  is_current: boolean('is_current').default(true),
});

// ── people ────────────────────────────────────────────────────────────────────
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  title: text('title'),
  company: text('company'),
  persona_type: text('persona_type'),

  source_urls: text('source_urls').array(),
  raw_pasted_text: text('raw_pasted_text'),
  additional_context: text('additional_context').array(),

  crawl_status: text('crawl_status').default('pending'),
  crawled_content: jsonb('crawled_content'),
  crawl_error: text('crawl_error'),

  analysis: jsonb('analysis'),
  analysis_version: integer('analysis_version').default(0),
  analysis_status: text('analysis_status').default('pending'),

  board_status: text('board_status').default('bookmarked'),
  call_scheduled_at: timestamp('call_scheduled_at', { withTimezone: true }),

  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── outreach ──────────────────────────────────────────────────────────────────
export const outreach = pgTable('outreach', {
  id: uuid('id').primaryKey().defaultRandom(),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),
  content: jsonb('content'),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  is_current: boolean('is_current').default(true),
});

// ── call_prep ─────────────────────────────────────────────────────────────────
export const call_prep = pgTable('call_prep', {
  id: uuid('id').primaryKey().defaultRandom(),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
  objective: text('objective'),
  learning_goals: text('learning_goals').array(),
  question_sequence: jsonb('question_sequence'),
  signals_to_watch: text('signals_to_watch').array(),
  mistakes_to_avoid: text('mistakes_to_avoid').array(),
  closing_question: text('closing_question'),
  is_reviewed: boolean('is_reviewed').default(false),
  generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  is_current: boolean('is_current').default(true),
});

// ── interactions ──────────────────────────────────────────────────────────────
export const interactions = pgTable('interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  person_id: uuid('person_id').references(() => people.id, { onDelete: 'cascade' }),
  type: text('type').default('call'),
  notes_raw: text('notes_raw'),
  transcript_raw: text('transcript_raw'),
  scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

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
});

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
});

// ── Inferred types ────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectIntake = typeof project_intake.$inferSelect;
export type ProjectBrief = typeof project_briefs.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Outreach = typeof outreach.$inferSelect;
export type CallPrep = typeof call_prep.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Debrief = typeof debriefs.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type OnboardingSession = typeof onboarding_sessions.$inferSelect;
export type OnboardingMessage = typeof onboarding_messages.$inferSelect;
export type OnboardingStateRow = typeof onboarding_state.$inferSelect;
export type ProjectFoundation = typeof project_foundations.$inferSelect;
