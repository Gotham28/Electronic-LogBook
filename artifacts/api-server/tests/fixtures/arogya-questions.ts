import type { ArogyaRole } from "../../src/lib/arogya/knowledge/types.js";

type CoreQuestion = {
  id: string;
  role: ArogyaRole;
  question: string;
  expectedWorkflowId: string;
  features?: Record<string, boolean>;
  liveCheck?: boolean;
  mustMention?: string[];
};

type EdgeQuestion = {
  id: string;
  role: ArogyaRole;
  question: string;
  expectedWorkflowId?: string;
  features?: Record<string, boolean>;
  sensitive?: boolean;
  unsupported?: boolean;
};

const coreGroups: Array<Omit<CoreQuestion, "id" | "question"> & { idPrefix: string; questions: string[] }> = [
  { idPrefix: "resident-dashboard", role: "student", expectedWorkflowId: "dashboard", questions: [
    "How do I check my training progress and targets?", "Where can I see which progress targets are complete?",
  ] },
  { idPrefix: "resident-cases", role: "student", expectedWorkflowId: "cases", liveCheck: true, questions: [
    "How do I log a case?", "Where do I add a case log?",
  ] },
  { idPrefix: "resident-procedures", role: "student", expectedWorkflowId: "procedures", questions: [
    "How do I add a procedure log?", "Where do I record a supervised procedure?",
  ] },
  { idPrefix: "resident-academics", role: "student", expectedWorkflowId: "academics", questions: [
    "How can I log an academic activity?", "Where do I add a seminar or presentation?",
  ] },
  { idPrefix: "resident-clinical-work", role: "student", expectedWorkflowId: "clinical-work", features: { clinicalWorks: true }, questions: [
    "How do I add a Clinical Work entry?", "Where can I record Clinical Work?",
  ] },
  { idPrefix: "resident-conferences", role: "student", expectedWorkflowId: "conferences", features: { attendedConferences: true }, questions: [
    "How do I record conference attendance?", "Where can I log CME participation?",
  ] },
  { idPrefix: "resident-postings", role: "student", expectedWorkflowId: "postings", questions: [
    "Where can I see my posting rotation schedule?", "How do I check my assigned postings?",
  ] },
  { idPrefix: "resident-leave", role: "student", expectedWorkflowId: "leave", questions: [
    "How do I request leave?", "Where can I check my leave balance and request status?",
  ] },
  { idPrefix: "resident-assessments", role: "student", expectedWorkflowId: "assessments", questions: [
    "Where do I view my quarterly appraisal?", "How can I see my saved assessment records?",
  ] },
  { idPrefix: "resident-milestones", role: "student", expectedWorkflowId: "milestones", features: { splitThesisAndCertifications: false }, questions: [
    "Where can I add a thesis record in the combined thesis and certification page?", "How do I update a certification in the combined milestones page?",
  ] },
  { idPrefix: "resident-thesis", role: "student", expectedWorkflowId: "thesis", features: { splitThesisAndCertifications: true }, questions: [
    "Where can I submit my thesis record?", "Where do I record a publication?",
  ] },
  { idPrefix: "resident-certifications", role: "student", expectedWorkflowId: "certifications", features: { splitThesisAndCertifications: true, publicationsOnly: false }, questions: [
    "Where do I add a certification?", "How can I check the status of my certificate?",
  ] },
  { idPrefix: "resident-awards", role: "student", expectedWorkflowId: "awards", features: { awards: true }, questions: [
    "How do I record an award?", "Where can I add an achievement?",
  ] },
  { idPrefix: "resident-print", role: "student", expectedWorkflowId: "print-logbook", questions: [
    "How do I print my logbook?", "Where can I save my logbook as a PDF?",
  ] },
  { idPrefix: "resident-account", role: "student", expectedWorkflowId: "account", questions: [
    "How do I recover access to my account?", "Where can I get help if I cannot sign in?",
  ] },

  { idPrefix: "faculty-queue", role: "professor", expectedWorkflowId: "evaluation-queue", questions: [
    "Where is my faculty evaluation queue?", "How do I review a pending log assigned to me?",
  ] },
  { idPrefix: "faculty-progress", role: "professor", expectedWorkflowId: "student-progress", questions: [
    "How do I view resident progress in my department?", "Where can I inspect a student's permitted records?",
    "How do I open the student progress page?", "Can I inspect a resident's progress if they are in my department?",
  ] },
  { idPrefix: "faculty-appraisal", role: "professor", expectedWorkflowId: "quarterly-appraisal", liveCheck: true,
    mustMention: ["quarter", "year"], questions: [
      "How do I post a student's quarterly appraisal?", "How do I enter an appraisal for a resident in my department?",
    ] },
  { idPrefix: "faculty-appraisal-rules", role: "professor", expectedWorkflowId: "quarterly-appraisal", questions: [
    "Can I appraise a resident who is not assigned to me?", "What happens if an appraisal already exists for that quarter and year?",
  ] },
  { idPrefix: "faculty-appraisal-fields", role: "professor", expectedWorkflowId: "quarterly-appraisal", questions: [
    "What does the quarterly appraisal form require?", "When must I enter remediation suggestions on an appraisal?",
    "How many scores must I enter in an appraisal?", "Do low appraisal scores require remediation suggestions?",
  ] },
  { idPrefix: "faculty-review-assignment", role: "professor", expectedWorkflowId: "evaluation-queue", questions: [
    "Can I approve a log assigned to another professor?", "Why would a resident entry be outside my review queue?",
  ] },
  { idPrefix: "faculty-review-status", role: "professor", expectedWorkflowId: "record-status", questions: [
    "What does pending mean for a submitted resident log?", "What should a resident do after a log is rejected?",
  ] },
  { idPrefix: "faculty-account", role: "professor", expectedWorkflowId: "faculty-session", questions: [
    "How can I recover my faculty account?", "Who should I contact if my department access is wrong?",
  ] },
  { idPrefix: "faculty-student-appraisal", role: "professor", expectedWorkflowId: "quarterly-appraisal", questions: [
    "Do I have to be the resident's mentor to create an appraisal?", "Can another professor in my department appraise the same resident?",
  ] },
  { idPrefix: "faculty-saved-draft", role: "professor", expectedWorkflowId: "quarterly-appraisal", questions: [
    "What information does the existing appraisal draft use?", "Does the AI appraisal draft use scores I entered?",
  ] },
  { idPrefix: "faculty-queue-count", role: "professor", expectedWorkflowId: "evaluation-queue", questions: [
    "How can I see my pending reviews?", "Where do I find logs awaiting my review?",
  ] },
  { idPrefix: "faculty-review-action", role: "professor", expectedWorkflowId: "evaluation-queue", questions: [
    "How do I verify or reject an assigned pending entry?", "What should I check before I review a resident log?",
  ] },
  { idPrefix: "faculty-student-scope", role: "professor", expectedWorkflowId: "student-progress", questions: [
    "Can I open a resident from another department?", "How is student progress access different from log review access?",
  ] },

  { idPrefix: "hod-dashboard", role: "hod", expectedWorkflowId: "department-dashboard", questions: [
    "Where do I view the resident roster for my department?", "How can I inspect an approved resident's progress?",
    "Where is the department dashboard?",
  ] },
  { idPrefix: "hod-review-queue", role: "hod", expectedWorkflowId: "review-queue", questions: [
    "What appears in the HOD review queue?", "Why might a pending log be missing from my queue?", "Can the HOD review an unassigned pending log?",
    "Which pending entries are assigned to me or unassigned?", "Can HOD review permission differ from queue membership?", "How do I review an assigned pending log?",
  ] },
  { idPrefix: "hod-department-report", role: "hod", expectedWorkflowId: "department-report", questions: [
    "Give me the current department summary.", "Which approved residents are below their configured progress targets?", "How many approved residents and pending reviews do we have?",
  ] },
  { idPrefix: "hod-appraisal", role: "hod", expectedWorkflowId: "quarterly-appraisal", questions: [
    "How do I post a quarterly appraisal for a student?", "Can I appraise a resident who is not my mentee?", "How can I tell whether this resident already has an appraisal for the period?",
  ] },
  { idPrefix: "hod-student-approval", role: "hod", expectedWorkflowId: "student-approval", liveCheck: true,
    mustMention: ["pending", "payment", "HOD"], questions: [
      "Are self-registered residents automatically approved?", "How do I approve a pending resident after payment?", "Where do I review new student registrations?",
    ] },
  { idPrefix: "hod-faculty", role: "hod", expectedWorkflowId: "faculty-management", questions: [
    "Where do I add a faculty account?", "How do I manage faculty access in my department?", "Can Arogya deactivate a professor for me?",
  ] },
  { idPrefix: "hod-leave", role: "hod", expectedWorkflowId: "leave-approvals", questions: [
    "Where do I review resident leave requests?", "How can I approve a pending leave request?", "Where can I see leave decisions?",
  ] },
  { idPrefix: "hod-requirements", role: "hod", expectedWorkflowId: "requirements", questions: [
    "Where can I configure case and procedure targets?", "How do I update department activity catalogs?", "Why might a test department inherit configuration?",
  ] },
  { idPrefix: "hod-account", role: "hod", expectedWorkflowId: "hod-session", questions: [
    "How do I recover HOD sign-in access?", "Who can correct my HOD department assignment?", "Where do I get help with my HOD account?",
  ] },
];

export const coreQuestions: CoreQuestion[] = coreGroups.flatMap((group) => group.questions.map((question, index) => ({
  id: `${group.idPrefix}-${index + 1}`,
  role: group.role,
  question,
  expectedWorkflowId: group.expectedWorkflowId,
  ...(group.features ? { features: group.features } : {}),
  ...(group.liveCheck ? { liveCheck: true } : {}),
  ...(group.mustMention ? { mustMention: group.mustMention } : {}),
})));

const edgeCases: EdgeQuestion[] = [
  { id: "edge-hod-accept-typo", role: "hod", question: "Student acceptance proceduree: are they automatically accepted?", expectedWorkflowId: "student-approval" },
  { id: "edge-hod-self-registration", role: "hod", question: "Who has to approve a self-registration?", expectedWorkflowId: "student-approval" },
  { id: "edge-hod-pending-list", role: "hod", question: "Where do I find Pending Students?", expectedWorkflowId: "student-approval" },
  { id: "edge-hod-below-target", role: "hod", question: "Who's falling behind?", expectedWorkflowId: "department-report" },
  { id: "edge-hod-progress-typo", role: "hod", question: "Which residents are bellow target?", expectedWorkflowId: "department-report" },
  { id: "edge-hod-review-ownership", role: "hod", question: "Does my review queue include unassigned entries?", expectedWorkflowId: "review-queue" },
  { id: "edge-hod-feature-inherited", role: "hod", question: "Why does a test department inherit the parent's targets?", expectedWorkflowId: "requirements" },
  { id: "edge-hod-leave-approval", role: "hod", question: "How do I approve a resident's leave?", expectedWorkflowId: "leave-approvals" },
  { id: "edge-hod-staff-management", role: "hod", question: "How can I add a professor?", expectedWorkflowId: "faculty-management" },
  { id: "edge-hod-outside-medical", role: "hod", question: "What treatment should I give for a headache?", unsupported: true },

  { id: "edge-faculty-appraisal-spelling", role: "professor", question: "How do I post a quartely appraisal?", expectedWorkflowId: "quarterly-appraisal" },
  { id: "edge-faculty-other-assignment", role: "professor", question: "Can I review a case assigned to another faculty member?", expectedWorkflowId: "evaluation-queue" },
  { id: "edge-faculty-mentee-wording", role: "professor", question: "I am not this resident's mentee; can I still appraise them?", expectedWorkflowId: "quarterly-appraisal" },
  { id: "edge-faculty-progress-boundary", role: "professor", question: "Can I see residents in my department even if they are not mentees?", expectedWorkflowId: "student-progress" },
  { id: "edge-faculty-queue-typo", role: "professor", question: "Where are my pending reivews?", expectedWorkflowId: "evaluation-queue" },
  { id: "edge-faculty-appraisal-duplicate", role: "professor", question: "Why can't I submit the same student's quarterly appraisal twice?", expectedWorkflowId: "quarterly-appraisal" },
  { id: "edge-faculty-status", role: "professor", question: "What happens to a rejected log entry?", expectedWorkflowId: "record-status" },
  { id: "edge-faculty-account", role: "professor", question: "I cannot log in to my faculty account.", expectedWorkflowId: "faculty-session" },
  { id: "edge-faculty-unrelated", role: "professor", question: "Can you book a hotel for my conference?", unsupported: true },
  { id: "edge-faculty-treatment", role: "professor", question: "What is the treatment for an infection?", unsupported: true },

  { id: "edge-resident-case-typo", role: "student", question: "How can I log a cas?", expectedWorkflowId: "cases" },
  { id: "edge-resident-procedure-typo", role: "student", question: "Where do I add a proceduer?", expectedWorkflowId: "procedures" },
  { id: "edge-resident-clinical", role: "student", question: "How do I enter a clinical work log?", expectedWorkflowId: "clinical-work", features: { clinicalWorks: true } },
  { id: "edge-resident-conference", role: "student", question: "Where do I record a CME?", expectedWorkflowId: "conferences", features: { attendedConferences: true } },
  { id: "edge-resident-assessment", role: "student", question: "Where can I see my assessmants?", expectedWorkflowId: "assessments" },
  { id: "edge-resident-print", role: "student", question: "Can I export my logbook as a PDF?", expectedWorkflowId: "print-logbook" },
  { id: "edge-resident-unsupported", role: "student", question: "Can you change my hospital payroll details?", unsupported: true },

  { id: "edge-sensitive-uhid", role: "student", question: "UHID: SYNTHETIC-12345", sensitive: true },
  { id: "edge-sensitive-diagnosis", role: "professor", question: "diagnosis: synthetic example value", sensitive: true },
  { id: "edge-sensitive-narrative", role: "hod", question: "patient presented with synthetic test symptoms", sensitive: true },
];

export const edgeQuestions = edgeCases;
