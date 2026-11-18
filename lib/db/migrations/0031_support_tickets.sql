CREATE TABLE IF NOT EXISTS "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_code" text NOT NULL,
	"name" text,
	"email" text,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"page_url" text,
	"user_agent" text,
	"user_id" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_notes" text,
	"email_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "support_tickets_reference_code_unique" UNIQUE("reference_code")
);

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'support_tickets_user_id_users_id_fk'
			AND conrelid = 'support_tickets'::regclass
	) THEN
		ALTER TABLE "support_tickets"
			ADD CONSTRAINT "support_tickets_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
	END IF;
END $$;
