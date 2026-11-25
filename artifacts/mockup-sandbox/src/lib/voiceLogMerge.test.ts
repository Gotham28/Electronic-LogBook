import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeCaseVoiceFields,
  mergeProcedureVoiceFields,
  type CaseFormState,
  type ProcedureFormState,
} from "./voiceLogMerge.js";
import type {
  VoiceLogCaseFields,
  VoiceLogProcedureFields,
} from "@workspace/api-zod";

function getEmptyCaseForm(): CaseFormState {
  return {
    date: "2026-11-20",
    patientUhid: "",
    age: "",
    gender: "Male",
    category: "",
    sampleProcessing: "",
    medicalSummary: "",
    chiefComplaints: "",
    history: "",
    examination: "",
    investigations: "",
    diagnosis: "",
    differentialDiagnosis: "",
    management: "",
    outcome: "",
    learningPoints: "",
    supervisorId: "supervisor-42",
  };
}

function getEmptyProcedureForm(): ProcedureFormState {
  return {
    date: "2026-11-20",
    group: "General",
    procedureName: "",
    patientUhid: "",
    diagnosis: "",
    sex: "",
    age: "",
    setting: "",
    experience: "",
    supervisorId: "supervisor-42",
    customFields: {},
  };
}

test("1. Case Log standard merge: updates untouched default gender, preserves manuallyEdited until overwrite, isolates supervisorId", () => {
  const current = getEmptyCaseForm();
  const extracted: VoiceLogCaseFields = {
    date: "2026-11-24",
    patientUhid: "UHID-1001",
    age: "5 years",
    gender: "Female",
    category: "OPD",
    sampleProcessing: null,
    medicalSummary: null,
    chiefComplaints: "High fever for 3 days",
    history: "Associated with vomiting",
    examination: "Febrile, throat congested",
    investigations: "CBC shows leukocytosis",
    diagnosis: "Acute Pharyngitis",
    differentialDiagnosis: "Viral infection",
    management: "Amoxicillin and Paracetamol",
    outcome: "Improved",
    learningPoints: "Early diagnosis prevents complications",
  };

  // Case 1a: No manually edited fields -> all non-null extracted fields applied
  const res1 = mergeCaseVoiceFields(current, extracted, new Set(), false);
  assert.equal(res1.nextForm.date, "2026-11-24");
  assert.equal(res1.nextForm.gender, "Female", "Should update default Male to Female");
  assert.equal(res1.nextForm.diagnosis, "Acute Pharyngitis");
  assert.equal(res1.nextForm.patientUhid, "UHID-1001");
  assert.equal(res1.nextForm.supervisorId, "supervisor-42", "Supervisor ID must NEVER be touched");
  assert.deepEqual(res1.skippedEditedFields, []);
  assert.ok(res1.appliedFields.includes("gender"));
  assert.ok(res1.appliedFields.includes("date"));
  assert.ok(res1.appliedFields.includes("diagnosis"));

  // Case 1b: Field 'diagnosis' was manually edited -> skipped when overwriteEdited is false
  const manualEdits = new Set(["diagnosis"]);
  const res2 = mergeCaseVoiceFields(
    { ...current, diagnosis: "Custom Manually Entered Diagnosis" },
    extracted,
    manualEdits,
    false
  );
  assert.equal(res2.nextForm.diagnosis, "Custom Manually Entered Diagnosis", "Manual edit must be preserved");
  assert.equal(res2.nextForm.gender, "Female");
  assert.deepEqual(res2.skippedEditedFields, ["diagnosis"]);
  assert.ok(!res2.appliedFields.includes("diagnosis"));

  // Case 1c: Overwrite edited fields -> overrides manual edits
  const res3 = mergeCaseVoiceFields(
    { ...current, diagnosis: "Custom Manually Entered Diagnosis" },
    extracted,
    manualEdits,
    true
  );
  assert.equal(res3.nextForm.diagnosis, "Acute Pharyngitis", "Manual edit overwritten when overwriteEdited is true");
  assert.deepEqual(res3.skippedEditedFields, []);
  assert.ok(res3.appliedFields.includes("diagnosis"));
  assert.equal(res3.nextForm.supervisorId, "supervisor-42", "Supervisor ID remains protected");
});

test("2. Case Log microbiologyCaseFields and medicalSummaryCaseFields modes", () => {
  const current = getEmptyCaseForm();
  const extracted: VoiceLogCaseFields = {
    date: "2026-11-24",
    patientUhid: "UHID-2002",
    age: "30 years",
    gender: "Male",
    category: "Urine",
    sampleProcessing: "Gram negative bacilli seen, colony count > 10^5 CFU/mL",
    medicalSummary: "Patient admitted with acute abdomen and fever",
    chiefComplaints: "Standard complaints",
    history: "Standard history",
    examination: "Standard exam",
    investigations: "Standard investigations",
    diagnosis: "Urinary Tract Infection",
    differentialDiagnosis: "Pyelonephritis",
    management: "Ciprofloxacin",
    outcome: "Recovered",
    learningPoints: "Microbiology culture correlation",
  };

  // Case 2a: Microbiology mode -> applies sampleProcessing, ignores standard clinical fields
  const resMicro = mergeCaseVoiceFields(current, extracted, new Set(), false, {
    microbiologyCaseFields: true,
  });
  assert.equal(resMicro.nextForm.sampleProcessing, "Gram negative bacilli seen, colony count > 10^5 CFU/mL");
  assert.equal(resMicro.nextForm.chiefComplaints, "", "Standard clinical fields should not be populated in microbiology mode");
  assert.equal(resMicro.nextForm.history, "");
  assert.equal(resMicro.nextForm.examination, "");

  // Case 2b: Medical summary mode -> applies medicalSummary, ignores standard clinical fields
  const resMed = mergeCaseVoiceFields(current, extracted, new Set(), false, {
    medicalSummaryCaseFields: true,
  });
  assert.equal(resMed.nextForm.medicalSummary, "Patient admitted with acute abdomen and fever");
  assert.equal(resMed.nextForm.chiefComplaints, "", "Standard clinical fields should not be populated in medicalSummary mode");
  assert.equal(resMed.nextForm.sampleProcessing, "");

  // Case 2c: hideUhid option -> hides patientUhid
  const resHideUhid = mergeCaseVoiceFields(current, extracted, new Set(), false, {
    hideUhid: true,
  });
  assert.equal(resHideUhid.nextForm.patientUhid, "", "patientUhid should not be applied when hideUhid is true");
  assert.ok(!resHideUhid.appliedFields.includes("patientUhid"));
});

test("3. Procedure Log catalog mode (!isFreeTextProcedures): atomic group and procedureName resolution", () => {
  const current = getEmptyProcedureForm();
  const procedureGroups = {
    "Minor OT": ["Incision and Drainage", "Suturing", "Biopsy"],
    "NICU": ["Endotracheal Intubation", "Lumbar Puncture", "Umbilical Catheterization"],
  };

  // Case 3a: Valid procedure in matching group
  const extractedValid: VoiceLogProcedureFields = {
    date: "2026-11-24",
    group: "NICU",
    procedureName: "Lumbar Puncture",
    patientUhid: "UHID-3003",
    diagnosis: "Suspected Sepsis",
    sex: "Male",
    age: "10 days",
    setting: "NICU",
    experience: "Observed",
    customFields: {},
  };
  const res1 = mergeProcedureVoiceFields(current, extractedValid, new Set(), false, {
    isFreeTextProcedures: false,
    dynamicProcedureFields: false,
    procedureGroups,
  });
  assert.equal(res1.nextForm.group, "NICU");
  assert.equal(res1.nextForm.procedureName, "Lumbar Puncture");
  assert.ok(res1.appliedFields.includes("group"));
  assert.ok(res1.appliedFields.includes("procedureName"));

  // Case 3b: Procedure found in another configured group -> resolves group automatically
  const extractedWrongGroup: VoiceLogProcedureFields = {
    ...extractedValid,
    group: "Minor OT", // Incorrect group in speech
    procedureName: "Lumbar Puncture", // Actually in NICU
  };
  const res2 = mergeProcedureVoiceFields(current, extractedWrongGroup, new Set(), false, {
    isFreeTextProcedures: false,
    dynamicProcedureFields: false,
    procedureGroups,
  });
  assert.equal(res2.nextForm.group, "NICU", "Should resolve to the group containing the procedure");
  assert.equal(res2.nextForm.procedureName, "Lumbar Puncture");

  // Case 3c: Procedure does not exist in any catalog group -> rejected (not applied)
  const extractedUnknownProc: VoiceLogProcedureFields = {
    ...extractedValid,
    procedureName: "Heart Transplant",
  };
  const res3 = mergeProcedureVoiceFields(current, extractedUnknownProc, new Set(), false, {
    isFreeTextProcedures: false,
    dynamicProcedureFields: false,
    procedureGroups,
  });
  assert.equal(res3.nextForm.procedureName, "", "Unknown catalog procedure should not be applied");
  assert.ok(!res3.appliedFields.includes("procedureName"));
});

test("4. Procedure Log dynamicProcedureFields mode: customFields merge, manual-edit protection, and overwrite", () => {
  const current: ProcedureFormState = {
    ...getEmptyProcedureForm(),
    customFields: {
      complications: "None",
      duration: "15 mins",
    },
  };

  const extracted: VoiceLogProcedureFields = {
    date: "2026-11-24",
    group: "General",
    procedureName: "Suturing",
    patientUhid: "UHID-4004",
    diagnosis: "Laceration",
    sex: "Female",
    age: "25 years",
    setting: "Casualty",
    experience: "Performed Independently",
    customFields: {
      complications: "Minor bleeding controlled",
      duration: "30 mins",
      anesthesia: "Local Lidocaine",
    },
  };

  // Case 4a: Field 'customFields.complications' was manually edited -> protected
  const manualEdits = new Set(["customFields.complications"]);
  const res1 = mergeProcedureVoiceFields(current, extracted, manualEdits, false, {
    isFreeTextProcedures: true,
    dynamicProcedureFields: true,
    procedureGroups: {},
  });
  assert.equal(res1.nextForm.customFields.complications, "None", "Manually edited customField must be preserved");
  assert.equal(res1.nextForm.customFields.duration, "30 mins", "Untouched customField should be updated");
  assert.equal(res1.nextForm.customFields.anesthesia, "Local Lidocaine", "New customField should be added");
  assert.deepEqual(res1.skippedEditedFields, ["customFields.complications"]);

  // Case 4b: Overwrite edited fields -> overrides protected customFields
  const res2 = mergeProcedureVoiceFields(current, extracted, manualEdits, true, {
    isFreeTextProcedures: true,
    dynamicProcedureFields: true,
    procedureGroups: {},
  });
  assert.equal(res2.nextForm.customFields.complications, "Minor bleeding controlled", "Overwritten when overwriteEdited is true");
  assert.deepEqual(res2.skippedEditedFields, []);
  assert.equal(res2.nextForm.supervisorId, "supervisor-42", "Supervisor ID remains protected");
});

