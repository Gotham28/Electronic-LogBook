CREATE TABLE "maintenance_announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"expected_impact" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"audience_roles" jsonb DEFAULT '["student","professor","hod"]'::jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"reminder_24h_sent" boolean DEFAULT false NOT NULL,
	"reminder_1h_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_announcements" ADD CONSTRAINT "maintenance_announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;