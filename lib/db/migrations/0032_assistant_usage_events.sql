CREATE TABLE "assistant_usage_events" (
  "id" serial PRIMARY KEY,
  "user_id" integer REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "role" text NOT NULL,
  "department_id" integer REFERENCES "public"."departments"("id") ON DELETE SET NULL,
  "feature" text NOT NULL,
  "event_type" text NOT NULL,
  "http_status" integer,
  "token_count" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "assistant_usage_events_created_idx"
  ON "assistant_usage_events" ("created_at");
CREATE INDEX "assistant_usage_events_department_created_idx"
  ON "assistant_usage_events" ("department_id", "created_at");
