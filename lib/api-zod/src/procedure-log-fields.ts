import { z } from "zod";

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

export const PROCEDURE_FIELD_TYPES = ["text", "textarea", "select", "radio"] as const;
export type ProcedureFieldType = typeof PROCEDURE_FIELD_TYPES[number];

export const procedureFieldIdSchema = z.string().trim().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Invalid field ID");
export const procedureFieldLabelSchema = z.string().trim().min(1, "Field title is required").max(160);
export const procedureFieldOptionSchema = z.string().trim().min(1).max(120);

export const procedureFieldDefinitionSchema = z.object({
  id: procedureFieldIdSchema,
  label: procedureFieldLabelSchema,
  type: z.enum(PROCEDURE_FIELD_TYPES).default("text"),
  isRequired: z.boolean(),
  isCustom: z.boolean().optional(),
  options: z.array(procedureFieldOptionSchema).max(50).optional(),
}).strict().superRefine((field, ctx) => {
  if (field.type === "select" || field.type === "radio") {
    const deduped = [...new Set((field.options ?? []).map((opt) => opt.trim()).filter(Boolean))];
    if (deduped.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `${field.label || "Field"} must include at least one choice`,
      });
    }
  }
});

export type ProcedureFieldDefinition = z.infer<typeof procedureFieldDefinitionSchema>;

export const procedureFieldDefinitionsSchema = z.array(procedureFieldDefinitionSchema)
  .max(40)
  .superRefine((fields, ctx) => {
    const seenIds = new Set<string>();
    const seenLabels = new Set<string>();
    fields.forEach((field, index) => {
      if (seenIds.has(field.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: "Duplicate field ID" });
      }
      seenIds.add(field.id);
      const labelKey = field.label.trim().toLowerCase();
      if (seenLabels.has(labelKey)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "label"], message: `Duplicate field name "${field.label}"` });
      }
      seenLabels.add(labelKey);
    });
  });

export function isBuiltInProcedureField(id: string): id is ProcedureLogField {
  return (PROCEDURE_LOG_FIELDS as readonly string[]).includes(id);
}

export function getDefaultProcedureFieldDefinitions(): ProcedureFieldDefinition[] {
  return [
    { id: "patientAge", label: PROCEDURE_LOG_FIELD_LABELS.patientAge, type: "text", isRequired: true, isCustom: false },
    { id: "sex", label: PROCEDURE_LOG_FIELD_LABELS.sex, type: "select", isRequired: true, isCustom: false, options: [...PROCEDURE_SEX_OPTIONS] },
    { id: "patientUhid", label: PROCEDURE_LOG_FIELD_LABELS.patientUhid, type: "text", isRequired: true, isCustom: false },
    { id: "diagnosis", label: PROCEDURE_LOG_FIELD_LABELS.diagnosis, type: "textarea", isRequired: true, isCustom: false },
    { id: "setting", label: PROCEDURE_LOG_FIELD_LABELS.setting, type: "select", isRequired: true, isCustom: false, options: [...PROCEDURE_SETTINGS] },
    { id: "competencyLevel", label: PROCEDURE_LOG_FIELD_LABELS.competencyLevel, type: "select", isRequired: true, isCustom: false, options: [...PROCEDURE_ROLE_CODES] },
  ];
}

export function normalizeProcedureFieldDefinitions(fields: readonly ProcedureFieldDefinition[]): ProcedureFieldDefinition[] {
  return fields.map((field) => {
    const id = field.id.trim();
    const label = field.label.trim();
    const type = field.type ?? "text";
    const builtIn = isBuiltInProcedureField(id);
    const cleanedOptions = type === "select" || type === "radio"
      ? [...new Set((field.options ?? []).map((opt) => opt.trim()).filter(Boolean))]
      : undefined;
    return {
      id,
      label,
      type,
      isRequired: Boolean(field.isRequired),
      isCustom: !builtIn,
      ...(cleanedOptions ? { options: cleanedOptions } : {}),
    };
  });
}

export function resolveProcedureFieldDefinitions(rawFields: unknown, dynamicEnabled?: boolean): ProcedureFieldDefinition[] {
  if (!dynamicEnabled) return [];
  if (rawFields === null || rawFields === undefined) return getDefaultProcedureFieldDefinitions();
  const parsed = procedureFieldDefinitionsSchema.safeParse(rawFields);
  if (!parsed.success) return getDefaultProcedureFieldDefinitions();
  return normalizeProcedureFieldDefinitions(parsed.data);
}

export function normalizeCustomProcedureFieldValues(
  rawValues: unknown,
  allowedFieldIds?: ReadonlySet<string>,
): Record<string, string> {
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawValues as Record<string, unknown>)) {
    if (allowedFieldIds && !allowedFieldIds.has(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    result[key] = trimmed;
  }
  return result;
}

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

export function validateDynamicProcedureLogFields(params: {
  requiredFields: readonly string[];
  fields: readonly ProcedureFieldDefinition[];
  entry: Record<string, unknown>;
  previousEntry?: Record<string, unknown>;
}): string | null {
  const { requiredFields, fields, entry, previousEntry } = params;
  const activeFieldMap = new Map(fields.map((field) => [field.id, field]));
  const rawCustom = (entry.customFields && typeof entry.customFields === "object" && !Array.isArray(entry.customFields))
    ? (entry.customFields as Record<string, unknown>)
    : {};
  const prevCustom = (previousEntry?.customFields && typeof previousEntry.customFields === "object" && !Array.isArray(previousEntry.customFields))
    ? (previousEntry.customFields as Record<string, unknown>)
    : {};

  for (const key of Object.keys(rawCustom)) {
    const target = activeFieldMap.get(key);
    const inPrev = key in prevCustom;
    if ((!target || isBuiltInProcedureField(key)) && !inPrev) {
      return "Unknown procedure field in submission";
    }
  }

  for (const field of fields) {
    const isRequired = requiredFields.includes(field.id);
    const rawVal = isBuiltInProcedureField(field.id) ? entry[field.id] : rawCustom[field.id];
    const strVal = typeof rawVal === "string" ? rawVal.trim() : "";
    const hasValue = strVal.length > 0 && strVal.toUpperCase() !== "N/A";

    if (isRequired && !hasValue) {
      return `${field.label} is required for this procedure`;
    }

    if (!hasValue) continue;

    if (field.type === "textarea") {
      if (strVal.length > 8000) return `${field.label} must be 8000 characters or fewer`;
    } else if (isBuiltInProcedureField(field.id)) {
      if (strVal.length > 160) return `${field.label} must be 160 characters or fewer`;
    } else if (strVal.length > 500) {
      return `${field.label} must be 500 characters or fewer`;
    }

    if (field.type === "select" || field.type === "radio") {
      const options = field.options ?? [];
      if (!options.includes(strVal)) {
        const prevVal = isBuiltInProcedureField(field.id)
          ? String(previousEntry?.[field.id] ?? "").trim()
          : String(prevCustom[field.id] ?? "").trim();
        if (!(previousEntry && prevVal === strVal)) {
          return `Select a valid ${field.label.toLowerCase()} for this procedure`;
        }
      }
    }
  }

  return null;
}
