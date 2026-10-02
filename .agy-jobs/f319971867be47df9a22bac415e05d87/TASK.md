# Antigravity dispatch 83 — Demo auto-movie: foundation (unlock, demoSession.ts, canned Arogya responses)

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-01,
working branch `feat/demo-auto-movie` (already checked out, cut from `main` at `fca9553`). If this is not
that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

`AGENTS.md` §1 describes a pull-before-task git ritual. **Skip it entirely.** Claude Code already did it
and the branch is ready. Do not look anything up with a shell. Every fact you need is in this prompt, in
`CURRENT_TASK.md`, or in a file you can view.

## Read first
- `AGENTS.md` (repository root) — §5, §7, §8, §9, §10. Its §16 rule map translates tooling's section numbers.
- `CURRENT_TASK.md` (repository root) — the confirmed scope. Read `## Feature`, `## Facts established during planning`, `## Execution-session findings and developer rulings`, `## Files/areas in scope`, `## Explicitly out of scope` and `## Do NOT touch`.
- `artifacts/mockup-sandbox/src/components/LoginPage.tsx` — the whole file. The demo login is `handleDemoLogin` (about lines 97-131), the PIN gate is `PIN_ENV_MAP` plus the `pinPortalKey` / `pinValue` / `pinError` state and the PIN screen JSX (about lines 303-390).
- `artifacts/mockup-sandbox/src/lib/session.ts`, `artifacts/mockup-sandbox/src/lib/demoSounds.ts` (`unlockDemoAudio`), `artifacts/mockup-sandbox/src/lib/demoDepartments.ts` (`getActiveDemoDepartmentId`, `DEMO_DEPARTMENT_CHANGED_EVENT`) — read-only.
- `artifacts/mockup-sandbox/src/lib/demoData.ts` — the whole file. `handleDemoRequest` starts near line 99.
- The four call sites of the Arogya endpoints, read-only, to learn the request and response shapes: `artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx` (the `/api/arogya/ask`, `/api/arogya/progress-coach` and `/api/arogya/department-report` calls, about lines 100, 118 and 136) and `artifacts/mockup-sandbox/src/components/QuarterlyAppraisalSection.tsx` (the `/api/arogya/appraisal-draft/:studentId` call, about line 141). Note the HTTP method each call uses and exactly which response fields each component reads.
- `HANDOFF.md` (repository root) — you copy it in Build item 1, then overwrite it in Build item 5.

## Build
- [ ] **1. Preserve the previous handoff.** Create `.agents/runs/handoff-hod-requirements-layout.md` as a **verbatim, character-for-character copy** of the current root `HANDOFF.md` (about 13 KB, a report on the HOD Requirements tab layout rebuild). View `HANDOFF.md` in full, write its exact content to the new path, then view the new file and confirm it matches. Do this **before** Build item 5 touches `HANDOFF.md`.
- [ ] **2. Create `artifacts/mockup-sandbox/src/lib/demoSession.ts`** (new file). It exports:
  - `export type DemoRole = "student" | "faculty" | "hod";`
  - `export const DEMO_SESSION_CHANGED_EVENT = "arogya-demo-session-changed";`
  - `export function startDemoSession(role: DemoRole): void`. Take the body of `handleDemoLogin` in `LoginPage.tsx` and extract it **unchanged in substance**: the same role, email and name maps (`student`→role `student`, `faculty`→role `professor`, `hod`→role `hod`; the same three emails and names), the same user object (`id: 999`, `token: "demo-token"`, `isDemoMode: true`, `studentProfileId: 1` for the student only), then `clearMaintenanceNoticeSession()`, `saveToken(user.token)`, and the two `window.sessionStorage.setItem` writes for `elogbook-user` and `elogbook-login-summary-pending`. Differences from `handleDemoLogin`: no `async`, no artificial delay, no `onSignIn()` and no `toast` (the caller does those). One deliberate change: for `departmentId`, use the visitor's active demo department so a later role change does not reset it. Read `getActiveDemoDepartmentId` in `lib/demoDepartments.ts` and use its value when it is a valid integer, otherwise `1` as today. If you find this is not safe (for example, the stored user's `departmentId` and the active-department store are kept in sync some other way), keep `1` exactly as today, and say so in `HANDOFF.md`. After the two storage writes, dispatch `window.dispatchEvent(new CustomEvent(DEMO_SESSION_CHANGED_EVENT, { detail: role }))`.
  - Movie-flag helpers backed by `window.sessionStorage` under the key `elogbook-demo-movie`: `setDemoMovieActive(): void` (stores `"true"`), `isDemoMovieActive(): boolean`, `clearDemoMovie(): void` (removes the key). **Every read and write in these three is wrapped in try/catch** and fails quietly (`isDemoMovieActive` returns `false` when storage is unavailable).
  - Keep it small. No other exports. No `console.*` calls.
- [ ] **3. Rewire `artifacts/mockup-sandbox/src/components/LoginPage.tsx`.**
  - Delete `PIN_ENV_MAP`, the `pinPortalKey`, `pinValue` and `pinError` state, their resets inside `goBack`, the whole PIN screen JSX, and every per-portal `Lock` icon. After this edit **no reference to `VITE_DEMO_FACULTY_PIN` or `VITE_DEMO_HOD_PIN` remains anywhere under `artifacts/mockup-sandbox/src`** (search to confirm). Do **not** edit any `.env*` file.
  - Replace the three demo portal buttons (the `DEMO_PORTALS` list and the buttons built from it) with **one** primary button labelled **Show demo**, with one short supporting line beneath it (plain product copy, for example "A guided tour of the logbook. No sign-in needed." — keep it short and make no clinical or regulatory claim). Keep the visual language of the surrounding screen (same button component and spacing conventions already used on this page). Remove `DEMO_PORTALS` and any state, helper or import that becomes unused as a result (for example `Lock`, `GraduationCap`, `Users`, `ShieldCheck`, and the `InputOTP*` imports **only if** nothing else in the file still uses them — search before you delete; the forgot-password flow may still use `InputOTP`).
  - The button's click handler: call `unlockDemoAudio()`, then `startDemoSession("student")`, then `setDemoMovieActive()`, then `onSignIn()`. Wrap it so that if anything throws, the existing `toast.error(...)` pattern reports it, and a boolean loading state stops a double click. No artificial delay.
  - The `Mode` type and the back navigation (`goBack`) must still work for the picker, demo and login screens. The **real** login, forgot-password and payment flows are **not** touched in any way.
- [ ] **4. Canned Arogya responses in `artifacts/mockup-sandbox/src/lib/demoData.ts`.** In `handleDemoRequest`, add branches for the four Arogya endpoints, using the HTTP method each call site really uses (check the call sites; the existing code puts `GET` branches first and `POST`/`PATCH` mutation branches after, and its `GET` fallback returns `[]`):
  - `/api/arogya/ask`
  - `/api/arogya/progress-coach`
  - `/api/arogya/department-report`
  - `/api/arogya/appraisal-draft/:studentId` (use the existing `requestedStudentId(path)` helper for the id)

  Rules for these:
  - **Shape.** Return exactly the shape the calling component already parses, field names and types included, so that **no component needs to change**. If a component reads a field you cannot fill from demo data, stop and report (Hard stops below).
  - **Source of the numbers.** The text is derived from numbers already in the demo data: use the existing helpers and data (`buildProgress`, `getDemoResident`, `demoData.hodAnalytics`, `demoData.students`, and whatever the file already uses for targets and percentages), computed for the **active** demo department. Do **not** hardcode a department, a procedure name, a target or a count (`AGENTS.md` §5). Every number in a response must come from the demo data.
  - **Wording.** Plain progress, coaching and summary language built from counts, targets and percentages only. **No** clinical definition, diagnosis, treatment or drug advice, **no** MCI/NMC requirement wording, no invented statistic, no patient-level detail (no UHID, complaint, history, examination or diagnosis text) and no leave reasons (`AGENTS.md` §7, §8). Be modest: a response that says less is better than one that says something you had to invent.
  - **Ask.** Export a constant `DEMO_MOVIE_ASK_QUESTION` from `demoData.ts`. It must be a short, natural question a resident could ask about their own progress (for example about how they stand against their procedure or case targets) that your `ask` branch answers using real demo numbers. Do **not** phrase it around a quarterly target unless the demo data actually has a per-quarter target; if it does not, ask about overall progress against targets. Match intent by a few lowercase keywords (for example procedures, cases, overall progress). For any other question, return a short neutral reply that says Arogya answers from sample data in this demo and suggests asking about procedure or case progress. Do not make up an answer.
  - **Progress coach** gives short, encouraging, number-based coaching for the resident. **Department report** gives a short, number-based summary for the HOD (resident count, approval or pending counts, overall progress), using only what `demoData.hodAnalytics` and `demoData.students` hold. **Appraisal draft** gives short quarterly remarks for the resident, number-based, in neutral supervisory wording, with no clinical content.
  - No `console.*` calls, no logging. Keep the existing `await` mock delay at the top of `handleDemoRequest` as it is.
  - Do not change any existing branch of `handleDemoRequest`.
- [ ] **5. Write `HANDOFF.md`** at the repository root (overwrite it, now that item 1 has preserved the old one). Start it with `# Handoff Report: Demo auto-movie`, base commit `fca9553`, branch `feat/demo-auto-movie`, then a `## Dispatch 83` section. Later dispatches append their own sections, so keep this one self-contained.

## Do NOT touch
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`. The demo interception stays exactly as it is.
- Anything under `artifacts/api-server/`, `lib/db/`, any migration or schema.
- `.env`, `.env.local`, any `.env*` file, and any `VITE_*` value. Removing PIN usage **from code** is fine.
- `package.json`, `pnpm-lock.yaml` and any lockfile. No new dependency.
- The real login, forgot-password and payment flows in `LoginPage.tsx`, and `PaymentStep.tsx`.
- `artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx` and `artifacts/mockup-sandbox/src/components/QuarterlyAppraisalSection.tsx` (read-only in this dispatch), `HODPortal.tsx`, `App.tsx`, `AppLayout.tsx`, `DemoBanner.tsx`, `GuidedTour.tsx`, `LegalDisclaimerModal.tsx`, `lib/demoDepartments.ts`, `lib/session.ts`, `lib/demoSounds.ts`.
- Any `data-tour` attribute. Those come in dispatch 84.
- Reformatting, renaming or tidying anything not named under Build.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any canned response or caption that would need clinical, diagnostic or MCI/NMC requirement wording, or a number that is not in the demo data. Stop, say what was needed, and write that in `HANDOFF.md`. Never invent it (`AGENTS.md` §7).
- A component reads a response field you cannot fill from demo data.
- Any change that looks necessary in `apiClient.ts`, `api-server`, a server route or any ownership logic (`AGENTS.md` §3, §4).
- Any new dependency, env file edit or `VITE_*` change.
- Any value you would otherwise guess or invent.
- If a line number in this prompt does not match the file, say so in `HANDOFF.md` and use the real one.

## Report
`HANDOFF.md` is the report, per Build item 5. Under `## Dispatch 83` give: what changed per file with line numbers and why; for Build item 4, the exact request path, method, and response fields for each of the four endpoints, and which demo-data fields feed each number; anything you skipped and why; anything you expanded beyond Build and why; unprompted observations. State plainly that you ran no commands (no shell access), so typecheck, build and grep checks are run by Claude Code afterwards. A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Claude Sonnet 4.6 (Thinking)`. (Standing rule: on a 429 `RESOURCE_EXHAUSTED` quota block, re-dispatch on `Gemini 3.1 Pro (High)` and record the substitution below.)


## Files you may touch
- HANDOFF.md
- .agents/runs/handoff-hod-requirements-layout.md
- artifacts/mockup-sandbox/src/lib/demoSession.ts
- artifacts/mockup-sandbox/src/lib/demoData.ts
- artifacts/mockup-sandbox/src/components/LoginPage.tsx