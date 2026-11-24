import { z } from "zod";

// Closed registry of the wording a department may override. A department with no override for a
// key uses the default. Defaults are the generic strings the application has always shown; they
// are never specific to one department (AGENTS.md §5).
export const DEPARTMENT_LABEL_MAX_LENGTH = 80;

export const DEPARTMENT_LABEL_GROUPS = ["Postings", "Navigation", "Logbook"] as const;
export type DepartmentLabelGroup = typeof DEPARTMENT_LABEL_GROUPS[number];

export type DepartmentLabelDefinition = {
  default: string;
  description: string;
  group: DepartmentLabelGroup;
  maxLength: number;
};

const entry = (group: DepartmentLabelGroup, defaultValue: string, description: string): DepartmentLabelDefinition =>
  ({ default: defaultValue, description, group, maxLength: DEPARTMENT_LABEL_MAX_LENGTH });

export const DEPARTMENT_LABELS = {
  "postings.unitTitle": entry("Postings", "Ward / Posting Unit", "Heading and field name for a posting unit on the Postings page"),
  "postings.unitPhrase": entry("Postings", "ward posting or rotation", "Lower-case phrase used inside sentences on the Postings page"),
  "postings.printColumn": entry("Postings", "Ward / Unit", "Column heading for postings in the printable logbook"),
  "postings.settingsSection": entry("Postings", "Wards / postings", "Section name on the Department settings screen"),
  "postings.settingsNoun": entry("Postings", "Wards", "Noun used in the Department settings description of that section"),
  "nav.postings": entry("Navigation", "Postings & Rotations", "Sidebar entry for the postings page (the page's own heading is set by the posting wording above)"),
  // The next two defaults depend on a department feature flag; see defaultDepartmentLabel.
  "milestones.pageTitle": entry("Navigation", "Thesis & certifications", "Title of the thesis and certifications page"),
  "nav.milestones": entry("Navigation", "Thesis & Certifications", "Sidebar entry for the thesis and certifications page"),
  "caseLog.caseId": entry("Logbook", "Case ID", "Name of the case identifier in case logs and the printable logbook"),
} as const satisfies Record<string, DepartmentLabelDefinition>;

export type DepartmentLabelKey = keyof typeof DEPARTMENT_LABELS;
export const DEPARTMENT_LABEL_KEYS = Object.keys(DEPARTMENT_LABELS) as DepartmentLabelKey[];

export function isDepartmentLabelKey(key: string): key is DepartmentLabelKey {
  return Object.prototype.hasOwnProperty.call(DEPARTMENT_LABELS, key);
}

// The two milestone defaults are chosen by the existing wording flag, exactly as before.
const MANDATORY_CERTIFICATIONS_DEFAULTS: Partial<Record<DepartmentLabelKey, string>> = {
  "milestones.pageTitle": "Thesis and mandatory certifications",
  "nav.milestones": "Thesis and mandatory certifications",
};

export type DepartmentLabelContext = { useThesisAndMandatoryCertificationsLabel?: boolean };

export function defaultDepartmentLabel(key: DepartmentLabelKey, context: DepartmentLabelContext = {}): string {
  if (context.useThesisAndMandatoryCertificationsLabel) {
    const flagged = MANDATORY_CERTIFICATIONS_DEFAULTS[key];
    if (flagged) return flagged;
  }
  return DEPARTMENT_LABELS[key].default;
}

// The rule: an override if one exists, otherwise the default. `overrides` holds overrides only.
export function resolveDepartmentLabel(
  key: DepartmentLabelKey,
  overrides: Record<string, string> | null | undefined,
  context: DepartmentLabelContext = {},
): string {
  const override = overrides && Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : undefined;
  return typeof override === "string" ? override : defaultDepartmentLabel(key, context);
}

// Unicode line and paragraph separators (\p{Zl}, \p{Zp}) are rejected along with CR and LF.
export const departmentLabelValueSchema = z.string()
  .transform((value) => value.trim())
  .pipe(z.string()
    .min(1, "Wording cannot be empty")
    .max(DEPARTMENT_LABEL_MAX_LENGTH, `Wording must be at most ${DEPARTMENT_LABEL_MAX_LENGTH} characters`)
    .refine((value) => !/[\r\n\p{Zl}\p{Zp}]/u.test(value), "Wording must be a single line"));

const revisionSchema = z.number().int().min(0).max(2_147_483_647);
export const departmentLabelPatchSchema = z.object({ value: departmentLabelValueSchema, revision: revisionSchema.optional() }).strict();
export const departmentLabelDeleteSchema = z.object({ revision: revisionSchema.optional() }).strict();
export type DepartmentLabelPatch = z.infer<typeof departmentLabelPatchSchema>;
