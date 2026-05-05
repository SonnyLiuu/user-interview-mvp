ALTER TABLE "people" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "last_contacted_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid REFERENCES "people"("id") ON DELETE cascade,
	"content" text NOT NULL,
	"type" text DEFAULT 'call' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE TABLE "person_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid REFERENCES "people"("id") ON DELETE cascade,
	"type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
