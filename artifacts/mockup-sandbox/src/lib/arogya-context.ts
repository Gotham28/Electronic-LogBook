export const AROGYA_CONTEXT_EVENT = "arogya:selection";
export const AROGYA_OPEN_EVENT = "arogya:open";

export type ArogyaSelectedContext = {
  studentId?: number;
  log?: { type: "case" | "procedure" | "academic" | "clinical-work" | "conference"; id: number };
  appraisalPeriod?: { quarter: number; year: number };
  validationCodes?: string[];
};

export function publishArogyaContext(context: ArogyaSelectedContext | null): void {
  window.dispatchEvent(new CustomEvent(AROGYA_CONTEXT_EVENT, { detail: context }));
}

export function openArogya(): void {
  window.dispatchEvent(new Event(AROGYA_OPEN_EVENT));
}
