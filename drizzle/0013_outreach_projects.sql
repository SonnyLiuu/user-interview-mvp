CREATE TABLE "outreach_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"brief_json" jsonb,
	"onboarding_state_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_projects_type_check" CHECK ("type" in (
		'idea_validation',
		'customer_acquisition',
		'beta_users',
		'investor',
		'partnership',
		'recruiting',
		'advisor',
		'press_creator'
	)),
	CONSTRAINT "outreach_projects_status_check" CHECK ("status" in (
		'draft',
		'onboarding',
		'active',
		'paused',
		'completed',
		'archived'
	))
);
--> statement-breakpoint
ALTER TABLE "outreach_projects" ADD CONSTRAINT "outreach_projects_startup_project_id_projects_id_fk" FOREIGN KEY ("startup_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "outreach_projects_startup_created_at_idx" ON "outreach_projects" USING btree ("startup_project_id","created_at");
--> statement-breakpoint
CREATE INDEX "outreach_projects_startup_status_idx" ON "outreach_projects" USING btree ("startup_project_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_projects_one_active_idea_validation_idx" ON "outreach_projects" USING btree ("startup_project_id","type") WHERE "type" = 'idea_validation' and "status" <> 'archived';
