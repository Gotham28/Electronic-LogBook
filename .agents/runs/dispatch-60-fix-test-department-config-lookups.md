# Antigravity dispatch 60 — fix test-department config lookups + assignment-type guard

## Guard
This prompt is for the project at Electronic-LogBook (Arogya Electronic LogBook), task file
`CURRENT_TASK.md` (repo root) dated 2026-09-21. If this is not that repo, stop, say which
repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Read first
- `AGENTS.md` (repo root) — §3 Ownership before data, §4 The two ID systems, §5 No
  hardcoded department behaviour, §14.5 Halt conditions, §16 Rule map (translates any
  differently-numbered citation you see elsewhere).
- `CURRENT_TASK.md` (repo root) — the confirmed scope, especially the `## Blocked on
  developer input` and `## Agent` bucket item 2, which the developer approved 2026-09-21.
- `.agents/runs/audit-test-department-isolation.md` — the dispatch-1 audit this fix list
  came from. Read part (a), row for `student.ts:577` and `student.ts:865-866`; part (b),
  row for `assignmentTypesTable`; and the break trace in part (c).
- `artifacts/api-server/src/lib/department-config-source.ts` — read
  `resolveConfigDepartmentId()` fully before touching any call site; every fix below must
  call it the same way existing correct call sites already do (e.g.
  `artifacts/api-server/src/routes/student.ts` line 424 or line 896, which the audit marked
  correct).
- `artifacts/api-server/src/routes/admin.ts` around lines 458, 618, and 638 — the existing
  403 mirror-write guard pattern to copy for `assignments.ts`.

## Build
- [ ] `artifacts/api-server/src/routes/student.ts` line 577 (inside the leave-records POST
      handler): the `departmentCatalogTable` lookup for `leave_type` currently uses the
      caller's own `departmentId`. Change it to resolve the department id through
      `resolveConfigDepartmentId()` first, the same way the already-correct config reads in
      this same file do (e.g. line 424, line 896), then use that resolved id for the
      catalog lookup. Do not change how the row is inserted or how ownership/supervisor
      validation works — only the catalog lookup's department id.
- [ ] `artifacts/api-server/src/routes/student.ts` lines 865-866 (inside the procedure-logs
      POST handler): identical fix for the `competency_level` lookup in
      `departmentCatalogTable` — resolve through `resolveConfigDepartmentId()` instead of
      using `req.user!.departmentId!` directly.
- [ ] `artifacts/api-server/src/routes/assignments.ts`:
      - Lines 18 and 42: route the `assignmentTypesTable` reads through
        `resolveConfigDepartmentId()` instead of whatever id they currently use, matching
        the pattern at the correct call sites named above.
      - Line 24 (the write path): add the same 403-on-mirror-write guard already used
        elsewhere for mirror departments — read the exact guard implementation at
        `admin.ts:458` and `admin.ts:618`/`638` first and reuse that same check/error
        shape, don't invent a new one.
- [ ] `artifacts/api-server/tests/mirror-department.test.ts` and/or
      `artifacts/api-server/tests/mirror-cascade-coverage.test.ts` — add these cases:
      1. A test student's procedure-log submission succeeds (no 400) after the fix, and the
         inserted row's `competency_level` resolves against the real department's catalog.
      2. A test student's leave-record submission succeeds (no 400) after the fix, and
         resolves `leave_type` against the real department's catalog.
      3. A test student's case-log submission is visible to the test prof and the test HOD
         (this already works per the audit — add it as an explicit regression test, not a
         new fix).
      4. A real-department `assignmentTypesTable` change (e.g. adding an assignment type) is
         visible when read from its test-mirror department.
      5. A write to `assignmentTypesTable` scoped to a mirror (test) department returns 403.

## Do NOT touch
- Any file not named above.
- The frontend supervisor-picker question raised in the audit (`.agents/runs/audit-test-
  department-isolation.md`, "Anything I could not determine..."). No frontend source is in
  scope for this dispatch — do not open, read speculatively, or change any frontend file to
  address it. It stays a developer follow-up.
- Schema/migrations — no `drizzle-kit push`/`migrate`, no new tables or columns. If a fix
  above turns out to need a schema change, stop and report it instead of making it.
- Any code path unrelated to the four Build items above — in particular, do not touch
  `caseLogsTable` submission/query logic, which the audit confirmed already works
  end-to-end; do not "improve" or refactor it.
- Any code outside `artifacts/api-server/` (e.g. `artifacts/mockup-sandbox/`).
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).

## Hard stops — stop and report, do not decide
- Any change to a route or query touching the clinical tables (`case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance`) beyond the specific department-id-lookup fixes named above.
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or backfill.
- Any new department-specific hardcoded behaviour — the fix must stay generic
  (config-driven, via `resolveConfigDepartmentId()`), never branch on a specific department
  id or name.
- Any secret, credential, or `.env` value.
- Any value you would otherwise guess or invent — if `admin.ts`'s existing 403 guard
  doesn't cleanly generalize to `assignments.ts`, stop and report the mismatch rather than
  inventing a new guard shape.

## Verification
File-reads only (no shell available in this sandbox): after making each change, re-read the
edited section of the file and confirm the resolved department id is used consistently
between the lookup and any related validation in the same handler. Do not attempt to run
the test suite, lint, or typecheck — Claude Code will do that after this dispatch returns.

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per file and line, and why.
- The new/changed test cases added, and to which file.
- Anything you skipped, and why (including any step you could not do because it would have
  required a shell command).
- Anything you expanded beyond the Build list, and why.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)` — substituted for the originally suggested Claude Opus 4.6
(Thinking) because Opus individual quota was already confirmed exhausted earlier in this
same task (dispatch 59, ~97h reset window), per the standing developer preference on this
repo to not re-attempt or wait. Disclosed in the dispatch record; this diff gets extra
scrutiny at `code-review` to compensate.
