ALTER TABLE "people" ADD COLUMN "match_score" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "match_rank" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "match_factors" jsonb;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "match_explanation" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "match_profile_version" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "match_status" text;--> statement-breakpoint
CREATE TABLE "project_match_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"profile_json" jsonb,
	"signal_count_at_generation" integer DEFAULT 0,
	"generated_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "project_match_profiles" ADD CONSTRAINT "project_match_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_match_profiles_project_version_idx" ON "project_match_profiles" USING btree ("project_id","version");
