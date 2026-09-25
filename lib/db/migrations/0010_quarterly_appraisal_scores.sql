ALTER TABLE public.appraisals
  ADD COLUMN IF NOT EXISTS appraisal_date date,
  ADD COLUMN IF NOT EXISTS journal_recent_advances_learning_score integer,
  ADD COLUMN IF NOT EXISTS patient_lab_skill_learning_score integer,
  ADD COLUMN IF NOT EXISTS self_directed_learning_teaching_score integer,
  ADD COLUMN IF NOT EXISTS departmental_interdepartmental_learning_score integer,
  ADD COLUMN IF NOT EXISTS external_outreach_cme_score integer,
  ADD COLUMN IF NOT EXISTS thesis_research_score integer,
  ADD COLUMN IF NOT EXISTS logbook_maintenance_score integer,
  ADD COLUMN IF NOT EXISTS patient_care_score integer,
  ADD COLUMN IF NOT EXISTS communication_skill_score integer,
  ADD COLUMN IF NOT EXISTS professionalism_score integer,
  ADD COLUMN IF NOT EXISTS publications boolean,
  ADD COLUMN IF NOT EXISTS remediation_suggestions text,
  ALTER COLUMN scholastic_grade DROP NOT NULL,
  ALTER COLUMN patient_care_grade DROP NOT NULL,
  ALTER COLUMN professional_attributes_grade DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.appraisals'::regclass AND conname = 'appraisals_score_range_check') THEN
    ALTER TABLE public.appraisals ADD CONSTRAINT appraisals_score_range_check CHECK (
      (journal_recent_advances_learning_score IS NULL OR journal_recent_advances_learning_score BETWEEN 1 AND 9)
      AND (patient_lab_skill_learning_score IS NULL OR patient_lab_skill_learning_score BETWEEN 1 AND 9)
      AND (self_directed_learning_teaching_score IS NULL OR self_directed_learning_teaching_score BETWEEN 1 AND 9)
      AND (departmental_interdepartmental_learning_score IS NULL OR departmental_interdepartmental_learning_score BETWEEN 1 AND 9)
      AND (external_outreach_cme_score IS NULL OR external_outreach_cme_score BETWEEN 1 AND 9)
      AND (thesis_research_score IS NULL OR thesis_research_score BETWEEN 1 AND 9)
      AND (logbook_maintenance_score IS NULL OR logbook_maintenance_score BETWEEN 1 AND 9)
      AND (patient_care_score IS NULL OR patient_care_score BETWEEN 1 AND 9)
      AND (communication_skill_score IS NULL OR communication_skill_score BETWEEN 1 AND 9)
      AND (professionalism_score IS NULL OR professionalism_score BETWEEN 1 AND 9)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.appraisals'::regclass AND conname = 'appraisals_scores_all_or_none_check') THEN
    ALTER TABLE public.appraisals ADD CONSTRAINT appraisals_scores_all_or_none_check CHECK (
      num_nonnulls(
        journal_recent_advances_learning_score, patient_lab_skill_learning_score,
        self_directed_learning_teaching_score, departmental_interdepartmental_learning_score,
        external_outreach_cme_score, thesis_research_score, logbook_maintenance_score,
        patient_care_score, communication_skill_score, professionalism_score
      ) IN (0, 10)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.appraisals'::regclass AND conname = 'appraisals_low_score_remediation_check') THEN
    ALTER TABLE public.appraisals ADD CONSTRAINT appraisals_low_score_remediation_check CHECK (
      num_nonnulls(
        journal_recent_advances_learning_score, patient_lab_skill_learning_score,
        self_directed_learning_teaching_score, departmental_interdepartmental_learning_score,
        external_outreach_cme_score, thesis_research_score, logbook_maintenance_score,
        patient_care_score, communication_skill_score, professionalism_score
      ) = 0
      OR (
        journal_recent_advances_learning_score >= 4 AND patient_lab_skill_learning_score >= 4
        AND self_directed_learning_teaching_score >= 4 AND departmental_interdepartmental_learning_score >= 4
        AND external_outreach_cme_score >= 4 AND thesis_research_score >= 4
        AND logbook_maintenance_score >= 4 AND patient_care_score >= 4
        AND communication_skill_score >= 4 AND professionalism_score >= 4
      )
      OR NULLIF(BTRIM(remediation_suggestions), '') IS NOT NULL
    );
  END IF;
END $$;
