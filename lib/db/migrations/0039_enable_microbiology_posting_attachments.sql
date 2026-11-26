DO $$
DECLARE
  microbiology_department_id integer;
  microbiology_department_count integer;
BEGIN
  SELECT count(*)::integer, min(d.id)
  INTO microbiology_department_count, microbiology_department_id
  FROM departments d
  WHERE d.name ~* '^[[:space:]]*microbiology[[:space:]]*$'
    AND d.is_test = false
    AND d.config_source_department_id IS NULL;

  IF microbiology_department_count <> 1 THEN
    RAISE EXCEPTION '0039: expected exactly one source Microbiology department; found %', microbiology_department_count;
  END IF;

  INSERT INTO department_configs (department_id, enabled_features)
  VALUES (microbiology_department_id, '{"postingAttachments": true}'::jsonb)
  ON CONFLICT (department_id) DO UPDATE
  SET enabled_features = COALESCE(department_configs.enabled_features, '{}'::jsonb)
    || '{"postingAttachments": true}'::jsonb;
END
$$;
