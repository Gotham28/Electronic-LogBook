import { DemoRole } from "@/lib/demoSession";

export type DemoChapter = "resident" | "faculty" | "hod";
export type SceneAction = 
  | "none" 
  | "openArogya" 
  | "closeArogya" 
  | "ask" 
  | "progressCoach" 
  | "whatsDue"
  | "departmentReport" 
  | "appraisalDraft" 
  | "clickTarget" 
  | "clickWithCursor"
  | "pressEscape"
  | "scrollSlowly"
  | "navigate";

export type InterstitialInfo = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: "teal" | "emerald" | "cyan" | "indigo";
  tagline?: string;
  highlights?: string[];
  icon?: "sparkles" | "stethoscope" | "award" | "cpu";
};

export type DemoScene = {
  id: string;
  chapter: DemoChapter;
  role: DemoRole;
  route: string;
  target?: string;
  cursorLabel?: string;
  caption: string;
  action: SceneAction;
  durationMs: number;
  interstitial?: InterstitialInfo;
  beats?: {
    atMs: number;
    action?: SceneAction;
    target?: string;
    selector?: string;
    clickTarget?: string;
    cursorLabel?: string;
    scrollOffset?: number;
    route?: string;
  }[];
};

export const DEMO_SCENES: DemoScene[] = [
  // ── 00. Welcome Screen (Resident Chapter Start) ──────────────────────────
  {
    id: "scene-00-welcome",
    chapter: "resident",
    role: "student",
    route: "/",
    caption: "Welcome to Elogbook by Gothos Labs, for PG students — Powered by AI",
    action: "none",
    durationMs: 4500,
    interstitial: {
      eyebrow: "GOTHOS LABS PRESENTS",
      title: "Welcome to Elogbook by Gothos Labs",
      subtitle: "for pg students. Powered by AI",
      badge: "AI-FIRST CLINICAL TRAINING",
      badgeTone: "teal",
      tagline: "The only PG medical logbook with built-in Arogya clinical intelligence.",
      highlights: [
        "Autonomous Progress Coaching & Real-Time Reminders",
        "One-Click Faculty Reviews & AI Appraisal Drafting",
        "MCI / NMC Compliant Curriculum & Instant Reports"
      ],
      icon: "sparkles"
    }
  },

  // ── 01. Student Dashboard Overview (Scrolling slowly) ───────────────────
  {
    id: "scene-01-dashboard",
    chapter: "resident",
    role: "student",
    route: "/",
    target: "dashboard-progress",
    caption: "Student Dashboard — Training progress, targets & clinical milestones",
    action: "none",
    durationMs: 6500,
    beats: [
      {
        atMs: 2200,
        action: "scrollSlowly",
        scrollOffset: 340
      }
    ]
  },

  // ── 02. Dashboard Bottom & Highlight Clinical Cases Card ────────────────
  {
    id: "scene-02-dashboard-bottom",
    chapter: "resident",
    role: "student",
    route: "/",
    target: "dashboard-card-cases",
    caption: "From your dashboard, tap Clinical Cases to open your logbook",
    action: "none",
    durationMs: 7000,
    beats: [
      {
        atMs: 400,
        action: "scrollSlowly",
        scrollOffset: 650
      },
      {
        atMs: 2200,
        target: "dashboard-card-cases"
      },
      {
        atMs: 3200,
        action: "clickWithCursor",
        target: "dashboard-card-cases",
        cursorLabel: "👆 Tap Clinical Cases"
      },
      {
        atMs: 4600,
        action: "navigate",
        route: "/cases"
      }
    ]
  },

  // ── 03. Log Clinical Case & Add Modal ───────────────────────────────────
  {
    id: "scene-03-caselog",
    chapter: "resident",
    role: "student",
    route: "/cases",
    target: "caselog-add",
    caption: "Log clinical cases — comprehensive history, examination & reflections",
    action: "none",
    durationMs: 9000,
    beats: [
      {
        atMs: 1400,
        action: "clickWithCursor",
        target: "caselog-add",
        cursorLabel: "👆 Tap + Log clinical case"
      },
      {
        atMs: 2600,
        selector: '[role="dialog"]'
      },
      {
        atMs: 7800,
        action: "pressEscape",
        target: "caselog-list"
      }
    ]
  },

  // ── 04. Student Assessments Tab (Explicit Navigation Click) ──────────────
  {
    id: "scene-04-assessments",
    chapter: "resident",
    role: "student",
    route: "/cases",
    target: "nav-assessments",
    caption: "Tap the Assessments tab to view evaluations, scores & ratings",
    action: "none",
    durationMs: 8000,
    beats: [
      {
        atMs: 600,
        action: "clickWithCursor",
        target: "nav-assessments",
        cursorLabel: "👆 Tap Assessments"
      },
      {
        atMs: 1800,
        action: "navigate",
        route: "/assessments"
      },
      {
        atMs: 2500,
        target: "student-assessments-card"
      }
    ]
  },

  // ── 05. Thesis & Research Tab (Explicit Navigation Click) ────────────────
  {
    id: "scene-05-thesis",
    chapter: "resident",
    role: "student",
    route: "/assessments",
    target: "nav-thesis",
    caption: "Tap Thesis to track protocol approval, ethical clearance & milestones",
    action: "none",
    durationMs: 8000,
    beats: [
      {
        atMs: 600,
        action: "clickWithCursor",
        target: "nav-thesis",
        cursorLabel: "👆 Tap Thesis"
      },
      {
        atMs: 1800,
        action: "navigate",
        route: "/thesis"
      },
      {
        atMs: 2500,
        target: "thesis-card"
      }
    ]
  },

  // ── 06. Leave Records & Attendance Tab (Explicit Navigation Click) ────────
  {
    id: "scene-06-leaves",
    chapter: "resident",
    role: "student",
    route: "/thesis",
    target: "nav-attendance",
    caption: "Tap Leave Records to track Casual, Academic & Medical leave balances",
    action: "none",
    durationMs: 8000,
    beats: [
      {
        atMs: 600,
        action: "clickWithCursor",
        target: "nav-attendance",
        cursorLabel: "👆 Tap Leave Records"
      },
      {
        atMs: 1800,
        action: "navigate",
        route: "/attendance"
      },
      {
        atMs: 2500,
        target: "leave-balances-grid"
      }
    ]
  },

  // ── 07. Arogya AI Assistant (What's Due & Progress Coach) ───────────────
  {
    id: "scene-07-arogya",
    chapter: "resident",
    role: "student",
    route: "/",
    caption: "Arogya AI Assistant — ask for 'What's due?' and your personal progress coach",
    action: "none",
    durationMs: 14500,
    beats: [
      { 
        atMs: 600, 
        action: "clickWithCursor", 
        target: "arogya-launcher",
        cursorLabel: "👆 Tap Arogya AI"
      },
      { atMs: 1400, action: "openArogya" },
      { 
        atMs: 2600, 
        action: "clickWithCursor", 
        target: "arogya-whats-due",
        cursorLabel: "👆 Tap 'What's due?'"
      },
      { atMs: 3400, action: "whatsDue" },
      { 
        atMs: 6600, 
        action: "clickWithCursor", 
        target: "arogya-coach",
        cursorLabel: "👆 Tap 'Progress coach'"
      },
      { atMs: 7400, action: "progressCoach" },
      { atMs: 9500, target: "arogya-messages" },
      { atMs: 14000, action: "closeArogya" }
    ]
  },

  // ── 08. Faculty Transition Interstitial ─────────────────────────────────
  {
    id: "scene-08-transition-faculty",
    chapter: "faculty",
    role: "faculty",
    route: "/",
    caption: "Faculty Portal — 100% Free for Faculty & HOD",
    action: "none",
    durationMs: 4000,
    interstitial: {
      eyebrow: "NEXT CHAPTER",
      title: "Faculty & Supervisor Workspace",
      subtitle: "Sequential reviews, mentee logbook inspector & AI appraisals",
      badge: "100% Free for Faculty & HOD",
      badgeTone: "emerald",
      tagline: "Always free for clinical mentors, evaluators, and department leadership.",
      highlights: [
        "Fast review queue with competency grading & 1-click approvals",
        "Mentee Logbook Inspector with deep training volume charts",
        "Arogya AI auto-drafted quarterly appraisal remarks"
      ],
      icon: "stethoscope"
    }
  },

  // ── 09. Faculty Sequential Review Queue ─────────────────────────────────
  {
    id: "scene-09-faculty-review",
    chapter: "faculty",
    role: "faculty",
    route: "/",
    target: "review-first-item",
    caption: "Fast faculty evaluation — review submissions, grade competencies & approve in one click",
    action: "none",
    durationMs: 8000,
    beats: [
      { 
        atMs: 3800, 
        action: "clickWithCursor", 
        target: "review-approve",
        cursorLabel: "👆 Tap Approve & Sign"
      }
    ]
  },

  // ── 10. Student Progress & View Logbook ─────────────────────────────────
  {
    id: "scene-10-faculty-logbook",
    chapter: "faculty",
    role: "faculty",
    route: "/",
    target: "faculty-tab-mentees",
    caption: "Student Progress & Logbook Inspector — deep-dive graphs, charts & training breakdown",
    action: "none",
    durationMs: 10500,
    beats: [
      { 
        atMs: 1000, 
        action: "clickWithCursor", 
        target: "faculty-tab-mentees",
        cursorLabel: "👆 Tap Student Progress"
      },
      { 
        atMs: 2600, 
        action: "clickWithCursor", 
        target: "faculty-view-logbook",
        cursorLabel: "👆 Tap View Logbook"
      },
      { atMs: 3800, selector: '[role="dialog"]' },
      { atMs: 9600, action: "pressEscape" }
    ]
  },

  // ── 11. Add Assessment & Quarterly Appraisal with Arogya ─────────────────
  {
    id: "scene-11-faculty-appraisal",
    chapter: "faculty",
    role: "faculty",
    route: "/assessments",
    target: "appraisal-draft",
    caption: "Quarterly Appraisal — Arogya AI generates structured evaluation remarks in seconds",
    action: "none",
    durationMs: 9500,
    beats: [
      { 
        atMs: 1500, 
        action: "clickWithCursor", 
        target: "appraisal-draft",
        cursorLabel: "👆 Tap Draft with Arogya"
      },
      { atMs: 2300, action: "appraisalDraft" },
      { atMs: 4600, target: "appraisal-remarks" }
    ]
  },

  // ── 12. HOD Transition Interstitial ─────────────────────────────────────
  {
    id: "scene-12-transition-hod",
    chapter: "hod",
    role: "hod",
    route: "/roster",
    caption: "HOD Portal — Leadership oversight & AI department reports, completely free",
    action: "none",
    durationMs: 4000,
    interstitial: {
      eyebrow: "FINAL CHAPTER",
      title: "Head of Department (HOD) Portal",
      subtitle: "Department oversight, curriculum config & AI reports",
      badge: "100% Free for Faculty & HOD",
      badgeTone: "cyan",
      tagline: "Full institutional control at zero cost for academic leadership.",
      highlights: [
        "Curriculum requirements builder with custom procedure targets",
        "Faculty assignment & resident approval administration",
        "Instant NMC-compliant department summary reports generated by Arogya"
      ],
      icon: "award"
    }
  },

  // ── 13. HOD Department Dashboard Overview ───────────────────────────────
  {
    id: "scene-13-hod-roster",
    chapter: "hod",
    role: "hod",
    route: "/roster",
    target: "hod-stats-grid",
    caption: "Department overview — resident compliance, pending verifications & targets",
    action: "none",
    durationMs: 6500,
    beats: [
      {
        atMs: 2200,
        action: "scrollSlowly",
        scrollOffset: 280
      }
    ]
  },

  // ── 14. Requirements Builder Tab ────────────────────────────────────────
  {
    id: "scene-14-hod-requirements",
    chapter: "hod",
    role: "hod",
    route: "/roster",
    target: "hod-tab-requirements",
    caption: "Requirements Builder — tailor procedure counts & competencies to your curriculum",
    action: "none",
    durationMs: 7500,
    beats: [
      { 
        atMs: 1200, 
        action: "clickWithCursor", 
        target: "hod-tab-requirements",
        cursorLabel: "👆 Tap Requirements"
      },
      { atMs: 2800, target: "requirements-editor" }
    ]
  },

  // ── 15. Administration (Pending Students & Faculty) ──────────────────────
  {
    id: "scene-15-hod-admin",
    chapter: "hod",
    role: "hod",
    route: "/roster",
    target: "hod-pending-students",
    caption: "Department Administration — 1-click approvals for new students and faculty",
    action: "none",
    durationMs: 7500,
    beats: [
      { 
        atMs: 1400, 
        action: "clickWithCursor", 
        target: "hod-pending-students",
        cursorLabel: "👆 Tap Student Access"
      },
      { atMs: 3000, target: "hod-add-faculty" }
    ]
  },

  // ── 16. Arogya Department Summary Report ─────────────────────────────────
  {
    id: "scene-16-hod-arogya",
    chapter: "hod",
    role: "hod",
    route: "/roster",
    caption: "Arogya AI Department Report — instant analysis of training gaps and achievements",
    action: "none",
    durationMs: 10000,
    beats: [
      { 
        atMs: 800, 
        action: "clickWithCursor", 
        target: "arogya-launcher",
        cursorLabel: "👆 Tap Arogya AI"
      },
      { atMs: 1500, action: "openArogya" },
      { atMs: 2500, action: "departmentReport" },
      { atMs: 4000, target: "arogya-messages" },
      { atMs: 9500, action: "closeArogya" }
    ]
  }
];

export const CHAPTERS: { id: DemoChapter; label: string }[] = [
  { id: "resident", label: "Resident" },
  { id: "faculty", label: "Faculty" },
  { id: "hod", label: "HOD" },
];

export function getChapterShares(): Record<DemoChapter, number> {
  const totals: Record<DemoChapter, number> = {
    resident: 0,
    faculty: 0,
    hod: 0,
  };

  let grandTotal = 0;
  for (const scene of DEMO_SCENES) {
    totals[scene.chapter] = (totals[scene.chapter] || 0) + scene.durationMs;
    grandTotal += scene.durationMs;
  }

  return {
    resident: grandTotal ? totals.resident / grandTotal : 0.33,
    faculty: grandTotal ? totals.faculty / grandTotal : 0.33,
    hod: grandTotal ? totals.hod / grandTotal : 0.34,
  };
}

export function getTotalMovieDurationMs(): number {
  return DEMO_SCENES.reduce((sum, s) => sum + s.durationMs, 0);
}
