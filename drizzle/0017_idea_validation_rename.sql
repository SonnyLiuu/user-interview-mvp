DO $$ DECLARE
  old_type text := 'information' || '_' || 'discovery';
  new_type text := 'idea_validation';
  old_label text := 'Information' || ' ' || 'Discovery';
  new_label text := 'Idea Validation';
  old_active_index text := 'outreach_projects_one_active_' || old_type || '_idx';
BEGIN
  EXECUTE format('DROP INDEX IF EXISTS %I', old_active_index);

  ALTER TABLE "outreach_projects"
  DROP CONSTRAINT IF EXISTS "outreach_projects_type_check";

  UPDATE "outreach_projects"
  SET
    "type" = new_type,
    "name" = CASE WHEN "name" = old_label THEN new_label ELSE "name" END,
    "brief_json" = CASE
      WHEN "brief_json" IS NULL THEN NULL
      ELSE replace(replace("brief_json"::text, old_type, new_type), old_label, new_label)::jsonb
    END,
    "onboarding_state_json" = CASE
      WHEN "onboarding_state_json" IS NULL THEN NULL
      ELSE replace(replace("onboarding_state_json"::text, old_type, new_type), old_label, new_label)::jsonb
    END,
    "updated_at" = now()
  WHERE "type" = old_type
     OR "name" = old_label
     OR "brief_json"::text LIKE '%' || old_type || '%'
     OR "brief_json"::text LIKE '%' || old_label || '%'
     OR "onboarding_state_json"::text LIKE '%' || old_type || '%'
     OR "onboarding_state_json"::text LIKE '%' || old_label || '%';

  UPDATE "project_foundations"
  SET
    "foundation_json" = replace(replace("foundation_json"::text, old_type, new_type), old_label, new_label)::jsonb,
    "updated_at" = now()
  WHERE "foundation_json"::text LIKE '%' || old_type || '%'
     OR "foundation_json"::text LIKE '%' || old_label || '%';

  ALTER TABLE "outreach_projects"
  ADD CONSTRAINT "outreach_projects_type_check" CHECK ("type" in (
    'idea_validation',
    'customer_acquisition',
    'beta_users',
    'investor',
    'partnership',
    'recruiting',
    'advisor',
    'press_creator'
  ));
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outreach_projects_one_active_idea_validation_idx"
ON "outreach_projects" USING btree ("startup_project_id","type")
WHERE "type" = 'idea_validation' and "status" <> 'archived';
