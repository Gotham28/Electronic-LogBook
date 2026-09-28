-- Migration 0021: Add organ_system, clinical_findings, competency columns to clinical_work_logs
-- Also add organ_system_option to department_catalog kind enum
-- All changes are ADDITIVE and non-destructive. Existing rows are unaffected.

-- 1. Add new nullable columns to clinical_work_logs
ALTER TABLE "clinical_work_logs" ADD COLUMN IF NOT EXISTS "organ_system" text;
ALTER TABLE "clinical_work_logs" ADD COLUMN IF NOT EXISTS "clinical_findings" text;
ALTER TABLE "clinical_work_logs" ADD COLUMN IF NOT EXISTS "competency" text;

-- 2. Extend the department_catalog.kind check constraint to allow "organ_system_option"
-- Drop the old implicit kind check (it was an enum in Drizzle which generates a CHECK constraint)
-- and recreate it with the new value included.
-- First, find and drop the generated CHECK constraint for 'kind'.
DO $$ DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'department_catalog'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%case_category%'
    AND conname != 'department_catalog_parent_check';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE department_catalog DROP CONSTRAINT %I', cname);
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "department_catalog" ADD CONSTRAINT "department_catalog_kind_check"
  CHECK ("kind" IN ('posting', 'academic', 'case_category', 'competency_level', 'leave_type',
                    'conference_level', 'clinical_work_category', 'clinical_work_subtype',
                    'organ_system_option'));
