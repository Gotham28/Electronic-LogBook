CREATE TABLE "department_name_change_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "audit_id" uuid NOT NULL,
  "department_id" integer NOT NULL,
  "subject_user_id" integer NOT NULL,
  "student_id" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "read_at" timestamptz,
  "read_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "name_change_email_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" uuid NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "recipient_user_id" integer,
  "recipient_generation" integer DEFAULT 0 NOT NULL,
  "idempotency_key" text,
  "frozen_payload" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "first_attempt_at" timestamptz,
  "next_attempt_at" timestamptz DEFAULT now() NOT NULL,
  "lease_token" uuid,
  "lease_until" timestamptz,
  "accepted_at" timestamptz,
  "failure_code" text,
  "provider_status" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "name_change_email_outbox_status_check"
    CHECK ("status" IN ('queued', 'processing', 'waiting_for_hod', 'waiting_for_subject',
      'waiting_for_configuration', 'accepted', 'needs_attention', 'cancelled', 'suppressed_test')),
  CONSTRAINT "name_change_email_outbox_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
  CONSTRAINT "name_change_email_outbox_generation_nonnegative" CHECK ("recipient_generation" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "department_name_change_notifications_audit_id_unique"
  ON "department_name_change_notifications" ("audit_id");
--> statement-breakpoint
CREATE INDEX "department_name_change_notifications_department_created_idx"
  ON "department_name_change_notifications" ("department_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX "department_name_change_notifications_department_unread_idx"
  ON "department_name_change_notifications" ("department_id", "created_at" DESC, "id" DESC)
  WHERE "read_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "name_change_email_outbox_notification_id_unique"
  ON "name_change_email_outbox" ("notification_id");
--> statement-breakpoint
CREATE INDEX "name_change_email_outbox_due_idx"
  ON "name_change_email_outbox" ("status", "next_attempt_at", "lease_until");
--> statement-breakpoint
CREATE INDEX "audit_profile_name_history_idx"
  ON "audit" ("table_name", "record_id", "timestamp" DESC, "id" DESC)
  WHERE "after_state"->>'eventType' = 'profile_name_change';
--> statement-breakpoint
ALTER TABLE "department_name_change_notifications"
  ADD CONSTRAINT "department_name_change_notifications_audit_id_audit_id_fk"
  FOREIGN KEY ("audit_id") REFERENCES "audit"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "department_name_change_notifications"
  ADD CONSTRAINT "department_name_change_notifications_department_id_departments_id_fk"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "department_name_change_notifications"
  ADD CONSTRAINT "department_name_change_notifications_subject_user_id_users_id_fk"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "department_name_change_notifications"
  ADD CONSTRAINT "department_name_change_notifications_student_id_students_id_fk"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "department_name_change_notifications"
  ADD CONSTRAINT "department_name_change_notifications_read_by_user_id_users_id_fk"
  FOREIGN KEY ("read_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "department_name_change_notifications"
  ADD CONSTRAINT "department_name_change_notifications_reader_consistency"
  CHECK (("read_at" IS NULL AND "read_by_user_id" IS NULL) OR "read_at" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "name_change_email_outbox"
  ADD CONSTRAINT "name_change_email_outbox_notification_id_department_name_change_notifications_id_fk"
  FOREIGN KEY ("notification_id") REFERENCES "department_name_change_notifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "name_change_email_outbox"
  ADD CONSTRAINT "name_change_email_outbox_recipient_user_id_users_id_fk"
  FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
