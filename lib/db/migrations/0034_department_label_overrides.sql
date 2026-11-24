-- DRAFT. Drafted only; never run by an agent (AGENTS.md §6). The developer reviews and applies it
-- with src/migrate.ts, BEFORE deploying the code that reads `labels`.
--
-- 1. Per-department label overrides. No row for a (department, key) means the registry default
--    in lib/api-zod/src/department-labels.ts.
-- 2. One-off backfill: copies the wording that code used to pick by department name, so every
--    existing department keeps exactly what it sees today. It names departments by id, taken
--    from the developer's read-only departments query (2026-11-23), and nothing keys on a
--    department code. Each insert also checks the name, so an id that belongs to some other
--    department in another database gets no row instead of the wrong wording. Idempotent
--    (ON CONFLICT DO NOTHING).
--    Test copies (19, 24, 26, 39) get no rows of their own: labels follow config_source_department_id
--    to the source department (routes/department.ts catalog), so a test copy shows its source's
--    wording, which is what its own name match gave it before.
-- 3. Stored-name fix: "microbiology" is capitalised in the stored name, replacing the display-time
--    capitalising replace that the pages and API used to apply to every name. This changes stored
--    data (per the query output: id 14 "MicroBiology" and id 24 "MicroBiology (Test)"); review it as data.

CREATE TABLE department_label_overrides (
  id serial PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT department_label_overrides_department_id_key_key UNIQUE (department_id, key)
);

-- Radiology: id 18 "Radiology" (code RED).
INSERT INTO department_label_overrides (department_id, key, value)
SELECT d.id, v.key, v.value
FROM departments d
CROSS JOIN (VALUES
  ('postings.unitTitle', 'Posting'),
  ('postings.unitPhrase', 'posting'),
  ('postings.printColumn', 'Posting'),
  ('postings.settingsSection', 'Postings'),
  ('postings.settingsNoun', 'Postings')
) AS v(key, value)
WHERE d.id IN (18)
  AND d.name ~* 'radiology'
ON CONFLICT (department_id, key) DO NOTHING;

-- Dermatology: id 15 "Dermatology" (code DERM) and id 38 "Dermatology" (code DERM). Two real
-- Dermatology departments exist and both showed this wording, so both are listed; this migration
-- does not decide which one is canonical. The print column stays the default "Ward / Unit", as today.
INSERT INTO department_label_overrides (department_id, key, value)
SELECT d.id, v.key, v.value
FROM departments d
CROSS JOIN (VALUES
  ('postings.unitTitle', 'Posting unit'),
  ('postings.unitPhrase', 'posting unit'),
  ('postings.settingsSection', 'Postings'),
  ('postings.settingsNoun', 'Postings')
) AS v(key, value)
WHERE d.id IN (15, 38)
  AND d.name ~* 'dermatology'
ON CONFLICT (department_id, key) DO NOTHING;

-- Microbiology: id 14 "MicroBiology" (code MIC). No nav.milestones row: the sidebar used only the
-- wording flag.
INSERT INTO department_label_overrides (department_id, key, value)
SELECT d.id, 'milestones.pageTitle', 'Thesis and mandatory certifications'
FROM departments d
WHERE d.id IN (14)
  AND d.name ~* 'microbiology'
ON CONFLICT (department_id, key) DO NOTHING;

-- Replaces only the first match, like the JS replace without the g flag. Hits ids 14 and 24.
UPDATE departments
SET name = regexp_replace(name, 'microbiology', 'Microbiology', 'i')
WHERE name ~* 'microbiology' AND name !~ 'Microbiology';
