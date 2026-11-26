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
  studentNavOrder: "mochi",
  freeTextPostingUnit: "hod_only",
  freeTextPostingSupervisor: "hod_only",
  postingAttachments: "hod_only",
  freeTextProcedures: "hod_only",
  dynamicProcedureFields: "hod_only",
  procedureClinicalDetails: "hod_only",
  procedureDetailsField: "hod_only",
  procedureExperience: "hod_only",
  hideProcedureAge: "hod_only",
  hideProcedureProgress: "hod_only",
  microbiologyCaseFields: "hod_only",
  medicalSummaryCaseFields: "hod_only",
  hideCaseLogs: "hod_only",
  hideProcedureLogs: "hod_only",
  clinicalWorks: "hod_only",
  psychiatryWorkspace: "hod_only",
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
  extendedAssessmentTypes: "hod_only",
  hideHodQuarterlyAppraisal: "hod_only",
} as const satisfies Record<string, DepartmentSettingTier>;

export type DepartmentSettingKey = keyof typeof DEPARTMENT_SETTING_TIERS;

const settingKeys = Object.keys(DEPARTMENT_SETTING_TIERS) as [DepartmentSettingKey, ...DepartmentSettingKey[]];
export const departmentSettingKeySchema = z.enum(settingKeys);

export type DepartmentSettingValueType = "boolean" | "path_list";
export type DepartmentSettingValue = boolean | string[];

export const studentNavOrderSchema = z
  .array(z.string().max(64).regex(/^\/[a-z0-9/-]*$/, "Menu paths must start with / and use lowercase letters, digits, - or /"))
  .max(30, "At most 30 menu paths are allowed")
  .refine((items) => new Set(items).size === items.length, { message: "Menu paths must be unique" });

export const DEPARTMENT_SETTING_VALUE_TYPES: Record<DepartmentSettingKey, DepartmentSettingValueType> =
  Object.fromEntries(settingKeys.map((key) => [key, key === "studentNavOrder" ? "path_list" : "boolean"])) as Record<DepartmentSettingKey, DepartmentSettingValueType>;
export const departmentSettingValueSchemas: Record<DepartmentSettingKey, z.ZodTypeAny> =
  Object.fromEntries(settingKeys.map((key) => [key, key === "studentNavOrder" ? studentNavOrderSchema : z.boolean()])) as Record<DepartmentSettingKey, z.ZodTypeAny>;

export function departmentSettingUpdateSchemaFor(key: DepartmentSettingKey) {
  const valueSchema = departmentSettingValueSchemas[key];
  return z.object({
    value: valueSchema,
    expectedValue: valueSchema.nullable(),
  }).strict();
}

// `expectedValue` is the stored value the caller previewed: null means "unset". The server returns
// 409 when the stored value differs.
export const departmentSettingUpdateSchema = z.object({
  value: z.boolean(),
  expectedValue: z.boolean().nullable(),
}).strict();
export type DepartmentSettingUpdate = z.infer<typeof departmentSettingUpdateSchema>;
