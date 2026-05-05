WITH ranked_call_prep AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY person_id
      ORDER BY generated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM call_prep
  WHERE is_current = true
)
UPDATE call_prep
SET is_current = false
WHERE id IN (
  SELECT id
  FROM ranked_call_prep
  WHERE rn > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "call_prep_one_current_per_person"
ON "call_prep" ("person_id")
WHERE "is_current" = true;
--> statement-breakpoint
WITH ranked_project_briefs AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY project_id
      ORDER BY generated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM project_briefs
  WHERE is_current = true
)
UPDATE project_briefs
SET is_current = false
WHERE id IN (
  SELECT id
  FROM ranked_project_briefs
  WHERE rn > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_briefs_one_current_per_project"
ON "project_briefs" ("project_id")
WHERE "is_current" = true;
