ALTER TABLE "people"
ADD COLUMN IF NOT EXISTS "outreach_project_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "people"
  ADD CONSTRAINT "people_outreach_project_id_outreach_projects_id_fk"
  FOREIGN KEY ("outreach_project_id") REFERENCES "public"."outreach_projects"("id")
  ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
WITH startup_projects_with_people AS (
  SELECT DISTINCT p.project_id AS startup_project_id
  FROM "people" p
  INNER JOIN "projects" pr ON pr.id = p.project_id
  WHERE p.project_id IS NOT NULL
    AND pr.project_type = 'startup'
),
inserted_idea_validation_projects AS (
  INSERT INTO "outreach_projects" ("startup_project_id", "type", "name", "status")
  SELECT
    spp.startup_project_id,
    'idea_validation',
    'Idea Validation',
    'active'
  FROM startup_projects_with_people spp
  WHERE NOT EXISTS (
    SELECT 1
    FROM "outreach_projects" op
    WHERE op.startup_project_id = spp.startup_project_id
      AND op.type = 'idea_validation'
      AND op.status <> 'archived'
  )
  RETURNING "startup_project_id", "id"
),
target_idea_validation_projects AS (
  SELECT DISTINCT ON (candidate.startup_project_id)
    candidate.startup_project_id,
    candidate.id
  FROM (
    SELECT
      op.startup_project_id,
      op.id,
      op.status,
      op.updated_at,
      op.created_at
    FROM "outreach_projects" op
    INNER JOIN startup_projects_with_people spp ON spp.startup_project_id = op.startup_project_id
    WHERE op.type = 'idea_validation'
      AND op.status <> 'archived'
    UNION ALL
    SELECT
      inserted.startup_project_id,
      inserted.id,
      'active' AS status,
      now() AS updated_at,
      now() AS created_at
    FROM inserted_idea_validation_projects inserted
  ) candidate
  ORDER BY
    candidate.startup_project_id,
    CASE candidate.status
      WHEN 'active' THEN 0
      WHEN 'onboarding' THEN 1
      WHEN 'draft' THEN 2
      WHEN 'paused' THEN 3
      WHEN 'completed' THEN 4
      ELSE 5
    END,
    candidate.updated_at DESC,
    candidate.created_at DESC,
    candidate.id DESC
)
UPDATE "people" p
SET
  "outreach_project_id" = tidp.id,
  "updated_at" = now()
FROM target_idea_validation_projects tidp
WHERE p.project_id = tidp.startup_project_id
  AND p.outreach_project_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_outreach_project_created_at_idx"
ON "people" ("outreach_project_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_outreach_project_updated_at_idx"
ON "people" ("outreach_project_id", "updated_at");
