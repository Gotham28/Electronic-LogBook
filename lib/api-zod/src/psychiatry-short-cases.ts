import { z } from "zod";
import { icd11Chapter06Rows } from "./icd11-chapter06-data.js";
import { SHORT_CASE_RECORD_VERSION } from "./psychiatry-case-id.js";

export const SHORT_CASE_SETTINGS = ["OPD", "C-L", "Emergency", "Community", "Neurology"] as const;
export const SHORT_CASE_TAGS = ["Adult psychiatry", "Geriatric psychiatry", "Child & adolescent psychiatry", "Addiction psychiatry", "Neurology"] as const;
export const SHORT_CASE_ACTIVITIES = ["History", "MSE", "Risk", "Capacity", "Physical exam", "Rating scale", "Family interview", "Psychoeducation"] as const;
export const SHORT_CASE_REFERRALS = ["Medicine", "Surgery", "OBG", "Pediatrics", "Cardiology", "Orthopaedics", "Neurology", "Neurosurgery", "Nephrology", "Oncology", "ICU", "Other"] as const;

export type Icd11Diagnosis = { code: string; title: string; uri: string; parents: readonly string[] };

const titles: string[] = [];
export const icd11Chapter06Diagnoses: Icd11Diagnosis[] = [];
for (const [depth, code, title, uri] of icd11Chapter06Rows) {
  titles.length = depth;
  if (code) icd11Chapter06Diagnoses.push({ code, title, uri, parents: titles.slice(1) });
  titles.push(code ? `${code} ${title}` : title);
}

const diagnosesByCode = new Map(icd11Chapter06Diagnoses.map((entry) => [entry.code, entry]));

export function findIcd11Chapter06Diagnosis(code: string) {
  return diagnosesByCode.get(code.trim().toUpperCase());
}

export const psychiatryDiagnosisTextLimit = 500;
export const psychiatryAdditionalDiagnosisLimit = 4;
export const psychiatryDiagnosisOptions = { other: "Other", evaluation: "Needs detailed evaluation" } as const;

export function resolvePsychiatryDiagnosis(selection: string) {
  const code = selection.trim();
  if (code === "other" || code === "evaluation") return { code, title: psychiatryDiagnosisOptions[code], uri: "" };
  if (code.startsWith("text:")) {
    const title = code.slice(5).trim();
    return title && title.length <= psychiatryDiagnosisTextLimit ? { code: `text:${title}`, title, uri: "" } : undefined;
  }
  const diagnosis = findIcd11Chapter06Diagnosis(code);
  return diagnosis && { code: diagnosis.code, title: diagnosis.title, uri: diagnosis.uri };
}

export const psychiatryDiagnosisSelectionSchema = z.string().trim().max(psychiatryDiagnosisTextLimit + 5)
  .refine((value) => Boolean(resolvePsychiatryDiagnosis(value)), "Choose or enter a diagnosis");
const additionalDiagnosisSchema = z.array(psychiatryDiagnosisSelectionSchema).max(psychiatryAdditionalDiagnosisLimit);

export function readPsychiatryAdditionalDiagnoses(encoded?: string): string[] {
  if (!encoded) return [];
  try {
    const parsed = additionalDiagnosisSchema.safeParse(JSON.parse(encoded));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function psychiatryDiagnosisLabel(diagnosis: { code: string; title: string; uri: string }) {
  return diagnosis.uri ? `${diagnosis.code} ${diagnosis.title}` : diagnosis.title;
}

export function searchIcd11Chapter06Diagnoses(query: string) {
  const text = query.trim().toUpperCase();
  const codeMatches = icd11Chapter06Diagnoses.filter(({ code }) => code.startsWith(text));
  const primaryMatches = codeMatches.length > 0 ? codeMatches :
    icd11Chapter06Diagnoses.filter(({ title }) => title.toUpperCase().includes(text));
  const exact = diagnosesByCode.get(text);
  return exact ? [exact, ...primaryMatches.filter((entry) => entry !== exact)] : primaryMatches;
}

export const psychiatryShortCaseSchema = z.object({
  seenIn: z.enum(SHORT_CASE_SETTINGS),
  diagnosisCode: psychiatryDiagnosisSelectionSchema,
  additionalDiagnosisCodes: additionalDiagnosisSchema.optional(),
  medicalDiagnosis: z.string().trim().max(psychiatryDiagnosisTextLimit).optional(),
  tags: z.array(z.enum(SHORT_CASE_TAGS)).max(SHORT_CASE_TAGS.length),
  activities: z.array(z.enum(SHORT_CASE_ACTIVITIES)).max(SHORT_CASE_ACTIVITIES.length),
  referredFrom: z.union([z.enum(SHORT_CASE_REFERRALS), z.literal("")]),
}).strict();

export type PsychiatryShortCase = z.input<typeof psychiatryShortCaseSchema>;

export function psychiatryShortCaseValues(details: z.output<typeof psychiatryShortCaseSchema>) {
  const diagnosis = resolvePsychiatryDiagnosis(details.diagnosisCode)!;
  const additional = (details.additionalDiagnosisCodes ?? []).map((code) => resolvePsychiatryDiagnosis(code)!);
  return {
    diagnosisFinal: [diagnosis, ...additional].map(psychiatryDiagnosisLabel).join("; "),
    customFields: {
      _psychiatryShortCase: SHORT_CASE_RECORD_VERSION,
      psychiatrySeenIn: details.seenIn,
      psychiatryDiagnosisCode: diagnosis.code,
      psychiatryDiagnosisTitle: diagnosis.title,
      psychiatryDiagnosisUri: diagnosis.uri,
      ...(additional.length > 0 ? { psychiatryAdditionalDiagnosisCodes: JSON.stringify(additional.map(({ code }) => code)) } : {}),
      ...(details.medicalDiagnosis ? { psychiatryMedicalDiagnosis: details.medicalDiagnosis } : {}),
      psychiatryTags: [...new Set(details.tags)].join(", "),
      psychiatryActivities: [...new Set(details.activities)].join(", "),
      psychiatryReferredFrom: details.referredFrom,
    },
  };
}
