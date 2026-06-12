CREATE TABLE "global_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_key" text NOT NULL,
	"display_name" text NOT NULL,
	"company_key" text,
	"display_company" text,
	"title_key" text,
	"display_title" text,
	"linkedin_key" text,
	"website_key" text,
	"role_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"market_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"seniority_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"project_fit_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"learning_value_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_person_urls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_person_id" uuid NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"url_kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_person_urls_kind_check" CHECK ("url_kind" in (
		'linkedin',
		'website',
		'github',
		'twitter_x',
		'blog',
		'article',
		'other'
	))
);
--> statement-breakpoint
CREATE TABLE "person_global_links" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"global_person_id" uuid NOT NULL,
	"project_id" uuid,
	"match_method" text NOT NULL,
	"match_confidence" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_global_links_match_method_check" CHECK ("match_method" in (
		'linkedin',
		'website_name',
		'name_company_title',
		'new'
	))
);
--> statement-breakpoint
ALTER TABLE "global_person_urls" ADD CONSTRAINT "global_person_urls_global_person_id_global_people_id_fk" FOREIGN KEY ("global_person_id") REFERENCES "public"."global_people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person_global_links" ADD CONSTRAINT "person_global_links_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person_global_links" ADD CONSTRAINT "person_global_links_global_person_id_global_people_id_fk" FOREIGN KEY ("global_person_id") REFERENCES "public"."global_people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "person_global_links" ADD CONSTRAINT "person_global_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "global_people_name_company_title_idx" ON "global_people" USING btree ("name_key","company_key","title_key");
--> statement-breakpoint
CREATE INDEX "global_people_website_name_idx" ON "global_people" USING btree ("website_key","name_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "global_people_linkedin_key_idx" ON "global_people" USING btree ("linkedin_key") WHERE "linkedin_key" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "global_person_urls_normalized_url_idx" ON "global_person_urls" USING btree ("normalized_url");
--> statement-breakpoint
CREATE INDEX "global_person_urls_person_idx" ON "global_person_urls" USING btree ("global_person_id");
--> statement-breakpoint
CREATE INDEX "person_global_links_global_person_idx" ON "person_global_links" USING btree ("global_person_id");
--> statement-breakpoint
CREATE INDEX "person_global_links_project_idx" ON "person_global_links" USING btree ("project_id");
