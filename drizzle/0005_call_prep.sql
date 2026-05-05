ALTER TABLE "call_prep" ADD COLUMN IF NOT EXISTS "content" jsonb;
--> statement-breakpoint
UPDATE "call_prep"
SET "content" = jsonb_strip_nulls(jsonb_build_object(
  'objective', "objective",
  'goals', to_jsonb("learning_goals"),
  'questions',
    CASE
      WHEN jsonb_typeof("question_sequence") = 'array' THEN (
        SELECT COALESCE(jsonb_agg(COALESCE(question->>'question', question->>'text', question#>>'{}')), '[]'::jsonb)
        FROM jsonb_array_elements("question_sequence") AS question
      )
      WHEN "question_sequence" IS NULL THEN NULL
      ELSE jsonb_build_array("question_sequence"#>>'{}')
    END,
  'signals', to_jsonb("signals_to_watch"),
  'closing', "closing_question"
))
WHERE "content" IS NULL;
