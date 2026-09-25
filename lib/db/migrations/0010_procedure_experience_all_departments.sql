-- Migration 0010: Enable procedureExperience for every real department
-- Idempotent: safe to re-run. Real departments only (is_test = false).
-- The runner wraps this file in its own transaction; no BEGIN/COMMIT here.

-- 1. Set the column default so future rows get procedureExperience: true.
ALTER TABLE department_configs ALTER COLUMN enabled_features SET DEFAULT '{"procedureExperience": true}'::jsonb;

-- 2. Insert a config row for every real department that has none yet.
INSERT INTO department_configs (department_id)
SELECT d.id
FROM departments d
WHERE d.is_test = false
  AND NOT EXISTS (
    SELECT 1 FROM department_configs dc WHERE dc.department_id = d.id
  );

-- 3. Merge procedureExperience: true into every real department's config row.
--    Never replaces the whole JSON. An existing explicit false is overwritten
--    (developer decision: every department gets the flag on).
UPDATE department_configs
SET enabled_features = enabled_features || '{"procedureExperience": true}'::jsonb
FROM departments d
WHERE department_configs.department_id = d.id
  AND d.is_test = false;

-- 4. Insert the four default competency levels for every real department
--    that currently has zero competency_level catalog rows.
--    Done in a single statement so the NOT EXISTS guard is evaluated once.
--    Verbatim from department-provisioning.ts:37-40.
INSERT INTO department_catalog (department_id, kind, name, value, required, period)
SELECT d.id, 'competency_level', v.name, v.value, 0, 'total'
FROM departments d
CROSS JOIN (
  VALUES 
    ('Observed / procedure seen', 'observed'),
    ('Assisted', 'assisted'),
    ('Performed under supervision', 'performed_under_supervision'),
    ('Performed independently', 'performed_independently')
) AS v(name, value)
WHERE d.is_test = false
  AND NOT EXISTS (
    SELECT 1 FROM department_catalog dc
    WHERE dc.department_id = d.id AND dc.kind = 'competency_level'
  );
