# Evidence for the demo auto-movie task (staged by Claude Code, from its own runs on 2026-10-01 / 2026-10-02)

Every item below was run by Claude Code in its own shell or in a Playwright-driven Chrome against `pnpm --filter @workspace/mockup-sandbox run dev` (Vite, http://localhost:5173), on branch `feat/demo-auto-movie`, after dispatch 90. None of it is an Antigravity claim.

## Static checks
- `pnpm --filter @workspace/mockup-sandbox typecheck` → `$ tsc -p tsconfig.json --noEmit`, no errors, **exit 0** (re-run after every dispatch; the last run was after dispatch 90).
- `pnpm --filter @workspace/mockup-sandbox build` → `✓ built in 13.50s`, **exit 0**. Only the usual chunk-size warning (`index-DUx1lp_I.js 1,445.68 kB`).
- `grep -rn "VITE_DEMO_.*_PIN" artifacts/mockup-sandbox/src` → no output, **exit 1** (no match).
- `git diff --name-only main | grep -E "api-server|apiClient\.ts|package\.json|pnpm-lock|\.env"` → no output, **exit 1** (no match).
- `git diff --stat main` (tracked files only; new files are untracked and listed below):

```
 HANDOFF.md                                         | 458 +++++++++++++--------
 artifacts/mockup-sandbox/src/App.tsx               |   7 +-
 .../mockup-sandbox/src/components/Dashboard.tsx    |   2 +-
 .../src/components/DepartmentSettings.tsx          |   2 +-
 .../mockup-sandbox/src/components/HODPortal.tsx    |   2 +-
 .../mockup-sandbox/src/components/LoginPage.tsx    | 232 ++---------
 .../src/components/ProfessorPortal.tsx             |   5 +-
 .../src/components/QuarterlyAppraisalSection.tsx   |  92 ++++-
 .../src/components/arogya/ArogyaPanel.tsx          | 117 +++++-
 .../src/components/layout/AppLayout.tsx            |  12 +
 .../src/components/layout/DemoBanner.tsx           |  77 +++-
 .../src/components/pages/CaseLogsPage.tsx          |   4 +-
 artifacts/mockup-sandbox/src/lib/demoData.ts       |  98 +++++
 13 files changed, 700 insertions(+), 408 deletions(-)
```

- New untracked files: `.agents/runs/handoff-hod-requirements-layout.md` (byte-identical to `HEAD:HANDOFF.md`, checked with `git show HEAD:HANDOFF.md | cmp - …`), `artifacts/mockup-sandbox/src/lib/demoSession.ts`, `artifacts/mockup-sandbox/src/components/demo-movie/{DemoMovie.tsx,DemoTypedText.tsx,EndCard.tsx,MovieControls.tsx,movieBridge.ts,scenes.ts}`, plus run records and `CURRENT_TASK.md`.

## Browser runs (Playwright, Chrome)
Screenshots are in `.agents/runs/shots/` (untracked evidence): `d3-NN-<scene>.png` desktop, `m-NN-<scene>.png` mobile, `d3-30-reduced-motion-end.png`, `d3-21-skip-endcard.png`, `d3-20-replay-scene2.png`.

**Desktop 1440×900, fresh storage (localStorage and sessionStorage cleared), motion on**
- Login page → "Explore the Demo" → the demo screen shows one button, "Show demo". No PIN or access-code text on the page (`getByText(/access code|PIN/i)` count 0). Clicking Show demo started the app.
- Legal disclaimer: with the disclaimer open, `document.querySelectorAll('[data-testid="demo-movie-root"]').length` was `0` (the movie renders nothing while blocked). A normal (non-forced) Playwright click on "I Accept and Agree" succeeded, and the movie started.
- Chapter and scene timeline (seconds after Accept): 0 `scene-01-dashboard` (student, `/`), 7 `scene-02-caselog` (`/cases`), 15 `scene-03-ask`, 28 `scene-04-coach`, 36 `scene-05-review` (professor, `/`), 48 `scene-06-appraisal` (`/assessments`), 63 `scene-07-hod-overview` (hod, `/roster`), 73 `scene-08-hod-reqs`, 81 `scene-09-hod-report`, 93 `ENDED` (end card). Total **94 s**, no input from the visitor.
- AI scenes: Ask answer typed in with the label "Sample AI output"; coach tips typed in with the label; the appraisal draft filled the "Faculty remarks" box with `The resident has completed 78% of their overall targets. They have 119 verified cases and 63 verified procedures.` and showed "Sample AI output" under it (the Remediation box also filled); the HOD department report typed in with the label.
- Network: a `page.on('request')` listener registered before the first navigation recorded **0 requests whose URL contains `/api/`** for the whole run. `browser_network_requests` with filter `/api/` returned an empty list for the session (636 static requests not shown).
- Console: 0 errors and 0 page errors during the run.
- Scene 5: the queue count went from "Item 1 of 21" to "Item 1 of 20" after the movie clicked approve (demo data only).
- End card: heading "That was Arogya in about 90 seconds", buttons Replay and Explore the demo yourself.

**Replay, Skip, Explore (desktop)**
- Replay from the end card (role HOD): within 3.5 s the session role was `student`, the scene was `scene-01-dashboard`, path `/`; at 9 s it was `scene-02-caselog`, `/cases`.
- Skip clicked mid-movie (scene 2): phase `ended`, end card visible, no case dialog left open (only the end card's own `role="dialog"`).
- Explore: `[data-testid="demo-movie-root"]` count 0, `sessionStorage['elogbook-demo-movie']` null, role `student`, path `/`.
- Role switcher in free play (also repeated at 375 px): Resident → HOD → Faculty → Resident: session roles `hod`, `professor`, `student`; paths `/roster`, `/`, `/`; the select value followed; 0 toasts. Banner controls measured 94×44, 286×44, 134×44, 127×44 and 38×44 px (Demo role, Demo department, Replay demo, Reset demo, sound toggle).

**Reduced motion** (`prefers-reduced-motion: reduce` emulated, `matchMedia(...).matches === true`), started with the banner's "Replay demo" button: timeline 0 `scene-01`, 7 `scene-02`, 16 `scene-03`, 28 `scene-04`, 36 `scene-05`, 48 `scene-06`, 62 `scene-07`, 72 `scene-08`, 80 `scene-09`, 92 `ENDED`. Total 93 s. 0 `/api/` requests, 0 errors. The only console warning is framer-motion's own "You have Reduced Motion enabled" notice.

**Mobile 375×812**, fresh storage: the movie completed in **94 s** through the same nine scenes, 0 `/api/` requests, 0 errors. Measured on every scene: the caption box `[x,y,w,h]` was `[8,669,344,67]` for scenes 1-4 and `[8,643,344,93]` for scenes 5-9, so its bottom edge was y=736; the `MobileBottomNav` top edge was y=750 (`[1,750,358,61]`). The caption never overlaps the bottom nav (14 px gap). `document.documentElement.scrollWidth` 360 vs `innerWidth` 375: no horizontal overflow. Skip button `[285,29,59,44]` (44 px high). The caption does cover the Arogya launcher button (`[287,679,56,56]`) on mobile; dispatch 91 narrows the caption to fix that.

## Defects found by these runs and fixed by dispatches 84, 86, 89, 90
1. `LoginPage.tsx` lost its `const signIn` line (TS1128). 2. Wrong demo text (`studentsAtRisk` undefined, "logged" for verified, `0%` for null). 3. `ArogyaPanel.tsx` TS7030, collateral edits in `ProfessorPortal.tsx` (deleted comment, `text-emerald-500` → `-50`), wrong or extra `data-tour` anchors, extra wrapper `<div>`s in the real-mode DOM. 4. The movie stalled after a route change (effect not re-run), and rendered a full-screen blocking layer over the legal disclaimer (visitor could not accept). 5. The end card was not clickable (`pointer-events`). 6. Typed text skipped a word and ended in "undefined". 7. The demo had no `GET /api/appraisals/students` handler, so the appraisal form never rendered. 8. The progress bar covered dialog titles.

## Things Claude Code noticed and did not fix (for the review and the developer)
- Each play of the movie approves one more case in the in-memory demo data (the verified-cases count in the AI text was 118 on a fresh page load, 119 after the movie's approve in the same run, and 120 in a replay that did not reload the page). A page reload resets it.
- The Arogya reveal types each coach tip in parallel, not one after another.
- Re-opening the Arogya panel in free play retypes old replies (the message list remounts).
- `AGENTS.md` §14.2 still routes scoping and the decision step through Claude Chat; `~/.claude/CLAUDE.md` overrides it, so this is only a stale-doc follow-up.
- Untested by Claude Code: a real phone, a projector-sized screen, Safari, and any real (non-demo) login flow (there is no backend here). The task's Manual checklist covers the first two.
