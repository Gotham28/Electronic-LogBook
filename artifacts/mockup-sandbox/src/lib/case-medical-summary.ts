type CaseMedicalSummaryFields = {
  chiefComplaints?: string | null;
  history?: string | null;
  examination?: string | null;
};

export function getCaseMedicalSummary(caseLog: CaseMedicalSummaryFields): string {
  const chiefComplaints = caseLog.chiefComplaints ?? "";
  const history = caseLog.history ?? "";
  const examination = caseLog.examination ?? "";

  if (!history.trim() && !examination.trim()) return chiefComplaints;

  return [
    chiefComplaints.trim() ? `Chief complaints:\n${chiefComplaints}` : "",
    history.trim() ? `Relevant history:\n${history}` : "",
    examination.trim() ? `Clinical examination:\n${examination}` : "",
  ].filter(Boolean).join("\n\n");
}
