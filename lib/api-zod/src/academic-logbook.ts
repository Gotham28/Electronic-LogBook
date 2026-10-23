/** Department logbook forms share the existing academic log/review lifecycle. */
export type AcademicLogbookField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  maximumField?: string;
  notBeforeLogDate?: boolean;
  requiredWhen?: { field: string; value: string };
  group?: string;
};

export type AcademicLogbookSection = {
  value: string;
  name?: string;
  archived?: boolean;
  years: number[];
  topicLabel: string;
  multilineTopic?: boolean;
  participation?: string[];
  fields: AcademicLogbookField[];
};

export type AcademicLogbookProfile = {
  id: string;
  title: string;
  departmentNames: string[];
  departmentCodes: string[];
  sections: AcademicLogbookSection[];
  navigationCategories?: AcademicLogbookCategory[];
  legacySections?: AcademicLogbookSection[];
};

export type AcademicLogbookCategory = {
  id: string;
  title: string;
  icon: "teaching" | "practicals" | "research" | "assessments" | "daily";
  sectionValues: string[];
  relatedPages?: Array<{ title: string; href: string }>;
};

export type AcademicRecordData = {
  format: "department-logbook-v1";
  trainingYear: number;
  values: Record<string, string>;
  notes: string;
  sectionSnapshot?: AcademicLogbookSection;
};

// Keep structured details in the existing description column: no schema change or
// migration of old academic entries is needed. Plain descriptions remain valid.
export function readAcademicRecord(description?: string | null): AcademicRecordData | null {
  if (!description) return null;
  try {
    const data = JSON.parse(description);
    if (data?.format !== "department-logbook-v1" || ![1, 2, 3].includes(data.trainingYear)
      || !data.values || typeof data.values !== "object" || Array.isArray(data.values)
      || Object.values(data.values).some((value) => typeof value !== "string")
      || typeof data.notes !== "string") return null;
    const snapshot = data.sectionSnapshot;
    const validSnapshot = snapshot && typeof snapshot.value === "string" && typeof snapshot.topicLabel === "string"
      && (snapshot.name === undefined || typeof snapshot.name === "string")
      && (snapshot.archived === undefined || typeof snapshot.archived === "boolean")
      && (snapshot.multilineTopic === undefined || typeof snapshot.multilineTopic === "boolean")
      && (snapshot.participation === undefined || (Array.isArray(snapshot.participation) && snapshot.participation.every((value: unknown) => typeof value === "string")))
      && Array.isArray(snapshot.years) && snapshot.years.every((year: unknown) => typeof year === "number" && [1, 2, 3].includes(year))
      && Array.isArray(snapshot.fields) && snapshot.fields.length <= 40 && snapshot.fields.every((field: any) => field
        && typeof field.key === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(field.key)
        && !["constructor", "prototype"].includes(field.key) && typeof field.label === "string"
        && ["text", "textarea", "number", "date", "select"].includes(field.type)
        && (field.group === undefined || typeof field.group === "string")
        && (field.maximumField === undefined || typeof field.maximumField === "string")
        && (field.required === undefined || typeof field.required === "boolean")
        && (field.notBeforeLogDate === undefined || typeof field.notBeforeLogDate === "boolean")
        && ["min", "max", "maxLength"].every((key) => field[key] === undefined || (typeof field[key] === "number" && Number.isFinite(field[key])))
        && (field.options === undefined || (Array.isArray(field.options) && field.options.every((option: unknown) => typeof option === "string")))
        && (field.requiredWhen === undefined || (field.requiredWhen && typeof field.requiredWhen.field === "string" && typeof field.requiredWhen.value === "string")));
    return { format: data.format, trainingYear: data.trainingYear, values: data.values, notes: data.notes,
      ...(validSnapshot ? { sectionSnapshot: snapshot } : {}) };
  } catch {
    return null;
  }
}

export function writeAcademicRecord(trainingYear: number, values: Record<string, string>, notes: string, sectionSnapshot?: AcademicLogbookSection): string {
  return JSON.stringify({ format: "department-logbook-v1", trainingYear, values, notes,
    ...(sectionSnapshot ? { sectionSnapshot } : {}) } satisfies AcademicRecordData);
}

export function academicSectionForRecord(profile: AcademicLogbookProfile | null | undefined, value: string, description?: string | null) {
  const record = readAcademicRecord(description);
  const snapshot = record?.sectionSnapshot;
  if (snapshot?.value === value && Array.isArray(snapshot.fields) && Array.isArray(snapshot.years)) return snapshot;
  return (record && profile?.legacySections?.find((section) => section.value === value))
    || profile?.sections.find((section) => section.value === value);
}

export function academicSectionName(profile: AcademicLogbookProfile | null | undefined, value: string): string {
  return profile?.sections.find((section) => section.value === value)?.name || value;
}

export function academicFieldVisible(field: AcademicLogbookField, values: Record<string, string>): boolean {
  if (!field.requiredWhen) return true;
  const source = values[field.requiredWhen.field];
  return typeof source === "string" && source.trim() === field.requiredWhen.value;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Returns labels only; validation errors must never echo a resident's text. */
export function validateAcademicRecord(
  section: AcademicLogbookSection,
  description: string | null | undefined,
  logDate: string,
  participation?: string | null,
): string | null {
  const record = readAcademicRecord(description);
  if (!record) return "Complete the logbook year and record details";
  if (!section.years.includes(record.trainingYear)) return "Select a section available in this logbook year";
  if (section.participation && !section.participation.includes(participation || "")) return "Select your participation";
  if (record.notes.length > 2000) return "Notes must be at most 2000 characters";
  if (Object.keys(record.values).some((key) => !section.fields.some((field) => field.key === key))) return "Invalid record detail field";
  for (const field of section.fields) {
    if (!academicFieldVisible(field, record.values)) continue;
    const value = (record.values[field.key] || "").trim();
    if ((field.required || field.requiredWhen) && !value) return `${field.label} is required`;
    if (!value) continue;
    if (value.length > (field.maxLength ?? 2000)) return `${field.label} is too long`;
    if (field.type === "select" && !field.options?.includes(value)) return `Select a valid ${field.label.toLowerCase()}`;
    if (field.type === "number") {
      const number = Number(value);
      if (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(number)
        || (field.min !== undefined && number < field.min)
        || (field.max !== undefined && number > field.max)) return `Enter a valid ${field.label.toLowerCase()}`;
      const maximum = field.maximumField ? record.values[field.maximumField] : undefined;
      if (typeof maximum === "string" && maximum.trim()
        && number > Number(maximum)) return `${field.label} must not exceed maximum marks`;
    }
    if (field.type === "date" && (!validDate(value) || (field.notBeforeLogDate && value < logDate))) {
      return `${field.label} must be a valid date on or after the entry date`;
    }
  }
  return null;
}

export function academicRecordText(description?: string | null, section?: AcademicLogbookSection): string {
  const record = readAcademicRecord(description);
  if (!record) return description || "";
  const known = record.sectionSnapshot?.fields ?? section?.fields ?? [];
  const fields = [...known, ...Object.keys(record.values).filter((key) => !known.some((field) => field.key === key))
    .map((key) => ({ key, label: key, type: "text" as const }))];
  const lines = [`Logbook year: ${record.trainingYear}`];
  for (const field of fields) {
    if (academicFieldVisible(field, record.values) && record.values[field.key]?.trim()) {
      lines.push(`${field.label}: ${record.values[field.key]}`);
    }
  }
  if (record.notes.trim()) lines.push(`Notes: ${record.notes}`);
  return lines.join("\n");
}
