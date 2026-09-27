ALTER TABLE "conferences" ADD COLUMN "conference_type" text DEFAULT 'conference' NOT NULL;
ALTER TABLE "conferences" ADD COLUMN "level" text;
ALTER TABLE "conferences" ADD COLUMN "category" text;
