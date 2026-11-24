CREATE TABLE "assistant_department_weekly_digests" (
  "department_id" integer NOT NULL REFERENCES "public"."departments"("id") ON DELETE CASCADE,
  "week_start" date NOT NULL,
  "status" text NOT NULL,
  "attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "generated_at" timestamp with time zone,
  "summary" text,
  CONSTRAINT "assistant_department_weekly_digests_pkey" PRIMARY KEY ("department_id", "week_start"),
  CONSTRAINT "assistant_department_weekly_digests_status_check" CHECK ("status" IN ('pending', 'ready', 'failed')),
  CONSTRAINT "assistant_department_weekly_digests_result_check" CHECK (
    ("status" = 'ready' AND "summary" IS NOT NULL AND "generated_at" IS NOT NULL)
    OR ("status" <> 'ready' AND "summary" IS NULL AND "generated_at" IS NULL)
  )
);
