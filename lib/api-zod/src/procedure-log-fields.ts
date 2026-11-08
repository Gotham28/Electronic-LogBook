export const PROCEDURE_LOG_FIELDS = ["patientAge", "sex", "patientUhid", "diagnosis", "setting", "competencyLevel"] as const;
export type ProcedureLogField = typeof PROCEDURE_LOG_FIELDS[number];

export const PROCEDURE_LOG_FIELD_LABELS: Record<ProcedureLogField, string> = {
  patientAge: "Age",
  sex: "Sex",
  patientUhid: "De-identified patient ID (IP/OP number)",
  diagnosis: "Diagnosis or indication",
  setting: "Setting",
  competencyLevel: "Role level",
};
export const PROCEDURE_SETTINGS = ["Ward", "Casualty", "OT", "NICU"] as const;
export const PROCEDURE_SEX_OPTIONS = ["Male", "Female", "Other"] as const;
export const PROCEDURE_ROLE_CODES = ["O", "A", "PS", "PI"] as const;

export function validateProcedureLogFields(requiredFields: readonly string[], entry: Record<string, unknown>, allowedRoles?: readonly string[]): string | null {
  for (const field of PROCEDURE_LOG_FIELDS) {
    if (!requiredFields.includes(field)) continue;
    const value = entry[field];
    if (typeof value !== "string" || !value.trim() || value.trim().toUpperCase() === "N/A") {
      return `${PROCEDURE_LOG_FIELD_LABELS[field]} is required for this procedure`;
    }
  }
  if (requiredFields.includes("setting") && !PROCEDURE_SETTINGS.includes(entry.setting as typeof PROCEDURE_SETTINGS[number])) {
    return "Select a valid setting for this procedure";
  }
  if (requiredFields.includes("sex") && !PROCEDURE_SEX_OPTIONS.includes(entry.sex as typeof PROCEDURE_SEX_OPTIONS[number])) {
    return "Select a valid sex for this procedure";
  }
  if (allowedRoles && entry.competencyLevel && entry.competencyLevel !== "N/A" && !allowedRoles.includes(String(entry.competencyLevel))) {
    return "Select a valid role level for this procedure";
  }
  return null;
}
