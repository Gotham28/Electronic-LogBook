-- The application schema (lib/db/src/schema/logs.ts) reads academic_logs.faculty_grade, but no
-- earlier migration created it. IF NOT EXISTS leaves databases that already have it untouched.
ALTER TABLE "academic_logs" ADD COLUMN IF NOT EXISTS "faculty_grade" text;
