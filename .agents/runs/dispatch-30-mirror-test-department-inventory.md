# Antigravity dispatch 30 — Mirror test department (inventory only)

job_id (attempt 1): 6c1ac278714d439a99db564e6929fa64 — model: Claude Opus 4.6 (Thinking)
outcome (attempt 1): BLOCKED — not a content/prompt issue. stderr: "error: Individual quota
  reached. Please upgrade your subscription to increase your limits. Resets in 42h51m11s."
  git_guard confirms zero files changed.
job_id (attempt 2): fb0c15a1837e473ea61c2f41baf5222b — model: Gemini 3.1 Pro (High),
  developer-directed downgrade from the Opus-tier CURRENT_TASK.md suggestion, to work
  around the Opus quota block above (developer chose "use gemini" over waiting ~43h).
outcome (attempt 2): DONE. Wrote HANDOFF.md only (git_guard: zero other changes). Claude
  Code independently re-verified every file:line claim in HANDOFF.md against the actual
  source (department.ts, admin.ts, superadmin.ts, department-provisioning.ts, student.ts,
  professor.ts, migrations.ts, and a repo-wide grep for `enabledFeatures`) — all matched
  exactly. HALT point reached per CURRENT_TASK.md Order step 2; waiting on developer
  go-ahead before dispatching steps 3-5 (schema/migration/code changes).
workdir: D:\Electronic-LogBook-main
branch: feature/mirror-test-department (cut fresh off main @ ef6c740)
model: Claude Opus 4.6 (Thinking)
allowed_paths:
- artifacts/api-server/src/
- lib/db/src/
- lib/db/migrations/
- HANDOFF.md

## Guard
This prompt is for the project "Electronic-LogBook" (Arogya platform, Pediatrics pilot),
task file `CURRENT_TASK.md` at the repo root, feature "mirror test department". If this is
not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

The branch is already prepared and checked out for you (`feature/mirror-test-department`,
cut from `main` @ `ef6c740`). Do not check out, create, or switch any branch.

## Read first
- `AGENTS.md` — all sections; §16 is a rule-map table (cited section numbers below refer to
  this file's own numbering, already resolved through that table)
- `CURRENT_TASK.md` — the confirmed scope, specifically `## Files/areas in scope`,
  `## Explicitly out of scope`, `## Do NOT touch`, and `## Agent` items 1–2

## Build
This dispatch is investigation and reporting ONLY. No source file may be modified.

- [ ] Report whether a column or concept named `enabledFeatures` exists anywhere in the
      department settings schema (search `lib/db/src/schema/` and any related config
      schema files) on this branch.
- [ ] Report the last (final) filename currently listed in the `files` array in
      `lib/db/src/migrations.ts`.
- [ ] Build a full inventory: every read and every write of `department_configs`,
      `procedure_types`, and `department_catalog` anywhere in the codebase (schema
      definitions, route handlers, services, helpers — not just `routes/department.ts`),
      plus every place a list of departments is returned to a client (`GET
      /api/departments` and any other endpoint that lists or enumerates departments).
      List each as `file:line` with a one-line description of what that site does (read or
      write, of which table, in what route/function).
- [ ] Write the two report answers above and the full inventory into `HANDOFF.md` at the
      repo root, organized under clear headings.

## Do NOT touch
- Any query selecting rows from `users`, `students`, `assignments`, `case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, or
  `appraisals` — do not even list these in the inventory; they are explicitly out of scope
  for the whole feature, not just this dispatch.
- `users_one_approved_hod_per_department` unique index.
- `provisionDepartment()` in `lib/department-provisioning.ts`.
- Anything in `routes/superadmin.ts`.
- `HODPortal.tsx` or any other frontend file.
- Any branch other than `feature/mirror-test-department` — do not read from or reference a
  Dermatology/`enabledFeatures` branch if one is visible locally.
- `.env`, `TASK_LOG.md`, `STATUS.md`, `CURRENT_TASK.md` (read-only — do not edit it).
- Any file whatsoever other than `HANDOFF.md`. This dispatch makes zero code changes —
  schema, migration, helper, and route edits are a separate, later dispatch that happens
  only after the developer reviews this inventory.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated (§4 / rule-map §5.1).
- Any schema change, migration, or backfill (§6) — none is in scope for this dispatch;
  report only.
- Any new department-specific behaviour that should be configuration (§5).
- Anything that puts patient text or leave reasons near a log, error, or audit trail (§8).
- Any secret, credential, or `.env` value (§10, §13).
- The task turning out to be more than one feature (§9).
- Any value you would otherwise guess or invent — if a site's purpose is unclear, say so in
  the inventory rather than guessing.

## Report
Write `HANDOFF.md` at the repo root:
- The two report answers (`enabledFeatures` existence; last migration filename).
- The full inventory, `file:line` plus one-line description per site, grouped by table
  (`department_configs`, `procedure_types`, `department_catalog`) and then by
  department-listing endpoints.
- Anything you skipped, and why (including anything you could not check because it would
  have required a shell command).
- Anything you noticed that looked relevant but fell under `## Do NOT touch` above — name
  it, do not act on it.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`. Do not edit any file other than `HANDOFF.md`.
