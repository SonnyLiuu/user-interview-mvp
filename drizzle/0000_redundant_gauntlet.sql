CREATE TABLE "call_prep" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"objective" text,
	"learning_goals" text[],
	"question_sequence" jsonb,
	"signals_to_watch" text[],
	"mistakes_to_avoid" text[],
	"closing_question" text,
	"is_reviewed" boolean DEFAULT false,
	"generated_at" timestamp with time zone DEFAULT now(),
	"reviewed_at" timestamp with time zone,
	"is_current" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "debriefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid,
	"person_id" uuid,
	"project_id" uuid,
	"what_was_learned" text,
	"pain_signals" text[],
	"unclear_items" text[],
	"missed_openings" text[],
	"objections_raised" text[],
	"coaching_feedback" text,
	"next_person_suggestions" text[],
	"hypothesis_updates" jsonb,
	"updated_assumptions" text[],
	"generated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"persona_coverage" jsonb,
	"recurring_themes" text[],
	"unresolved_questions" text[],
	"hypothesis_evolution" jsonb,
	"interview_quality_trend" text,
	"summary_statement" text,
	"calls_analyzed" integer,
	"generated_at" timestamp with time zone DEFAULT now(),
	"is_current" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"type" text DEFAULT 'call',
	"notes_raw" text,
	"transcript_raw" text,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "outreach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"channel" text NOT NULL,
	"content" jsonb,
	"generated_at" timestamp with time zone DEFAULT now(),
	"is_current" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"title" text,
	"company" text,
	"persona_type" text,
	"source_urls" text[],
	"raw_pasted_text" text,
	"additional_context" text[],
	"crawl_status" text DEFAULT 'pending',
	"crawled_content" jsonb,
	"crawl_error" text,
	"analysis" jsonb,
	"analysis_version" integer DEFAULT 0,
	"analysis_status" text DEFAULT 'pending',
	"board_status" text DEFAULT 'bookmarked',
	"call_scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"idea_summary" text,
	"strengths" text[],
	"weaknesses" text[],
	"most_promising_avenues" text[],
	"recommended_conversations" jsonb,
	"assumptions" jsonb,
	"debrief_count_at_generation" integer DEFAULT 0,
	"generated_at" timestamp with time zone DEFAULT now(),
	"is_current" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "project_intake" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"what_are_you_building" text,
	"for_whom" text,
	"why_now" text,
	"pain_description" text,
	"pain_frequency" text,
	"current_solutions" text,
	"why_not_solved" text,
	"consequence_if_unsolved" text,
	"who_feels_pain" text,
	"who_pays" text,
	"user_buyer_same_person" boolean,
	"who_influences" text,
	"who_benefits_most" text,
	"who_has_budget" text,
	"urgency_level" text,
	"most_promising_angle" text,
	"narrow_wedge" text,
	"key_assumptions" text[],
	"biggest_failure_reasons" text[],
	"personal_connection" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "project_intake_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"intake_status" text DEFAULT 'not_started',
	"is_archived" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"subscription" text DEFAULT 'free',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "call_prep" ADD CONSTRAINT "call_prep_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debriefs" ADD CONSTRAINT "debriefs_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debriefs" ADD CONSTRAINT "debriefs_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debriefs" ADD CONSTRAINT "debriefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_intake" ADD CONSTRAINT "project_intake_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;