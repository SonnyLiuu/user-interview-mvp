ALTER TABLE "interactions"
ADD COLUMN IF NOT EXISTS "outreach_project_id" uuid;
--> statement-breakpoint
ALTER TABLE "transcripts"
ADD COLUMN IF NOT EXISTS "outreach_project_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "interactions"
  ADD CONSTRAINT "interactions_outreach_project_id_outreach_projects_id_fk"
  FOREIGN KEY ("outreach_project_id") REFERENCES "public"."outreach_projects"("id")
  ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "transcripts"
  ADD CONSTRAINT "transcripts_outreach_project_id_outreach_projects_id_fk"
  FOREIGN KEY ("outreach_project_id") REFERENCES "public"."outreach_projects"("id")
  ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
UPDATE "interactions" i
SET "outreach_project_id" = p."outreach_project_id"
FROM "people" p
WHERE i."person_id" = p."id"
  AND i."outreach_project_id" IS NULL
  AND p."outreach_project_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "transcripts" t
SET "outreach_project_id" = p."outreach_project_id"
FROM "people" p
WHERE t."person_id" = p."id"
  AND t."outreach_project_id" IS NULL
  AND p."outreach_project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_outreach_project_completed_idx"
ON "interactions" ("outreach_project_id", "completed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcripts_outreach_project_created_at_idx"
ON "transcripts" ("outreach_project_id", "created_at");
