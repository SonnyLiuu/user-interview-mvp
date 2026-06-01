CREATE TABLE "live_call_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"capture_provider" text DEFAULT 'zoom_rtms' NOT NULL,
	"zoom_meeting_identifier" text,
	"zoom_meeting_id" text,
	"zoom_meeting_uuid" text,
	"rtms_stream_id" text,
	"topics_json" jsonb NOT NULL,
	"metadata" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_transcript_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"live_session_id" uuid NOT NULL,
	"source" text NOT NULL,
	"speaker" text,
	"text" text NOT NULL,
	"external_turn_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoom_rtms_unbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"zoom_meeting_id" text,
	"zoom_meeting_uuid" text,
	"rtms_stream_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "live_session_id" text;
--> statement-breakpoint
ALTER TABLE "live_call_sessions" ADD CONSTRAINT "live_call_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "live_call_sessions" ADD CONSTRAINT "live_call_sessions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "live_transcript_turns" ADD CONSTRAINT "live_transcript_turns_live_session_id_live_call_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_call_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "live_call_sessions_user_status_idx" ON "live_call_sessions" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "live_call_sessions_person_started_idx" ON "live_call_sessions" USING btree ("person_id","started_at");
--> statement-breakpoint
CREATE INDEX "live_call_sessions_zoom_meeting_id_idx" ON "live_call_sessions" USING btree ("zoom_meeting_id");
--> statement-breakpoint
CREATE INDEX "live_call_sessions_zoom_meeting_uuid_idx" ON "live_call_sessions" USING btree ("zoom_meeting_uuid");
--> statement-breakpoint
CREATE INDEX "live_call_sessions_rtms_stream_id_idx" ON "live_call_sessions" USING btree ("rtms_stream_id");
--> statement-breakpoint
CREATE INDEX "live_transcript_turns_session_created_idx" ON "live_transcript_turns" USING btree ("live_session_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "live_transcript_turns_external_turn_unique_idx" ON "live_transcript_turns" USING btree ("live_session_id","external_turn_id") WHERE "external_turn_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "interactions_live_session_id_unique_idx" ON "interactions" USING btree ("live_session_id") WHERE "live_session_id" is not null;
--> statement-breakpoint
CREATE INDEX "zoom_rtms_unbound_events_meeting_id_idx" ON "zoom_rtms_unbound_events" USING btree ("zoom_meeting_id");
--> statement-breakpoint
CREATE INDEX "zoom_rtms_unbound_events_meeting_uuid_idx" ON "zoom_rtms_unbound_events" USING btree ("zoom_meeting_uuid");
