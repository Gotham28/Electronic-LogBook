-- Run 0027_procedure_log_fields.sql and 0028_surgery_dynamic_procedure_fields.sql before deploying the new application code.
-- This script creates/configures department metadata only. It creates no users,
-- patient records, procedure lists or training targets.
-- SURG is the default code for a new Surgery department. If a real department
-- named Surgery already exists, its current code and ID are retained.
BEGIN;

DO $$
DECLARE
  surgery_id integer;
  matches integer;
BEGIN
  SELECT count(*), min(id) INTO matches, surgery_id
  FROM public.departments
  WHERE lower(btrim(name)) = 'surgery'
    AND is_test = false AND config_source_department_id IS NULL;

  IF matches > 1 THEN
    RAISE EXCEPTION 'Multiple Surgery departments exist. Resolve the duplicate before running setup.';
  END IF;

  IF surgery_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.departments WHERE upper(code) = 'SURG') THEN
      RAISE EXCEPTION 'SURG already belongs to another department. Choose the department code before continuing.';
    END IF;
    INSERT INTO public.departments (name, code, is_test)
      VALUES ('Surgery', 'SURG', false) RETURNING id INTO surgery_id;
  END IF;

  INSERT INTO public.department_configs (department_id, enabled_features)
    VALUES (surgery_id, '{"procedureExperience":true,"procedureClinicalDetails":true,"dynamicProcedureFields":true,"freeTextProcedures":false,"hideProcedureAge":false,"hideProcedureLogs":false}'::jsonb)
  ON CONFLICT (department_id) DO UPDATE SET enabled_features =
    COALESCE(public.department_configs.enabled_features, '{}'::jsonb) || EXCLUDED.enabled_features;

  INSERT INTO public.department_catalog (department_id, kind, name, value, required, period)
    SELECT surgery_id, 'competency_level', role_code, role_code, 0, 'total'
    FROM unnest(ARRAY['O', 'A', 'PS', 'PI']) AS role_codes(role_code)
  ON CONFLICT (department_id, kind, value) DO NOTHING;
END $$;

SELECT d.id, d.name, d.code, c.enabled_features
FROM public.departments d
JOIN public.department_configs c ON c.department_id = d.id
WHERE lower(btrim(d.name)) = 'surgery' AND d.is_test = false
  AND d.config_source_department_id IS NULL;

COMMIT;
