import { DemoRole } from "@/lib/demoSession";

export type DemoChapter = "resident" | "faculty" | "hod";
export type SceneAction = 
  | "none" 
  | "openArogya" 
  | "closeArogya" 
  | "ask" 
  | "progressCoach" 
  | "departmentReport" 
  | "appraisalDraft" 
  | "clickTarget" 
  | "pressEscape";

export type DemoScene = {
  id: string;
  chapter: DemoChapter;
  role: DemoRole;
  route: string;
  target?: string;
  caption: string;
  action: SceneAction;
  durationMs: number;
  transition?: { eyebrow: string; title: string; body: string };
  beats?: {
    atMs: number;
    action?: SceneAction;
    target?: string;
    selector?: string;
    clickTarget?: string;
    caption?: string;
  }[];
};

export const DEMO_SCENES: DemoScene[] = [
  {
    id: "scene-01-student-dashboard",
    chapter: "resident",
    role: "student",
    route: "/",
    target: "dashboard-welcome",
    caption: "Welcome to E-LogBook. Start with a clear view of your training.",
    action: "none",
    durationMs: 12500,
    beats: [
      { atMs: 2400, target: "dashboard-progress", caption: "See verified progress and the work still waiting for review." },
      { atMs: 5100, target: "dashboard-cases", caption: "Clinical case logs count toward your department targets." },
      { atMs: 7400, target: "dashboard-procedures", caption: "Procedure records and competency progress stay together." },
      { atMs: 9900, target: "dashboard-academics", caption: "Academic activity is tracked alongside clinical work." },
    ],
  },
  {
    id: "scene-02-dashboard-lower",
    chapter: "resident",
    role: "student",
    route: "/",
    target: "dashboard-recent",
    caption: "Recent activity gives you a quick view of your latest entries.",
    action: "none",
    durationMs: 8000,
    beats: [
      { atMs: 3500, target: "dashboard-bottom", caption: "The lower dashboard keeps useful reminders and print access close by." },
    ],
  },
  {
    id: "scene-03-caselog",
    chapter: "resident",
    role: "student",
    route: "/cases",
    target: "caselog-add",
    caption: "Add a case log with the details needed for faculty review.",
    action: "none",
    durationMs: 10500,
    beats: [
      { atMs: 1000, action: "clickTarget", target: "caselog-add", caption: "Open the case form." },
      { atMs: 2200, target: "caselog-patient-info", caption: "Enter the encounter date, age, gender and case category." },
      { atMs: 4600, target: "caselog-clinical-details", caption: "Record the clinical history, examination and investigations." },
      { atMs: 6800, target: "caselog-diagnosis-details", caption: "Add diagnoses, management, follow-up and learning points." },
      { atMs: 8300, target: "caselog-reviewer", caption: "Choose a reviewing faculty member, then save a draft or send it for review." },
      { atMs: 9000, action: "pressEscape", target: "caselog-list", caption: "Return to the case log list after reviewing the entry fields." },
    ],
  },
  {
    id: "scene-04-assessments",
    chapter: "resident",
    role: "student",
    route: "/assessments",
    target: "student-assessments",
    caption: "Assessment scores and quarterly appraisal records are easy to find.",
    action: "none",
    durationMs: 6000,
  },
  {
    id: "scene-05-thesis",
    chapter: "resident",
    role: "student",
    route: "/thesis",
    target: "student-thesis",
    caption: "Follow thesis milestones, guides and key dates from one place.",
    action: "none",
    durationMs: 6000,
  },
  {
    id: "scene-06-leave-records",
    chapter: "resident",
    role: "student",
    route: "/attendance",
    target: "student-leave-records",
    caption: "Leave applications and their recorded decisions stay in your logbook.",
    action: "none",
    durationMs: 6000,
  },
  {
    id: "scene-07-student-arogya",
    chapter: "resident",
    role: "student",
    route: "/",
    target: "arogya-launcher",
    caption: "Ask Arogya for a progress coach and see what is due.",
    action: "openArogya",
    durationMs: 15000,
    beats: [
      { atMs: 1400, action: "progressCoach", target: "arogya-coach", caption: "Get coaching based on your current progress." },
      { atMs: 5200, target: "arogya-messages", caption: "Arogya summarizes practical next steps." },
      { atMs: 7800, action: "clickTarget", target: "arogya-due", caption: "Check what needs attention next." },
      { atMs: 10400, target: "arogya-messages", caption: "Due items open from the same assistant panel." },
      { atMs: 14300, action: "closeArogya", target: "arogya-launcher", caption: "Close Arogya to return to the student dashboard." },
    ],
  },
  {
    id: "scene-08-faculty-transition",
    chapter: "faculty",
    role: "student",
    route: "/",
    caption: "Next, the Faculty workspace",
    action: "none",
    durationMs: 3800,
    transition: {
      eyebrow: "Resident journey complete",
      title: "Next, the Faculty workspace",
      body: "Faculty and HOD access is free. See how faculty review logs, follow resident progress and complete appraisals.",
    },
  },
  {
    id: "scene-09-review",
    chapter: "faculty",
    role: "faculty",
    route: "/review-queue",
    target: "review-first-item",
    caption: "Review submitted work from one queue.",
    action: "none",
    durationMs: 10500,
    beats: [
      { atMs: 3200, target: "review-fast-evaluation", caption: "Fast Faculty Evaluation keeps the decision beside the entry." },
      { atMs: 6900, target: "review-approve", caption: "Verify an entry or request a revision after reviewing its details." },
    ],
  },
  {
    id: "scene-10-faculty-progress",
    chapter: "faculty",
    role: "faculty",
    route: "/mentees",
    target: "faculty-progress-list",
    caption: "See every assigned student's progress and open their logbook.",
    action: "none",
    durationMs: 19000,
    beats: [
      { atMs: 2600, action: "clickTarget", target: "faculty-view-logbook", caption: "Open a resident's logbook for a closer look." },
      { atMs: 3300, selector: '[role="dialog"]', caption: "Open the resident's logbook for a closer look." },
      { atMs: 5700, target: "faculty-progress-summary", caption: "Start with the progress summary and verified totals." },
      { atMs: 8700, target: "faculty-progress-cases", caption: "Review case-category progress against department requirements." },
      { atMs: 11800, target: "faculty-progress-procedures", caption: "Procedure progress includes verified and pending activity." },
      { atMs: 15000, target: "faculty-progress-academics", caption: "Academic activities complete the resident's progress picture." },
    ],
  },
  {
    id: "scene-11-faculty-assessments",
    chapter: "faculty",
    role: "faculty",
    route: "/assessments",
    target: "faculty-add-assessment",
    caption: "Record an assessment, then complete a quarterly appraisal.",
    action: "none",
    durationMs: 16000,
    beats: [
      { atMs: 3300, target: "quarterly-appraisal", caption: "The quarterly appraisal brings the review fields together." },
      { atMs: 6700, action: "appraisalDraft", target: "appraisal-draft", caption: "Draft appraisal remarks with Arogya after the required fields are ready." },
      { atMs: 11200, target: "appraisal-remarks", caption: "Review and edit Arogya's draft before saving the appraisal." },
    ],
  },
  {
    id: "scene-12-hod-transition",
    chapter: "hod",
    role: "faculty",
    route: "/assessments",
    caption: "Next, department oversight",
    action: "none",
    durationMs: 3800,
    transition: {
      eyebrow: "Faculty journey complete",
      title: "Now, the HOD workspace",
      body: "Move from individual review to department-wide progress, requirements and student access.",
    },
  },
  {
    id: "scene-13-hod-dashboard",
    chapter: "hod",
    role: "hod",
    route: "/roster",
    target: "hod-overview",
    caption: "The HOD dashboard opens with a department-wide view.",
    action: "none",
    durationMs: 12500,
    beats: [
      { atMs: 3600, target: "hod-log-activity", caption: "Department log activity shows review status at a glance." },
      { atMs: 7800, target: "hod-student-roster", caption: "Scroll through resident progress and roster details." },
    ],
  },
  {
    id: "scene-14-hod-requirements",
    chapter: "hod",
    role: "hod",
    route: "/requirements",
    target: "hod-requirements",
    caption: "Set department requirements and the options residents can log.",
    action: "none",
    durationMs: 10000,
    beats: [
      { atMs: 2800, target: "hod-requirements-add", caption: "Each section has its own list and add controls." },
      { atMs: 4700, action: "clickTarget", target: "hod-requirements-add", caption: "Open the form to see the fields for a new requirement." },
      { atMs: 5500, target: "hod-requirements-add-form", caption: "Add a name and any required count or period for this section." },
      { atMs: 8200, action: "clickTarget", target: "hod-requirements-add", caption: "Close the form after reviewing the available fields." },
    ],
  },
  {
    id: "scene-15-hod-add-faculty",
    chapter: "hod",
    role: "hod",
    route: "/professors",
    target: "hod-add-faculty",
    caption: "Add faculty to the department from the HOD workspace.",
    action: "none",
    durationMs: 7000,
  },
  {
    id: "scene-16-hod-approve-students",
    chapter: "hod",
    role: "hod",
    route: "/student-access",
    target: "hod-student-approvals",
    caption: "Review pending student registrations and approve them here.",
    action: "none",
    durationMs: 7000,
    beats: [
      { atMs: 2600, target: "hod-approve-student", caption: "Student access decisions stay with the department HOD." },
    ],
  },
  {
    id: "scene-17-hod-arogya",
    chapter: "hod",
    role: "hod",
    route: "/roster",
    target: "arogya-launcher",
    caption: "Arogya can summarize department progress and highlight who needs attention.",
    action: "openArogya",
    durationMs: 15500,
    beats: [
      { atMs: 1700, action: "departmentReport", target: "arogya-report", caption: "Generate a department report from the HOD assistant." },
      { atMs: 4700, target: "arogya-messages", caption: "Review the department summary in the conversation." },
      { atMs: 8200, action: "clickTarget", target: "arogya-falling-behind", caption: "Ask which residents may be falling behind." },
      { atMs: 10800, target: "arogya-messages", caption: "Arogya brings the follow-up into the same panel." },
      { atMs: 14800, action: "closeArogya", target: "arogya-launcher", caption: "Close Arogya to return to the department dashboard." },
    ],
  },
];

export const CHAPTERS: { id: DemoChapter; label: string }[] = [
  { id: "resident", label: "Resident" },
  { id: "faculty", label: "Faculty" },
  { id: "hod", label: "HOD" },
];

export function getChapterShares(): Record<DemoChapter, number> {
  const totalDuration = DEMO_SCENES.reduce((acc, scene) => acc + scene.durationMs, 0);
  const shares: Record<DemoChapter, number> = {
    resident: 0,
    faculty: 0,
    hod: 0
  };
  
  if (totalDuration === 0) return shares;

  for (const scene of DEMO_SCENES) {
    shares[scene.chapter] += scene.durationMs / totalDuration;
  }
  
  return shares;
}
