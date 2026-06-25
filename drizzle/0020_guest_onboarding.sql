ALTER TABLE "projects" ADD COLUMN "entry_goal" text;
--> statement-breakpoint
CREATE TABLE "guest_onboarding_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "profile_json" jsonb,
  "ip_hash" text,
  "request_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "claimed_by_user_id" uuid,
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "guest_onboarding_claims_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade,
  CONSTRAINT "guest_onboarding_claims_claimed_by_user_id_users_id_fk"
    FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null,
  CONSTRAINT "guest_onboarding_claims_project_id_unique" UNIQUE("project_id"),
  CONSTRAINT "guest_onboarding_claims_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "guest_onboarding_claims_status_check"
    CHECK ("status" IN ('active', 'claimed', 'abandoned'))
);
--> statement-breakpoint
CREATE INDEX "guest_onboarding_claims_ip_created_idx"
  ON "guest_onboarding_claims" USING btree ("ip_hash", "created_at");
--> statement-breakpoint
CREATE INDEX "guest_onboarding_claims_expires_idx"
  ON "guest_onboarding_claims" USING btree ("expires_at");
