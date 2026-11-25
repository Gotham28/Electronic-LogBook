import { z } from "zod";

const label = z.string().trim().min(1, "Field label is required").max(160);
const choiceLabel = z.string().trim().min(1, "Choice text is required").max(160);
const fieldKey = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/, "Field key must start with a letter and use letters, digits, _, . or -")
  .refine((value) => !["constructor", "prototype"].includes(value), "Choose another field identifier");
const choices = z
  .array(choiceLabel)
  .min(1, "Dropdown fields need choices")
  .max(50)
  .refine((values) => new Set(values).size === values.length, "Choices must be unique");

export const logCustomFieldDefinitionSchema = z
  .object({
    key: fieldKey,
    label,
    type: z.enum(["text", "textarea", "number", "date", "select"]),
    required: z.boolean().optional(),
    options: choices.optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    maxLength: z.number().int().min(1).max(4000).optional(),
    requiredWhen: z.object({ field: fieldKey, value: label }).strict().optional(),
  })
  .strict();

export type LogCustomFieldDefinition = z.infer<typeof logCustomFieldDefinitionSchema>;

export const logCustomFieldDefinitionsSchema = z
  .array(logCustomFieldDefinitionSchema)
  .max(40, "At most 40 custom fields are allowed")
  .superRefine((fields, ctx) => {
    const fail = (index: number, message: string) => ctx.addIssue({ code: "custom", path: [index], message });
    if (new Set(fields.map((field) => field.key)).size !== fields.length) {
      ctx.addIssue({ code: "custom", path: [], message: "Field identifiers must be unique" });
    }
    const lowerLabels = fields.map((field) => field.label.trim().toLowerCase());
    if (new Set(lowerLabels).size !== lowerLabels.length) {
      ctx.addIssue({ code: "custom", path: [], message: "Field labels must be unique" });
    }
    fields.forEach((field, index) => {
      if (field.type === "select" && !field.options?.length) fail(index, "Dropdown fields need choices");
      if (field.options && field.type !== "select") fail(index, "Only dropdown fields have choices");
      if ((field.min !== undefined || field.max !== undefined) && field.type !== "number") {
        fail(index, "Numeric limits require a number field");
      }
      if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
        fail(index, "Minimum must not exceed maximum");
      }
      if (field.requiredWhen) {
        const parent = fields.find((other) => other.key === field.requiredWhen!.field && other.key !== field.key);
        if (!parent || parent.requiredWhen) fail(index, "Conditional fields need an unconditional source field");
        else if (parent.type === "select" && !parent.options?.includes(field.requiredWhen.value)) {
          fail(index, "Condition must match a source dropdown choice");
        }
      }
    });
  });

export function logCustomFieldVisible(
  def: LogCustomFieldDefinition,
  values: Record<string, string | null | undefined>,
): boolean {
  if (!def.requiredWhen) return true;
  const source = values[def.requiredWhen.field];
  return typeof source === "string" && source.trim() === def.requiredWhen.value;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Validates custom field values against department definitions.
 * Returns messages referencing field labels only — NEVER submitted values (AGENTS.md §8).
 */
export function validateLogCustomFieldValues(
  defs: LogCustomFieldDefinition[],
  values: Record<string, string | null | undefined>,
  previous?: Record<string, string | null | undefined>,
): string | null {
  const defKeys = new Set(defs.map((def) => def.key));
  for (const key of Object.keys(values)) {
    const val = values[key];
    if (val === undefined || val === null || val.trim() === "") continue;
    if (!defKeys.has(key) && !(previous && Object.prototype.hasOwnProperty.call(previous, key))) {
      return "Unknown custom field";
    }
  }

  for (const def of defs) {
    const visible = logCustomFieldVisible(def, values);
    const raw = values[def.key];
    const trimmed = typeof raw === "string" ? raw.trim() : "";

    if (!visible) continue;

    if (def.required && !trimmed) {
      return `${def.label} is required`;
    }
    if (!trimmed) continue;

    const maxLen = def.maxLength ?? (def.type === "textarea" ? 4000 : 500);
    if (trimmed.length > maxLen) {
      return `${def.label} must be at most ${maxLen} characters`;
    }

    if (def.type === "number") {
      const num = Number(trimmed);
      if (!Number.isFinite(num)) return `${def.label} must be a valid number`;
      if (def.min !== undefined && num < def.min) return `${def.label} must be at least ${def.min}`;
      if (def.max !== undefined && num > def.max) return `${def.label} must be at most ${def.max}`;
    } else if (def.type === "date") {
      if (!isValidIsoDate(trimmed)) return `${def.label} must be a valid YYYY-MM-DD date`;
    } else if (def.type === "select") {
      const prevVal = typeof previous?.[def.key] === "string" ? previous[def.key]!.trim() : undefined;
      if (!(def.options ?? []).includes(trimmed) && trimmed !== prevVal) {
        return `Select a valid option for ${def.label}`;
      }
    }
  }

  return null;
}

export function normalizeLogCustomFieldValues(
  defs: LogCustomFieldDefinition[],
  values: Record<string, string | null | undefined>,
  previous?: Record<string, string | null | undefined>,
): Record<string, string> {
  const allDefKeys = new Set(defs.map((def) => def.key));
  const visibleActiveKeys = new Set(
    defs.filter((def) => logCustomFieldVisible(def, values)).map((def) => def.key),
  );
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const isOrphan = !allDefKeys.has(key) && Boolean(previous && Object.prototype.hasOwnProperty.call(previous, key));
    if (visibleActiveKeys.has(key) || isOrphan) {
      result[key] = trimmed;
    }
  }
  return result;
}
