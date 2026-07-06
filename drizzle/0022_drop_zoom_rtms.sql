DROP TABLE IF EXISTS "zoom_rtms_unbound_events";
--> statement-breakpoint
DROP INDEX IF EXISTS "live_call_sessions_zoom_meeting_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "live_call_sessions_zoom_meeting_uuid_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "live_call_sessions_rtms_stream_id_idx";
--> statement-breakpoint
ALTER TABLE "live_call_sessions" DROP COLUMN IF EXISTS "zoom_meeting_id";
--> statement-breakpoint
ALTER TABLE "live_call_sessions" DROP COLUMN IF EXISTS "zoom_meeting_uuid";
--> statement-breakpoint
ALTER TABLE "live_call_sessions" DROP COLUMN IF EXISTS "rtms_stream_id";
