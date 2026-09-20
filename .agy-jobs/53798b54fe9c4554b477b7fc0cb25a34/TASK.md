# Antigravity dispatch 23 — Hard-delete for students and faculty

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), task file
`CURRENT_TASK.md` at the repo root, dated 2026-09-16, branch
`feature/hard-delete-students-faculty` (cut fresh off `main`). If this is not that repo,
stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. That pull-before-task step is Claude Code's
own job, already done in its own shell before this dispatch was sent — it is not yours to
repeat, and it does not conflict with this constraint. If you are tempted to run a shell
command for any reason, don't; use file-reading tools instead (view a file, list a
directory, search file contents). Do the entire task using only file-reading and
file-editing tools.

## Read first
- `AGENTS.md` — §3 ownership/clinical tables, §4 the two ID systems, §6 irreversible
  changes, §8 no patient text near logs, §16 rule map (this file's own section numbers are
  non-standard — trust §16)
- `CURRENT_TASK.md` — the confirmed scope, including the `## Explicit developer decisions`
  section. Read that section carefully before writing any code — it documents deliberate,
  explicitly-confirmed destructive behavior that is not a mistake to soften or second-guess.
- `TASK_LOG.md`'s 2026-09-14 entry ("compact dashboard layout and add delete-department") —
  the closest precedent in this codebase for a careful ordered-cascade delete, including what
  went wrong across its fix rounds (FK-order violations, an incomplete table list). Learn
  from those specific mistakes rather than repeating them.

## Build
Full detail is in `CURRENT_TASK.md`'s `## Files/areas in scope` section — read it in full.
Summary:
- [ ] Investigate `lib/db/src/schema/*.ts` yourself to find every table/column referencing a
  student (as `studentId`) or a professor (as a reviewer/verifier/supervisor column) across
  case logs, procedure logs, academic logs, leave records, postings, research, assessments,
  attendance, certifications, thesis milestones, appraisals, audit, assignments/assignment
  recipients, and any other table you find that references `usersTable`/`studentsTable`. Do
  not assume the list in `CURRENT_TASK.md` is complete or that every named table is actually
  relevant — verify each one against the real schema.
- [ ] Add `DELETE /students/:id/hard` and `DELETE /professors/:id/hard` (or one combined
  route, your call) to `artifacts/api-server/src/routes/admin.ts`, HOD-only, scoped to
  `req.user!.departmentId!`, following the exact cascade rules in `CURRENT_TASK.md`'s
  `## Explicit developer decisions`: a student delete removes that student's own records; a
  professor delete removes the professor's own rows AND every other student's clinical
  record where that professor is the reviewer/verifier/supervisor. Single transaction,
  FK-safe order (leaf tables first, `usersTable` row last). Return a count of what was
  deleted. Log only `{ targetUserId, departmentId, status }` on error.
- [ ] Add a "Delete permanently" action to `artifacts/mockup-sandbox/src/components/HODPortal.tsx`
  for both students and faculty in the roster, with a real (non-`window.confirm`) destructive
  confirmation dialog naming the specific person, and — for a professor specifically — stating
  that other students' clinical records will also be permanently deleted. Show the returned
  deleted-record counts after completion.
- [ ] Add tests per `CURRENT_TASK.md`'s spec: student self-cascade, cross-student professor
  cascade (construct a real cross-student scenario), 401/403/404. Mirror
  `artifacts/api-server/tests/superadmin.test.ts`'s department-delete test structure.

## Do NOT touch
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/superadmin.ts` (read-only reference)
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` (read-only reference)
- Any schema file under `lib/db/` — read-only, you are not changing table structure, only
  reading it to find the FK graph
- The existing `DELETE /users/:id` soft-delete handler — leave it completely unchanged
- Any file not implied by the Build list above

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated (§4)
- Any schema change, migration, or backfill (§6) — this task deletes rows only, never alters
  structure
- Any value you would otherwise guess or invent about which tables/columns are involved —
  verify against the real schema file, don't assume
- If you find the cascade rules in `## Explicit developer decisions` ambiguous for a
  specific table you discover (e.g. it's unclear whether a table is "owned by the student"
  or "just references them"), stop and report the specific table/column rather than guessing

## Report
Write `HANDOFF.md` at the repo root:
- The full list of tables/columns you found and cascaded through, and why each one
  qualified under the developer's decisions
- What changed, per file
- Anything you skipped, and why
- Anything you expanded beyond the Build list, and why

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/routes/admin.ts
- artifacts/mockup-sandbox/src/components/HODPortal.tsx
- artifacts/api-server/tests
- lib/db/src/schema
- HANDOFF.md