CREATE TABLE "colleges" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "accepting_registrations" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "colleges_code_unique" UNIQUE("code")
);

INSERT INTO "colleges" ("name", "code", "accepting_registrations")
VALUES ('Kannur Medical College', 'kannur-medical-college', true);

ALTER TABLE "departments" ADD COLUMN "college_id" integer;
UPDATE "departments" SET "college_id" = (SELECT "id" FROM "colleges" WHERE "code" = 'kannur-medical-college');
ALTER TABLE "departments" ALTER COLUMN "college_id" SET NOT NULL;
ALTER TABLE "departments" ADD CONSTRAINT "departments_college_id_colleges_id_fk"
  FOREIGN KEY ("college_id") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "departments" DROP CONSTRAINT "departments_code_unique";
CREATE UNIQUE INDEX "departments_college_code_unique" ON "departments" ("college_id", "code");
CREATE UNIQUE INDEX "departments_college_id_unique" ON "departments" ("college_id", "id");
ALTER TABLE "departments" ADD CONSTRAINT "departments_mirror_same_college_fk"
  FOREIGN KEY ("college_id", "config_source_department_id")
  REFERENCES "departments"("college_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
