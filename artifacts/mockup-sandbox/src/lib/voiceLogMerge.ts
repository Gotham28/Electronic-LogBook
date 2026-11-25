import type {
  VoiceLogCaseFields,
  VoiceLogProcedureFields,
} from "@workspace/api-zod";

export interface CaseFormState {
  date: string;
  patientUhid: string;
  age: string;
  gender: string;
  category: string;
  sampleProcessing: string;
  medicalSummary: string;
  chiefComplaints: string;
  history: string;
  examination: string;
  investigations: string;
  diagnosis: string;
  differentialDiagnosis: string;
  management: string;
  outcome: string;
  learningPoints: string;
  supervisorId: string;
  [key: string]: any;
}

export interface CaseMergeOptions {
  microbiologyCaseFields?: boolean;
  medicalSummaryCaseFields?: boolean;
  hideUhid?: boolean;
}

export interface ProcedureFormState {
  date: string;
  group: string;
  procedureName: string;
  patientUhid: string;
  diagnosis: string;
  sex: string;
  age: string;
  setting: string;
  experience: string;
  supervisorId: string;
  customFields: Record<string, string>;
  [key: string]: any;
}

export interface ProcedureMergeOptions {
  isFreeTextProcedures: boolean;
  dynamicProcedureFields: boolean;
  procedureGroups: Record<string, string[]>;
  hideUhid?: boolean;
}

export interface MergeResult<T> {
  nextForm: T;
  appliedFields: string[];
  skippedEditedFields: string[];
}

/**
 * Merges extracted voice fields into a Case Log form state.
 * Respects manuallyEdited fields (unless overwriteEdited is true) and department flags.
 * NEVER overwrites supervisorId.
 */
export function mergeCaseVoiceFields(
  currentForm: CaseFormState,
  extractedFields: VoiceLogCaseFields,
  manuallyEdited: Set<string>,
  overwriteEdited: boolean,
  options?: CaseMergeOptions
): MergeResult<CaseFormState> {
  const nextForm: CaseFormState = { ...currentForm };
  const appliedFields: string[] = [];
  const skippedEditedFields: string[] = [];

  const applyField = (key: string, val: string | null | undefined) => {
    if (val === null || val === undefined) return;
    const trimmed = typeof val === "string" ? val.trim() : String(val);
    if (!trimmed) return;

    if (manuallyEdited.has(key) && !overwriteEdited) {
      if (!skippedEditedFields.includes(key)) {
        skippedEditedFields.push(key);
      }
      return;
    }

    nextForm[key] = trimmed;
    if (!appliedFields.includes(key)) {
      appliedFields.push(key);
    }
  };

  // Base fields
  applyField("date", extractedFields.date);
  if (!options?.hideUhid) {
    applyField("patientUhid", extractedFields.patientUhid);
  }
  applyField("age", extractedFields.age);
  applyField("gender", extractedFields.gender);
  applyField("category", extractedFields.category);
  applyField("diagnosis", extractedFields.diagnosis);

  // Department-specific variants
  if (options?.microbiologyCaseFields) {
    applyField("sampleProcessing", extractedFields.sampleProcessing);
  } else if (options?.medicalSummaryCaseFields) {
    applyField("medicalSummary", extractedFields.medicalSummary);
  } else {
    // Standard clinical fields
    applyField("chiefComplaints", extractedFields.chiefComplaints);
    applyField("history", extractedFields.history);
    applyField("examination", extractedFields.examination);
    applyField("investigations", extractedFields.investigations);
    applyField("differentialDiagnosis", extractedFields.differentialDiagnosis);
    applyField("management", extractedFields.management);
    applyField("outcome", extractedFields.outcome);
    applyField("learningPoints", extractedFields.learningPoints);
  }

  // Supervisor must never be touched by voice extraction
  nextForm.supervisorId = currentForm.supervisorId;

  return { nextForm, appliedFields, skippedEditedFields };
}

/**
 * Merges extracted voice fields into a Procedure Log form state.
 * Atomically resolves group and procedureName, handles dynamic custom fields,
 * and preserves supervisorId.
 */
export function mergeProcedureVoiceFields(
  currentForm: ProcedureFormState,
  extractedFields: VoiceLogProcedureFields,
  manuallyEdited: Set<string>,
  overwriteEdited: boolean,
  options: ProcedureMergeOptions
): MergeResult<ProcedureFormState> {
  const nextForm: ProcedureFormState = {
    ...currentForm,
    customFields: { ...(currentForm.customFields || {}) },
  };
  const appliedFields: string[] = [];
  const skippedEditedFields: string[] = [];

  const applyField = (key: string, val: string | null | undefined) => {
    if (val === null || val === undefined) return;
    const trimmed = typeof val === "string" ? val.trim() : String(val);
    if (!trimmed) return;

    if (manuallyEdited.has(key) && !overwriteEdited) {
      if (!skippedEditedFields.includes(key)) {
        skippedEditedFields.push(key);
      }
      return;
    }

    nextForm[key] = trimmed;
    if (!appliedFields.includes(key)) {
      appliedFields.push(key);
    }
  };

  // 1. Group & ProcedureName atomic resolution
  const candidateProc = extractedFields.procedureName?.trim();
  const candidateGroup = extractedFields.group?.trim();

  if (candidateProc) {
    let resolvedGroup: string | null = null;
    let resolvedProc: string | null = null;

    if (options.isFreeTextProcedures) {
      resolvedProc = candidateProc;
      resolvedGroup = candidateGroup || currentForm.group || "";
    } else {
      // Check if matches within requested group
      if (candidateGroup && options.procedureGroups[candidateGroup]?.includes(candidateProc)) {
        resolvedGroup = candidateGroup;
        resolvedProc = candidateProc;
      } else {
        // Find if candidateProc exists in any configured group
        for (const [groupName, procList] of Object.entries(options.procedureGroups)) {
          const matched = procList.find((p) => p.toLowerCase() === candidateProc.toLowerCase());
          if (matched) {
            resolvedGroup = groupName;
            resolvedProc = matched;
            break;
          }
        }
      }
    }

    if (resolvedProc) {
      const procEdited = manuallyEdited.has("procedureName");
      const groupEdited = manuallyEdited.has("group");

      if ((procEdited || groupEdited) && !overwriteEdited) {
        if (procEdited && !skippedEditedFields.includes("procedureName")) {
          skippedEditedFields.push("procedureName");
        }
        if (groupEdited && !skippedEditedFields.includes("group")) {
          skippedEditedFields.push("group");
        }
      } else {
        nextForm.procedureName = resolvedProc;
        appliedFields.push("procedureName");
        if (resolvedGroup) {
          nextForm.group = resolvedGroup;
          appliedFields.push("group");
        }
      }
    }
  }

  // 2. Built-in fields
  applyField("date", extractedFields.date);
  if (!options.hideUhid) {
    applyField("patientUhid", extractedFields.patientUhid);
  }
  applyField("diagnosis", extractedFields.diagnosis);
  applyField("sex", extractedFields.sex);
  applyField("age", extractedFields.age);
  applyField("setting", extractedFields.setting);
  applyField("experience", extractedFields.experience);

  // 3. Dynamic procedure custom fields
  if (options.dynamicProcedureFields && extractedFields.customFields) {
    for (const [fieldId, val] of Object.entries(extractedFields.customFields)) {
      if (val && typeof val === "string" && val.trim()) {
        const editKey = "customFields." + fieldId;
        if (manuallyEdited.has(editKey) && !overwriteEdited) {
          if (!skippedEditedFields.includes(editKey)) {
            skippedEditedFields.push(editKey);
          }
        } else {
          nextForm.customFields![fieldId] = val.trim();
          if (!appliedFields.includes(editKey)) {
            appliedFields.push(editKey);
          }
        }
      }
    }
  }

  // Supervisor must never be touched by voice extraction
  nextForm.supervisorId = currentForm.supervisorId;

  return { nextForm, appliedFields, skippedEditedFields };
}
