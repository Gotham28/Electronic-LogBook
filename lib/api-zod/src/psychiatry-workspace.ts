import { z } from "zod";
import { findIcd11Chapter06Diagnosis, SHORT_CASE_REFERRALS, SHORT_CASE_TAGS } from "./psychiatry-short-cases.js";

export const PSYCHIATRY_BASE = "/psychiatry";
export const PSYCHIATRY_ICUS = ["GICU", "MICU", "PICU", "NSICU", "Burns ICU", "TICU", "SICU", "Cardiac ICU"] as const;

export const psychiatryNavigation = [
  { label: "Clinical", links: [
    ["home", "Home"], ["opd", "OPD log"], ["ward", "Ward log", true], ["short-cases", "Short cases"],
    ["long", "Long cases", true], ["cl", "Consultation liaison", true], ["emer", "Psychiatric emergencies", true],
    ["psy", "Clinical psychology", true], ["comm", "Community outreach", true], ["proc", "Procedures"],
  ] },
  { label: "Academics", links: [
    ["a_lecture", "Lectures"], ["a_cp", "Case presentations"], ["a_sem", "Seminars / symposia"],
    ["a_jc", "Journal clubs"], ["a_ug", "UG teaching"], ["a_intern", "Intern training", true], ["a_cme", "CME & conferences"],
  ] },
  { label: "Research & records", links: [
    ["thesis", "Thesis"], ["research", "Other research", true], ["ach", "Achievements", true], ["postings", "Postings"],
    ["rem", "Remarks", true], ["summary", "Summary & print", true],
  ] },
] as const;

type FieldKind = "text" | "textarea" | "date" | "month" | "number" | "select" | "radio" | "faculty" | "attendees" | "chips" | "diagnosis";
export type PsychiatryField = { key: string; label: string; kind: FieldKind; choices?: readonly string[]; optional?: boolean };
export type PsychiatryPage = {
  title: string; add: string; fields: PsychiatryField[]; columns: Array<[string, string]>;
  monthly?: "counts" | "referrals"; shared?: boolean; draft?: boolean; review?: boolean;
};

const field = (key: string, label: string, kind: FieldKind = "text", options?: { choices?: readonly string[]; optional?: boolean }): PsychiatryField => ({ key, label, kind, ...options });
const date = field("date", "Date", "date");
const month = field("month", "Month", "month");
const topic = field("topic", "Topic");
const consultant = field("reviewerId", "Consultant", "faculty");
const chair = field("reviewerId", "Chair / moderator (verifies)", "faculty");
const attendees = field("attendees", "Attended by", "attendees", { optional: true });
const points = field("discussion", "Discussion points", "textarea", { optional: true });
const sessionColumns: Array<[string, string]> = [["date", "Date"], ["topic", "Topic"], ["reviewerName", "Chair"], ["attendeeCount", "Attended"], ["role", "My role"], ["status", "Status"]];

function monthly(title: string, add: string, mode: NonNullable<PsychiatryPage["monthly"]>): PsychiatryPage {
  return { title, add, fields: [month, consultant], monthly: mode, review: true, columns: [
    ["diagnosis", "ICD-11 diagnosis"], ["medical", "Medical diagnosis"], ["count", "No."],
    ...(mode === "counts" ? [["visit", "Fresh / Review"], ["tags", "Tags"]] : [["department", "Department"]]) as Array<[string, string]>,
  ] };
}

export const psychiatryPages: Record<string, PsychiatryPage> = {
  opd: monthly("OPD log", "Add OPD month", "counts"),
  ward: monthly("Ward log", "Add ward month", "counts"),
  long: { title: "Long cases", add: "Add long case", draft: true, review: true, fields: [
    field("age", "Age", "number"), field("sex", "Sex", "select", { choices: ["Male", "Female", "Other"] }),
    field("admission", "When admitted", "radio", { choices: ["Month and year", "Specific dates"] }),
    field("month", "Month and year of admission", "month", { optional: true }),
    field("admittedAt", "Date of admission", "date", { optional: true }), field("dischargedAt", "Date of discharge", "date", { optional: true }),
    field("diagnosis", "ICD-11 diagnosis", "diagnosis"), field("tags", "Tags (select all that apply)", "chips", { choices: SHORT_CASE_TAGS, optional: true }),
    field("history", "Brief history and key MSE findings", "textarea", { optional: true }),
    field("activities", "What you did", "chips", { choices: ["History", "MSE", "Risk", "Capacity", "Physical exam", "Rating scale", "Family interview", "Psychoeducation"], optional: true }),
    field("scales", "Scales administered", "text", { optional: true }), field("outcome", "Management / learning outcome", "textarea", { optional: true }),
    field("unit", "Unit", "select", { choices: ["Unit 1", "Unit 2"] }), consultant,
  ], columns: [["period", "Dates / month"], ["diagnosis", "Diagnosis"], ["tags", "Tags"], ["scales", "Scales administered"], ["unit", "Unit"], ["status", "Status"]] },
  cl: monthly("Consultation liaison", "Add C-L month", "referrals"),
  emer: monthly("Psychiatric emergencies", "Add emergencies month", "referrals"),
  "psy-intervention": { title: "Interventions", add: "Add intervention", fields: [date, field("name", "Name of intervention"), field("role", "Your role", "radio", { choices: ["Observed", "Performed"] })], columns: [["date", "Date"], ["name", "Name of intervention"], ["role", "Observed / Performed"]] },
  "psy-assessment": { title: "Assessments", add: "Add assessment", fields: [date, field("name", "Name of assessment"), field("role", "Your role", "radio", { choices: ["Observed", "Performed"] })], columns: [["date", "Date"], ["name", "Name of assessment"], ["role", "Observed / Performed"]] },
  comm: { title: "Community outreach programmes", add: "Add outreach programme", fields: [date, field("activity", "Activity"), field("location", "Location"), { ...attendees, label: "Attended by (PGs)" }], columns: [["date", "Date"], ["activity", "Activity"], ["location", "Location"], ["attendeeNames", "Attended by"]] },
  proc: { title: "Procedures", add: "Add procedure", fields: [field("name", "Procedure"), month], columns: [["name", "Procedure"], ["month", "Month"]] },
  a_lecture: { title: "Lectures", add: "Add lecture", fields: [date, topic, { ...consultant, label: "Presented by (faculty)" }], columns: [["date", "Date"], ["topic", "Topic"], ["reviewerName", "Presented by"]] },
  a_cp: { title: "Case presentations", add: "Add session", fields: [date, topic, chair, attendees, points], columns: sessionColumns, shared: true, review: true },
  a_sem: { title: "Seminars / symposia", add: "Add session", fields: [date, topic, chair, attendees, points], columns: sessionColumns, shared: true, review: true },
  a_jc: { title: "Journal clubs", add: "Add session", fields: [date, field("topic", "Article title"), field("journal", "Journal and year"), chair, attendees, points], columns: sessionColumns, shared: true, review: true },
  a_ug: { title: "UG teaching", add: "Add UG class", fields: [date, topic], columns: [["date", "Date"], ["topic", "Topic"], ["status", "Status"]], review: true },
  a_intern: { title: "Intern training", add: "Add session", fields: [date, topic, chair, attendees], columns: sessionColumns, shared: true, review: true },
  a_cme: { title: "CME & conferences", add: "Add CME / conference", fields: [date, field("role", "Your role", "select", { choices: ["Attended", "Paper presented", "Poster presented"] }), field("topic", "Name and venue"), attendees], columns: sessionColumns.filter(([key]) => key !== "reviewerName"), shared: true },
  thesis: { title: "Thesis", add: "Add thesis discussion", fields: [date, { ...consultant, label: "Discussed with" }, field("discussion", "What was discussed", "textarea"), field("nextStep", "Next step")], columns: [["date", "Date"], ["reviewerName", "With"], ["discussion", "Discussed"], ["nextStep", "Next step"]] },
  research: { title: "Other research projects", add: "Add research project", fields: [field("topic", "Project title"), field("role", "Your role", "select", { choices: ["Principal investigator", "Co-investigator"] }), field("projectStatus", "Status")], columns: [["topic", "Project"], ["role", "Role"], ["projectStatus", "Status"]] },
  ach: { title: "Other achievements", add: "Add achievement", fields: [field("name", "Achievement"), date], columns: [["date", "Date"], ["name", "Achievement"]] },
  rem: { title: "Remarks", add: "Add remark", fields: [date, field("remark", "Remark", "textarea")], columns: [["date", "Date"], ["remark", "Remark"]] },
};

export type PsychiatryValue = string | string[];
export type PsychiatryValues = Record<string, PsychiatryValue>;
export const psychiatryValuesSchema = z.record(z.string(), z.union([z.string().trim().max(4000), z.array(z.string().trim().max(160)).max(50)]));
const diagnosisRow = z.object({
  diagnosisCode: z.string().max(16).refine((code) => Boolean(findIcd11Chapter06Diagnosis(code)), "Select an ICD-11 Chapter 06 diagnosis"),
  medical: z.string().trim().max(500), count: z.number().int().min(1).max(50),
  visit: z.enum(["Fresh", "Review"]), tags: z.array(z.enum(SHORT_CASE_TAGS)).max(SHORT_CASE_TAGS.length),
  department: z.enum(SHORT_CASE_REFERRALS), icu: z.union([z.enum(PSYCHIATRY_ICUS), z.literal("")]),
}).strict();
export type PsychiatryDiagnosisRow = z.infer<typeof diagnosisRow>;
export const psychiatryEntrySchema = z.object({ values: psychiatryValuesSchema, rows: z.array(diagnosisRow).max(50).default([]), draft: z.boolean().default(false) }).strict();

export function psychiatryFieldVisible(field: PsychiatryField, values: PsychiatryValues) {
  if (field.key === "month" && values.admission === "Specific dates") return false;
  if (field.key === "admittedAt" || field.key === "dischargedAt") return values.admission === "Specific dates";
  return true;
}

function calendarDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

export function validatePsychiatryEntry(page: PsychiatryPage, input: z.infer<typeof psychiatryEntrySchema>) {
  if (input.draft && !page.draft) return "This section does not support drafts.";
  if (page.monthly ? input.rows.length === 0 : input.rows.length > 0) return "Check the diagnosis rows for this entry.";
  if (page.monthly === "referrals" && input.rows.some((row) => row.department === "ICU" && !row.icu)) return "Select the ICU for each ICU referral.";
  if (Object.keys(input.values).some((key) => !page.fields.some((item) => item.key === key))) return "Unexpected field for this section.";
  for (const item of page.fields) {
    if (!psychiatryFieldVisible(item, input.values)) continue;
    const value = input.values[item.key];
    const conditionalDate = ["month", "admittedAt", "dischargedAt"].includes(item.key) && page.draft;
    if (value === undefined || value === "") {
      if ((!item.optional || conditionalDate) && !input.draft) return `${item.label} is required.`;
      continue;
    }
    if (item.kind === "attendees" || item.kind === "chips") {
      if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((choice) =>
        item.kind === "attendees" ? !/^[1-9]\d{0,9}$/.test(choice) : !item.choices?.includes(choice))) return `Check ${item.label.toLowerCase()}.`;
    } else if (typeof value !== "string" ||
      (item.kind === "date" && !calendarDate(value)) || (item.kind === "month" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) ||
      (item.kind === "number" && !/^\d{1,3}$/.test(value)) || ((item.kind === "select" || item.kind === "radio") && !item.choices?.includes(value)) ||
      (item.kind === "faculty" && !/^[1-9]\d{0,9}$/.test(value)) || (item.kind === "diagnosis" && !findIcd11Chapter06Diagnosis(value))) return `Check ${item.label.toLowerCase()}.`;
  }
  if (input.values.admission === "Specific dates" && typeof input.values.admittedAt === "string" && typeof input.values.dischargedAt === "string" && input.values.admittedAt > input.values.dischargedAt) return "Discharge must be on or after admission.";
  return undefined;
}
