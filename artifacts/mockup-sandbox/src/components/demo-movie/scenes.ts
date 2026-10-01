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
  beats?: {
    atMs: number;
    action?: SceneAction;
    target?: string;
    selector?: string;
    clickTarget?: string;
  }[];
};

export const DEMO_SCENES: DemoScene[] = [
  {
    id: "scene-01-dashboard",
    chapter: "resident",
    role: "student",
    route: "/",
    target: "dashboard-progress",
    caption: "Your training progress, always current",
    action: "none",
    durationMs: 7000,
  },
  {
    id: "scene-02-caselog",
    chapter: "resident",
    role: "student",
    route: "/cases",
    target: "caselog-add",
    caption: "Log a clinical case in moments",
    action: "none",
    durationMs: 8000,
    beats: [
      {
        atMs: 3000,
        action: "clickTarget",
        target: "caselog-add"
      },
      {
        atMs: 3800,
        selector: '[role="dialog"]'
      },
      {
        atMs: 6500,
        action: "pressEscape",
        target: "caselog-list"
      }
    ]
  },
  {
    id: "scene-03-ask",
    chapter: "resident",
    role: "student",
    route: "/",
    caption: "Ask Arogya about your progress",
    action: "none",
    durationMs: 12000,
    beats: [
      { atMs: 500, action: "openArogya", target: "arogya-launcher" },
      { atMs: 1500, action: "ask", target: "arogya-panel" },
      { atMs: 4000, target: "arogya-messages" }
    ]
  },
  {
    id: "scene-04-coach",
    chapter: "resident",
    role: "student",
    route: "/",
    target: "arogya-coach",
    caption: "Coaching from your own numbers",
    action: "none",
    durationMs: 8000,
    beats: [
      { atMs: 1500, action: "progressCoach" },
      { atMs: 7800, action: "closeArogya" }
    ]
  },
  {
    id: "scene-05-review",
    chapter: "faculty",
    role: "faculty",
    route: "/",
    target: "review-first-item",
    caption: "Faculty review and approve logs from one queue",
    action: "none",
    durationMs: 12000,
    beats: [
      { atMs: 5000, action: "clickTarget", target: "review-approve" }
    ]
  },
  {
    id: "scene-06-appraisal",
    chapter: "faculty",
    role: "faculty",
    route: "/assessments",
    target: "appraisal-draft",
    caption: "Arogya drafts appraisal remarks in seconds",
    action: "none",
    durationMs: 13000,
    beats: [
      { atMs: 1500, action: "appraisalDraft" },
      { atMs: 4000, target: "appraisal-remarks" }
    ]
  },
  {
    id: "scene-07-hod-overview",
    chapter: "hod",
    role: "hod",
    route: "/roster",
    target: "hod-overview",
    caption: "The Head of Department sees the whole department",
    action: "none",
    durationMs: 8000
  },
  {
    id: "scene-08-hod-reqs",
    chapter: "hod",
    role: "hod",
    route: "/requirements",
    target: "hod-requirements",
    caption: "Training requirements, set up per department",
    action: "none",
    durationMs: 8000
  },
  {
    id: "scene-09-hod-report",
    chapter: "hod",
    role: "hod",
    route: "/roster",
    caption: "Arogya builds a department report on request",
    action: "none",
    durationMs: 12000,
    beats: [
      { atMs: 500, action: "openArogya", target: "arogya-launcher" },
      { atMs: 2000, action: "departmentReport", target: "arogya-panel" },
      { atMs: 4000, target: "arogya-report" },
      { atMs: 7000, target: "arogya-messages" },
      { atMs: 11800, action: "closeArogya" }
    ]
  }
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
