import { z } from "zod";

export const voiceLogTypeSchema = z.enum(["case", "procedure"]);
export type VoiceLogType = z.infer<typeof voiceLogTypeSchema>;

export const voiceLogGenderSchema = z.enum(["Male", "Female", "Other"]);
export type VoiceLogGender = z.infer<typeof voiceLogGenderSchema>;

export const voiceLogSettingSchema = z.enum(["Ward", "Casualty", "OT", "NICU"]);
export type VoiceLogSetting = z.infer<typeof voiceLogSettingSchema>;

export const voiceLogCaseFieldsSchema = z.object({
  date: z.string().nullable(),
  patientUhid: z.string().nullable(),
  age: z.string().nullable(),
  gender: voiceLogGenderSchema.nullable(),
  category: z.string().nullable(),
  sampleProcessing: z.string().nullable(),
  medicalSummary: z.string().nullable(),
  chiefComplaints: z.string().nullable(),
  history: z.string().nullable(),
  examination: z.string().nullable(),
  investigations: z.string().nullable(),
  diagnosis: z.string().nullable(),
  differentialDiagnosis: z.string().nullable(),
  management: z.string().nullable(),
  outcome: z.string().nullable(),
  learningPoints: z.string().nullable(),
}).strict();
export type VoiceLogCaseFields = z.infer<typeof voiceLogCaseFieldsSchema>;

export const voiceLogProcedureFieldsSchema = z.object({
  date: z.string().nullable(),
  group: z.string().nullable(),
  procedureName: z.string().nullable(),
  patientUhid: z.string().nullable(),
  diagnosis: z.string().nullable(),
  sex: voiceLogGenderSchema.nullable(),
  age: z.string().nullable(),
  setting: voiceLogSettingSchema.nullable(),
  experience: z.string().nullable(),
  customFields: z.record(z.string(), z.string()),
}).strict();
export type VoiceLogProcedureFields = z.infer<typeof voiceLogProcedureFieldsSchema>;

export const voiceLogExtractResponseSchema = z.discriminatedUnion("logType", [
  z.object({
    logType: z.literal("case"),
    transcript: z.string(),
    fields: voiceLogCaseFieldsSchema,
    missingRequired: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  z.object({
    logType: z.literal("procedure"),
    transcript: z.string(),
    fields: voiceLogProcedureFieldsSchema,
    missingRequired: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
]);
export type VoiceLogExtractResponse = z.infer<typeof voiceLogExtractResponseSchema>;
