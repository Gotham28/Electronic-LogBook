import { z } from "zod";
import type { AcademicLogbookCategory } from "./academic-logbook.js";

const label = z.string().trim().min(1).max(160);
const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/).refine((value) => !["constructor", "prototype"].includes(value), "Choose another field identifier");
const choices = z.array(label).min(1).max(50).refine((values) => new Set(values).size === values.length, "Choices must be unique");
export const logbookSectionSettingsSchema = z.object({
  name: label,
  categoryId: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).max(10000),
  years: z.array(z.number().int().min(1).max(3)).min(1).max(3).refine((values) => new Set(values).size === values.length, "Years must be unique"),
  topicLabel: label,
  multilineTopic: z.boolean(),
  participation: choices.optional(),
  archived: z.boolean(),
  required: z.number().int().min(0).max(100000),
  period: z.enum(["total", "month"]),
  fields: z.array(z.object({
    key, label, type: z.enum(["text", "textarea", "number", "date", "select"]),
    required: z.boolean().optional(),
    options: choices.optional(),
    min: z.number().finite().optional(), max: z.number().finite().optional(),
    maxLength: z.number().int().min(1).max(2000).optional(),
    maximumField: key.optional(), notBeforeLogDate: z.boolean().optional(),
    requiredWhen: z.object({ field: key, value: label }).strict().optional(),
    group: z.string().trim().max(160).optional(),
  }).strict()).max(40),
}).strict().superRefine((settings, ctx) => {
  const fail = (index: number, message: string) => ctx.addIssue({ code: "custom", path: ["fields", index], message });
  if (new Set(settings.fields.map((field) => field.key)).size !== settings.fields.length) {
    ctx.addIssue({ code: "custom", path: ["fields"], message: "Field identifiers must be unique" });
  }
  settings.fields.forEach((field, index) => {
    if (field.type === "select" && !field.options?.length) fail(index, "Dropdown fields need choices");
    if (field.options && field.type !== "select") fail(index, "Only dropdown fields have choices");
    if ((field.min !== undefined || field.max !== undefined || field.maximumField) && field.type !== "number") fail(index, "Numeric limits require a number field");
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) fail(index, "Minimum must not exceed maximum");
    if (field.notBeforeLogDate && field.type !== "date") fail(index, "Date restrictions require a date field");
    if (field.maximumField && !settings.fields.some((other) => other.key === field.maximumField && other.key !== field.key && other.type === "number")) fail(index, "Choose another number field as the upper limit");
    if (field.requiredWhen) {
      const parent = settings.fields.find((other) => other.key === field.requiredWhen!.field && other.key !== field.key);
      if (!parent || parent.requiredWhen) fail(index, "Conditional fields need an unconditional source field");
      else if (parent.type === "select" && !parent.options?.includes(field.requiredWhen.value)) fail(index, "Condition must match a source dropdown choice");
    }
  });
});

export type LogbookSectionSettings = z.infer<typeof logbookSectionSettingsSchema>;
export type ManagedLogbookSection = LogbookSectionSettings & { value: string; revision: number };
export type LogbookSectionSettingsResponse = { sections: ManagedLogbookSection[]; categories: AcademicLogbookCategory[]; readOnly: boolean };

export const defaultLogbookCategories: AcademicLogbookCategory[] = [
  { id: "teaching-learning", title: "Teaching & Learning", icon: "teaching", sectionValues: [] },
  { id: "practicals-postings", title: "Practicals & Postings", icon: "practicals", sectionValues: [] },
  { id: "research-events", title: "Research & Events", icon: "research", sectionValues: [] },
  { id: "assessments-appraisal", title: "Assessments & Appraisal", icon: "assessments", sectionValues: [] },
  { id: "daily-attendance", title: "Daily Record & Attendance", icon: "daily", sectionValues: [] },
];
