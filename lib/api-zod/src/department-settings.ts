import { z } from "zod";

// Single-setting edits to department_configs.enabledFeatures (task 3a).
// "mochi" keys change wording or navigation order only. Everything that creates, edits, verifies,
// hides or reshapes a log or record type is "hod_only": only a HOD's own request may change it.
export type DepartmentSettingTier = "mochi" | "hod_only";

export const DEPARTMENT_SETTING_TIERS = {
  useThesisAndMandatoryCertificationsLabel: "mochi",
  useThesisAndPublicationsLabel: "mochi",
  useCaseTypeLabel: "mochi",
  academicsFirstInNav: "mochi",
  freeTextPostingUnit: "hod_only",
  freeTextProcedures: "hod_only",
  dynamicProcedureFields: "hod_only",
  procedureClinicalDetails: "hod_only",
  procedureExperience: "hod_only",
  hideProcedureAge: "hod_only",
  microbiologyCaseFields: "hod_only",
  medicalSummaryCaseFields: "hod_only",
  hideCaseLogs: "hod_only",
  hideProcedureLogs: "hod_only",
  clinicalWorks: "hod_only",
  dailyAttendance: "hod_only",
  yearlyAttendance: "hod_only",
  hideLeaveRecords: "hod_only",
  academicActivityExtras: "hod_only",
  splitThesisAndCertifications: "hod_only",
  publicationsOnly: "hod_only",
  attendedConferences: "hod_only",
  conferenceLevels: "hod_only",
  conferenceDateRange: "hod_only",
  hideConferenceLocation: "hod_only",
  awards: "hod_only",
  hideHodQuarterlyAppraisal: "hod_only",
} as const satisfies Record<string, DepartmentSettingTier>;

export type DepartmentSettingKey = keyof typeof DEPARTMENT_SETTING_TIERS;

const settingKeys = Object.keys(DEPARTMENT_SETTING_TIERS) as [DepartmentSettingKey, ...DepartmentSettingKey[]];
export const departmentSettingKeySchema = z.enum(settingKeys);

// Every allowlisted setting is a boolean today. A future non-boolean key adds its own entries here.
export const DEPARTMENT_SETTING_VALUE_TYPES: Record<DepartmentSettingKey, "boolean"> =
  Object.fromEntries(settingKeys.map((key) => [key, "boolean"])) as Record<DepartmentSettingKey, "boolean">;
export const departmentSettingValueSchemas: Record<DepartmentSettingKey, z.ZodTypeAny> =
  Object.fromEntries(settingKeys.map((key) => [key, z.boolean()])) as Record<DepartmentSettingKey, z.ZodTypeAny>;

// `expectedValue` is the stored value the caller previewed: null means "unset". The server returns
// 409 when the stored value differs.
export const departmentSettingUpdateSchema = z.object({
  value: z.boolean(),
  expectedValue: z.boolean().nullable(),
}).strict();
export type DepartmentSettingUpdate = z.infer<typeof departmentSettingUpdateSchema>;
