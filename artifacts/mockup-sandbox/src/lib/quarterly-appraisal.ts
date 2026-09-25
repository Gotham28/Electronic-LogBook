export const quarterlyAppraisalCategories = [
  { key: "journalRecentAdvancesLearningScore", label: "Journal based / recent advances learning" },
  { key: "patientLabSkillLearningScore", label: "Patient based / laboratory or skill based learning" },
  { key: "selfDirectedLearningTeachingScore", label: "Self directed learning and teaching" },
  { key: "departmentalInterdepartmentalLearningScore", label: "Departmental & interdepartmental learning activity" },
  { key: "externalOutreachCmeScore", label: "External and outreach activities / CMEs" },
  { key: "thesisResearchScore", label: "Thesis / research work" },
  { key: "logbookMaintenanceScore", label: "Log Book Maintenance" },
  { key: "patientCareScore", label: "Patient care" },
  { key: "communicationSkillScore", label: "Communication skill" },
  { key: "professionalismScore", label: "Professionalism" },
] as const;

export type AppraisalScoreKey = (typeof quarterlyAppraisalCategories)[number]["key"];

export type QuarterlyAppraisal = {
  id: string;
  studentId: number;
  evaluatorId: number;
  quarter: number;
  year: number;
  appraisalDate: string | null;
  scholasticGrade: string | null;
  patientCareGrade: string | null;
  professionalAttributesGrade: string | null;
  facultyRemarks: string | null;
  journalRecentAdvancesLearningScore: number | null;
  patientLabSkillLearningScore: number | null;
  selfDirectedLearningTeachingScore: number | null;
  departmentalInterdepartmentalLearningScore: number | null;
  externalOutreachCmeScore: number | null;
  thesisResearchScore: number | null;
  logbookMaintenanceScore: number | null;
  patientCareScore: number | null;
  communicationSkillScore: number | null;
  professionalismScore: number | null;
  publications: boolean | null;
  remediationSuggestions: string | null;
  createdAt: string;
  studentName: string;
  registrationNumber: string;
  batch: string;
  departmentName: string;
  evaluatorName: string;
};

export type AppraisalStudent = {
  id: number;
  name: string;
  registrationNumber: string;
  batch: string;
};

export function appraisalScoreBand(score: number) {
  if (score <= 3) return "Not satisfactory";
  if (score <= 6) return "Satisfactory";
  return "More than satisfactory";
}

export function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
