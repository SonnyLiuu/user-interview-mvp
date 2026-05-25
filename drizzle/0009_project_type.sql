ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "project_type" text DEFAULT 'startup' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects"
  ADD CONSTRAINT "projects_project_type_check"
  CHECK ("project_type" IN ('startup', 'networking'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
