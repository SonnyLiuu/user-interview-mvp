ALTER TABLE "people" ADD COLUMN "relevance_rank" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "research_depth" text DEFAULT 'deep';--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "board_status" DROP DEFAULT;
