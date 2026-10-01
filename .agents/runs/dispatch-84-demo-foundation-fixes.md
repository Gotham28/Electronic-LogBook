# Antigravity dispatch 84 — Demo auto-movie: fixes to dispatch 83

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-01,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatch 83's
uncommitted edits in the working tree. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

Skip the `AGENTS.md` §1 pull-before-task ritual; Claude Code already did it. Every fact you need is in this
prompt or in a file you can view.

## Read first
- `AGENTS.md` (repository root) — §5, §7, §8, §9.
- `HANDOFF.md` (repository root) — the `## Dispatch 83` section describes what dispatch 83 did. You append a section to it.
- `artifacts/mockup-sandbox/src/components/LoginPage.tsx` — the whole file.
- `artifacts/mockup-sandbox/src/lib/demoData.ts` — `handleDemoRequest` and the four Arogya branches dispatch 83 added (about lines 165-215).
- `artifacts/mockup-sandbox/src/lib/demoDepartments.ts` — read-only. Look at `createAnalytics` (about line 574) and the `demoData` object (about line 707).

Claude Code ran `pnpm --filter @workspace/mockup-sandbox typecheck` after dispatch 83 and verified the diff. It found the problems below. Fix exactly these and nothing else.

## Build
- [ ] **1. LoginPage.tsx — restore a deleted line (this is a syntax error that breaks the file).** Dispatch 83's edit deleted the declaration of the real sign-in handler. Typecheck reports `src/components/LoginPage.tsx(443,1): error TS1128: Declaration or statement expected.` Under the comment line `// ── Real sign-in ─────...` the file now goes straight to `event.preventDefault();`. Restore, between that comment line and `event.preventDefault();`, exactly one blank line followed by this exact line (two-space indent):
  `  const signIn = async (event: React.FormEvent) => {`
  The comment, the blank line, the `const signIn` line, then `    event.preventDefault();` and the rest of the function body must be as they were before dispatch 83. Then view the whole real sign-in function, from `const signIn` to its closing `};`, and confirm that its braces balance, that its body is untouched, and that `signIn` is still referenced by the real login form's `onSubmit`. **Do not change anything else in the real sign-in, forgot-password or payment code.** While the file is open, also check that nothing else in the file lost a line it should have kept (compare with the Read-first description; the only intended deletions were the PIN and demo-portal code).
- [ ] **2. demoData.ts — department report, "falling_behind" branch.** It currently reads `demoData.hodAnalytics.studentsAtRisk`. That field does **not** exist at runtime: the `hodAnalytics` getter on `demoData` returns `createAnalytics(...)`, whose keys are `totalStudents`, `avgCompletion`, `logStats` (`pending`, `verified`, `rejected`), `topProcedures` and `students`. So the reply would read "There are currently undefined students...". Instead count the residents whose `shortfallStatus` (on each item of `demoData.students`) is `"at_risk"` or `"behind"`, and use that number. Keep the existing wording style and the singular/plural handling. If that count is 0, say that no residents are currently flagged as behind their targets in the sample data.
- [ ] **3. demoData.ts — department report, default ("report") branch.** Keep `totalStudents`, `logStats.verified` and `logStats.pending` (they exist). Also add the department's average completion from `demoData.hodAnalytics.avgCompletion` as one more sentence, for example "Average completion against targets is N%."
- [ ] **4. demoData.ts — progress coach and ask.** Two wording problems:
  - The coach tip says "You have logged X of your Y required clinical cases", but `verified.cases` is the **verified** count. Change "logged" to "verified" so the text is true. Check the ask reply and the appraisal remarks for the same slip and fix any you find.
  - `overallCompletion` can be `null` (a department with no targets). Do **not** print "0%" in that case. In the ask reply, the coach tip and the appraisal remarks, build the "overall completion" sentence only when `overallCompletion` is a number; otherwise leave that sentence out. Where a target (`targets.cases` or `targets.procedures`) is `null`, leave that sentence out too (the code already does this for ask and coach; make the appraisal remarks do the same).
  - The coach's last tip, "Focus on getting your pending logs verified by your supervisor.", assumes pending logs exist. Only include it when the same resident has at least one log with `status === "pending"` in `getDemoResident(...).logs` (cases, procedures, academics or clinicalWorks). Use the same resident the other numbers come from (`demoData.students[0]`'s id, via `getDemoResident`). If you include it, you may state the pending count.
- [ ] **5. HANDOFF.md — append** a `## Dispatch 84 (fixes to dispatch 83)` section at the end of the file. Do not edit the existing `## Dispatch 83` section except to add one line at its end saying it was corrected by dispatch 84. In the new section list each fix with file and line numbers, and the exact text of the restored `signIn` line.

## Do NOT touch
- Everything not named in Build. In particular: `artifacts/mockup-sandbox/src/lib/demoSession.ts`, `artifacts/mockup-sandbox/src/lib/apiClient.ts`, `artifacts/mockup-sandbox/src/lib/demoDepartments.ts`, `ArogyaPanel.tsx`, `QuarterlyAppraisalSection.tsx`, `App.tsx`, `AppLayout.tsx`, `DemoBanner.tsx`, `HODPortal.tsx`.
- The real sign-in, forgot-password and payment logic in `LoginPage.tsx` (beyond restoring the one deleted line in item 1).
- Anything under `artifacts/api-server/`, `lib/db/`, any `.env*` file, `package.json` or a lockfile.
- No reformatting, renaming or tidying of anything you were not told to change.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any wording that would need clinical, diagnostic or MCI/NMC requirement wording, or a number that is not in the demo data. Never invent it (`AGENTS.md` §7).
- If a line number here does not match the file, say so in `HANDOFF.md` and use the real one.
- Any change that looks necessary outside the three files you may edit (`LoginPage.tsx`, `demoData.ts`, `HANDOFF.md`).
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report (Build item 5). State plainly that you ran no commands (no shell access), so typecheck is run by Claude Code afterwards. A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` is quota-blocked (429 `RESOURCE_EXHAUSTED`, reset about 18h from 17:29 UTC on 2026-10-01; seen on dispatch 83's first attempt), so per the standing rule this runs on Gemini directly. A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.
