-- Migration: add_review_fields_postings_thesis_certifications
-- Description: Add status + faculty_remarks to postings and certifications;
--              add faculty_remarks to research (thesis status columns already exist).
-- Direction: FORWARD ONLY — additive, no existing data altered.
-- Apply via: psql $DATABASE_URL -f this_file.sql
-- Safe to re-run: columns are added with IF NOT EXISTS guards.

ALTER TABLE postings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS faculty_remarks TEXT;

ALTER TABLE research
  ADD COLUMN IF NOT EXISTS faculty_remarks TEXT;

ALTER TABLE certifications
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS faculty_remarks TEXT;
