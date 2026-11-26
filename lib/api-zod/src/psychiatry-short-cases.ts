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
  diagnosisCode: z.string().trim().max(16).transform((code) => code.toUpperCase()).refine(
    (code) => diagnosesByCode.has(code), "Select an ICD-11 Chapter 06 diagnosis",
  ),
  tags: z.array(z.enum(SHORT_CASE_TAGS)).max(SHORT_CASE_TAGS.length),
  activities: z.array(z.enum(SHORT_CASE_ACTIVITIES)).max(SHORT_CASE_ACTIVITIES.length),
  referredFrom: z.union([z.enum(SHORT_CASE_REFERRALS), z.literal("")]),
}).strict();

export type PsychiatryShortCase = z.input<typeof psychiatryShortCaseSchema>;

export function psychiatryShortCaseValues(details: z.output<typeof psychiatryShortCaseSchema>) {
  const diagnosis = diagnosesByCode.get(details.diagnosisCode)!;
  return {
    diagnosisFinal: `${diagnosis.code} ${diagnosis.title}`,
    customFields: {
      _psychiatryShortCase: SHORT_CASE_RECORD_VERSION,
      psychiatrySeenIn: details.seenIn,
      psychiatryDiagnosisCode: diagnosis.code,
      psychiatryDiagnosisTitle: diagnosis.title,
      psychiatryDiagnosisUri: diagnosis.uri,
      psychiatryTags: [...new Set(details.tags)].join(", "),
      psychiatryActivities: [...new Set(details.activities)].join(", "),
      psychiatryReferredFrom: details.referredFrom,
    },
  };
}
