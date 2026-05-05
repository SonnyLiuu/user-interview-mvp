WITH ranked_outreach AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY person_id
      ORDER BY generated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM outreach
  WHERE is_current = true
)
UPDATE outreach
SET is_current = false
WHERE id IN (
  SELECT id
  FROM ranked_outreach
  WHERE rn > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outreach_one_current_per_person"
ON "outreach" ("person_id")
WHERE "is_current" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_active_user_created_at_idx"
ON "projects" ("user_id", "created_at")
WHERE "is_archived" = false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_active_user_slug_idx"
ON "projects" ("user_id", "slug")
WHERE "is_archived" = false AND "slug" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_project_created_at_idx"
ON "people" ("project_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_project_updated_at_idx"
ON "people" ("project_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_foundations_project_generated_at_idx"
ON "project_foundations" ("project_id", "generated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_messages_session_created_at_idx"
ON "onboarding_messages" ("session_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcripts_person_created_at_idx"
ON "transcripts" ("person_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_events_person_created_at_idx"
ON "person_events" ("person_id", "created_at");
