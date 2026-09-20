# Antigravity dispatch 31 — Mirror test department (schema, helper, read/write switch, tests)

## Guard
This prompt is for the project "Electronic-LogBook" (Arogya platform, Pediatrics pilot),
task file `CURRENT_TASK.md` at the repo root, feature "mirror test department". If this is
not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`, and not `pnpm test`. If you are tempted to
run one, don't; use file-reading and file-editing tools instead. A denied shell call is not
something to work around and continue past — some environments do not recover cleanly from
one and simply stop the task instead of falling back. Do the entire task using only
file-reading and file-editing tools. Write tests as files; do not attempt to run them —
Claude Code runs `pnpm test` after this dispatch returns and reports the real result.

The branch `feature/mirror-test-department` is already checked out for you, cut from `main`
@ `ef6c740`. Do not check out, create, or switch any branch. Do not run `git` at all.

## Read first
- `AGENTS.md` — all sections; §16 is a rule-map table (cited section numbers below already
  resolve through it)
- `CURRENT_TASK.md` — the confirmed scope in full
- `HANDOFF.md` — the verified inventory of every read/write site of `department_configs`,
  `procedure_types`, and `department_catalog`, and every department-listing endpoint. This
  was produced by an earlier dispatch and independently re-verified line-by-line against
  the actual source by Claude Code before this dispatch was sent — treat it as accurate,
  but re-confirm each site yourself as you touch it, since code may have shifted since it
  was written.
- `lib/db/migrations/0002_departments_assignments.sql` and
  `lib/db/migrations/0003_subscriptions_payments.sql` — style reference for the new
  migration: `ALTER TABLE ... ADD COLUMN`, `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY
  ... REFERENCES`, and `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` statements, in that
  order, matching the exact quoting/naming style already used there.

## Build

### 1. Schema change (lib/db/src/schema/users.ts)
Add two columns to `departmentsTable`:
- `isTest`: boolean, not null, default false.
- `configSourceDepartmentId`: integer, nullable, references `departmentsTable.id` (same
  `.references(() => departmentsTable.id)` pattern already used for `usersTable.departmentId`
  at line 23 of this file).
- A CHECK constraint: `config_source_department_id IS NULL OR is_test = true`.
- A CHECK constraint: `config_source_department_id <> id`.

### 2. Drafted migration (lib/db/migrations/0004_mirror_test_department.sql)
Hand-write SQL matching the exact style of `0002_departments_assignments.sql` and
`0003_subscriptions_payments.sql` (see Read first). Contents: the two `ADD COLUMN`
statements, the foreign-key `ADD CONSTRAINT`, and the two CHECK `ADD CONSTRAINT` statements
described above, against the `"departments"` table. Do NOT use `drizzle-kit generate`
output — write it by hand. Do NOT run this file or connect to any database.

### 3. Register the migration (lib/db/src/migrations.ts)
Append `"0004_mirror_test_department.sql"` to the END of the `files` array on line 13.
Change nothing else in this file. The three existing entries
(`0001_baseline.sql`, `0002_departments_assignments.sql`, `0003_subscriptions_payments.sql`)
must be byte-for-byte unchanged, in the same order.

### 4. Helper (new file: artifacts/api-server/src/lib/department-config-source.ts)
`resolveConfigDepartmentId(departmentId)`:
- Looks up the department by `departmentId`. If it does not exist, throw (fail closed —
  never return a fallback value).
- If `configSourceDepartmentId` is not set, return `departmentId` unchanged.
- If it is set, look up that source department. If the source department itself has
  `isTest = true`, throw (fail closed) — one hop only, never chain through a department
  that is itself a mirror.
- Otherwise return the source department's id.

### 5. Switch every READ, per the inventory in HANDOFF.md
For every read of `department_configs`, `procedure_types`, or `department_catalog` listed
in HANDOFF.md's inventory (in `department.ts`, `admin.ts`, `professor.ts`, `student.ts`),
pass the id through `resolveConfigDepartmentId` first, so a mirror department's read
returns the source department's settings. Two named exceptions — do NOT resolve these:
- `routes/department.ts`'s `GET /` (the public registration-directory listing at
  HANDOFF.md's `department.ts:11-14`) — this lists every department at once, there is no
  single caller department to resolve. It gets the signup filter in step 7 below instead,
  not id resolution.
- Anything under `## Do NOT touch` below.
If a read site sits inside a handler that also performs a write in the same request (e.g.
an upsert), resolve only the read half if the write half is separately gated by step 6.

### 6. Block every WRITE, per the inventory in HANDOFF.md
For every write to `department_configs`, `procedure_types`, or `department_catalog` listed
in HANDOFF.md's inventory: at the top of that route handler, resolve the caller's own
department (`req.user`'s department, looked up fresh — never trust a client-supplied id per
AGENTS.md §4), and if that department has `configSourceDepartmentId` set, return `403` and
perform no write of any kind (no read-then-write upsert check either — fail before touching
the table at all).

### 7. Signup-list filter (routes/department.ts GET /)
Exclude any department where `isTest = true` from this endpoint's result set (a `WHERE`
condition, not an application-side filter after the fact).

### 8. Tests (artifacts/api-server/tests/)
Add tests covering exactly these cases. Do not run them — write only.
- A settings write (pick one real write route from HANDOFF.md's inventory) on a mirror
  department, shown as four separate cases per AGENTS.md §11: unauthenticated → `401`;
  authenticated as the mirror department's own HOD → `403`, with the source department's
  config asserted unchanged before and after; authenticated as a real (non-mirror)
  department's HOD writing their own settings → `200`; request against a nonexistent
  department → `404`.
- A mirror department's read (e.g. `GET /:departmentId/catalog` or `/config`) returning the
  source department's settings, not empty/default values.
- `resolveConfigDepartmentId` failing closed (throwing, not returning a fallback) when: the
  department does not exist; the resolved source department is itself `isTest = true`.
- `GET /api/departments` excluding a seeded `isTest = true` department while still
  including its (non-test) source department.

## Do NOT touch
- Any query selecting rows from `users`, `students`, `assignments`, `case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, or
  `appraisals`. These MUST keep using the caller's OWN department id — NEVER the resolved
  id, under any circumstances. Switching them would show a test account real residents'
  data and real patient records. Do not touch these even if a site looks structurally
  similar to a settings-table site.
- `assignment_types` — this is department data, not settings; do not resolve or gate it. If
  it looks like it should mirror, note that in HANDOFF.md and leave it alone.
- The `users_one_approved_hod_per_department` unique index.
- `provisionDepartment()` in `lib/department-provisioning.ts`.
- Anything in `routes/superadmin.ts`.
- `HODPortal.tsx` or any other frontend file.
- Any branch other than `feature/mirror-test-department` — do not read from or reference a
  Dermatology/`enabledFeatures` branch if one is visible locally.
- Existing migration files `0001_baseline.sql`, `0002_departments_assignments.sql`,
  `0003_subscriptions_payments.sql` — do not edit, rename, or reorder them, or any existing
  entry in the `files` array. Their checksums are checked against a database table on every
  deploy; changing them breaks every future deploy.
- A UI or endpoint to set `isTest` / `configSourceDepartmentId` — out of scope; the
  developer sets these by hand.
- Creating test departments or accounts, or hiding test departments from admin/dean
  screens — both explicitly out of scope; the superadmin console already does this and
  seeing test departments there is acceptable.
- `.env`, `TASK_LOG.md`, `STATUS.md`, `CURRENT_TASK.md` (read-only — do not edit it).
- Any file not named in `## Build` above.
- Any shell command whatsoever, including `pnpm test`, `pnpm install`, `drizzle-kit
  generate`, `drizzle-kit push`, `drizzle-kit migrate`, `psql`, or `git` of any kind
  (restates the Sandbox constraint above — redundancy here is intentional, not filler).

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated (§4 / rule-map §5.1).
- Any migration or backfill beyond exactly what step 2 above describes.
- Any new department-specific hardcoded behaviour (§5) — e.g. do not special-case a
  department name or id anywhere.
- Anything that puts patient text or leave reasons near a log, error, or audit trail (§8).
- Any secret, credential, or `.env` value (§10, §13).
- The task turning out to be more than one feature (§9).
- Any value you would otherwise guess or invent — e.g. which department id variable a given
  read site should resolve from, if it is genuinely ambiguous from the surrounding code. Say
  so in HANDOFF.md and leave that site unchanged rather than guessing.
- A migration-number clash: if you discover `0004_mirror_test_department.sql` is no longer
  the next free number on this branch (something else already claimed it), stop and report
  rather than picking a different number yourself.

## Report
Write `HANDOFF.md` at the repo root (overwrite the existing inventory content, but keep it
as a reference section rather than deleting it outright — add new sections below it):
- Every file created or modified, with paths.
- For every read/write site from the original HANDOFF.md inventory: whether you resolved
  it, blocked it, filtered it, or left it unchanged and why (map 1:1 against the inventory
  so nothing is silently skipped).
- The exact new migration filename and confirmation `lib/db/src/migrations.ts`'s three
  existing array entries are unchanged.
- Every test added, with the file and what it asserts — explicitly state you did not run
  them (sandbox constraint) and that pass/fail is unverified until Claude Code runs
  `pnpm test`.
- Anything you skipped, and why (including anything you could not do because it would have
  required a shell command).
- Anything you expanded beyond the Build list, and why.
- Anything that contradicts `CURRENT_TASK.md` or `AGENTS.md`, per AGENTS.md §12/§14.6.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- lib/db/src/schema/users.ts
- lib/db/migrations/
- lib/db/src/migrations.ts
- artifacts/api-server/src/lib/
- artifacts/api-server/src/routes/department.ts
- artifacts/api-server/src/routes/admin.ts
- artifacts/api-server/src/routes/professor.ts
- artifacts/api-server/src/routes/student.ts
- artifacts/api-server/tests/
- HANDOFF.md