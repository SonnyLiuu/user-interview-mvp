ALTER TABLE "people"
ADD COLUMN IF NOT EXISTS "discovered_urls" jsonb;
