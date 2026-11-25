-- DRAFT. Drafted only; never run by an agent (AGENTS.md §6). The developer reviews and applies it
-- with src/migrate.ts, AFTER 0034 (which renames "MicroBiology" to "Microbiology") and TOGETHER with
-- the code that stops reading department names. Code deployed without this backfill drops
-- Microbiology's behaviour: nothing in the code checks the department name any more.
--
-- 1. A typed, nullable column naming a department's academic logbook profile. The only valid value
--    today is 'physiology' (checked in application code). NULL means no profile.
-- 2. One-off backfill that writes down what code used to decide by department name or code, so every
--    existing department keeps exactly what it sees today. It names departments by id, taken from the
--    developer's read-only departments query (2026-11-24). Each statement also checks the name, so an
--    id that belongs to some other department in another database gets nothing. Idempotent.
--    Test copies (24, 31) get no rows of their own: they follow config_source_department_id to the
--    source department's configuration and catalog.
--    Microbiology is id 14. Physiology is id 30. No other department is touched.
-- 3. Two guards raise an error, rather than guess, when the data is not what the developer's queries
--    showed: a stored value that contradicts a value the client used to force, and catalog rows
--    for Microbiology that today's hardcoded lists were hiding.

ALTER TABLE department_configs ADD COLUMN academic_logbook_profile text;

-- Backfill: Microbiology, id 14 (test copy 24 inherits).

-- Guard 1: the client forced these keys on by name. A stored false would mean the server and client
-- disagree today, which is a decision for the developer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM department_configs c
    JOIN departments d ON d.id = c.department_id
    CROSS JOIN LATERAL jsonb_each(c.enabled_features) AS e(key, value)
    WHERE d.id = 14
      AND d.name ~* 'microbiology'
      AND e.key IN ('microbiologyCaseFields', 'hideHodQuarterlyAppraisal', 'freeTextProcedures', 'hideProcedureAge',
        'yearlyAttendance', 'conferenceDateRange', 'hideLeaveRecords', 'freeTextPostingUnit')
      AND e.value <> 'true'::jsonb
  ) THEN
    RAISE EXCEPTION '0035: department 14 stores a value that contradicts the Microbiology behaviour it had by name; resolve it before applying';
  END IF;
END
$$;

-- Guard 2: today a hardcoded list replaces the catalog for Microbiology, so catalog rows of these
-- kinds are hidden. Inserting ours would reveal the others.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM department_catalog k
    JOIN departments d ON d.id = k.department_id
    WHERE d.id = 14
      AND d.name ~* 'microbiology'
      AND ((k.kind = 'academic' AND k.value NOT IN ('journal_club', 'ug_teaching', 'seminars'))
        OR (k.kind = 'conference_level' AND k.value NOT IN ('national', 'state')))
  ) THEN
    RAISE EXCEPTION '0035: department 14 already has academic or conference_level catalog rows that its hardcoded lists were hiding; resolve it before applying';
  END IF;
END
$$;

-- A real configuration row (the made-up id-0 row in the catalog route is removed).
INSERT INTO department_configs (department_id)
SELECT d.id
FROM departments d
WHERE d.id IN (14)
  AND d.name ~* 'microbiology'
ON CONFLICT (department_id) DO NOTHING;

-- Left to right: every value the server or client defaulted to true when unset (a stored value wins),
-- then the stored object without the keys the client forced, then the forced values. Four new keys
-- are written true. procedureExperience is forced false: developer decision 2026-11-24.
UPDATE department_configs c
SET enabled_features =
  '{"microbiologyCaseFields": true, "freeTextProcedures": true, "hideProcedureAge": true,
    "useThesisAndMandatoryCertificationsLabel": true, "attendedConferences": true, "hideLeaveRecords": true,
    "dailyAttendance": true, "yearlyAttendance": true, "conferenceLevels": true, "freeTextPostingUnit": true,
    "conferenceDateRange": true, "hideHodQuarterlyAppraisal": true, "procedureDetailsField": true,
    "hideProcedureProgress": true, "freeTextPostingSupervisor": true, "extendedAssessmentTypes": true}'::jsonb
  || (c.enabled_features - ARRAY['microbiologyCaseFields', 'hideHodQuarterlyAppraisal', 'freeTextProcedures',
        'hideProcedureAge', 'yearlyAttendance', 'conferenceDateRange', 'hideLeaveRecords', 'freeTextPostingUnit',
        'procedureExperience'])
  || '{"microbiologyCaseFields": true, "hideHodQuarterlyAppraisal": true, "freeTextProcedures": true,
    "hideProcedureAge": true, "yearlyAttendance": true, "conferenceDateRange": true, "hideLeaveRecords": true,
    "freeTextPostingUnit": true, "procedureExperience": false}'::jsonb
FROM departments d
WHERE d.id = c.department_id
  AND d.id IN (14)
  AND d.name ~* 'microbiology';

-- The lists the catalog route used to hardcode for Microbiology. Same values, so existing logs match.
INSERT INTO department_catalog (department_id, kind, name, value, required, period)
SELECT d.id, v.kind, v.name, v.value, 0, 'total'
FROM departments d
CROSS JOIN (VALUES
  ('academic', 'Journal club', 'journal_club'),
  ('academic', 'UG teaching', 'ug_teaching'),
  ('academic', 'Seminars', 'seminars'),
  ('conference_level', 'National', 'national'),
  ('conference_level', 'State', 'state')
) AS v(kind, name, value)
WHERE d.id IN (14)
  AND d.name ~* 'microbiology'
ON CONFLICT (department_id, kind, value) DO NOTHING;

-- Backfill: Physiology, id 30 (test copy 31 inherits). Today's lookup matched the name "Physiology"
-- (ignoring case and surrounding spaces) or the code PSI; id 30 matches both.
INSERT INTO department_configs (department_id)
SELECT d.id
FROM departments d
WHERE d.id IN (30)
  AND d.name ~* '^\s*physiology\s*$'
ON CONFLICT (department_id) DO NOTHING;

UPDATE department_configs c
SET academic_logbook_profile = 'physiology'
FROM departments d
WHERE d.id = c.department_id
  AND d.id IN (30)
  AND d.name ~* '^\s*physiology\s*$'
  AND c.academic_logbook_profile IS NULL;
