# Current Task

## Feature
Add `GET /api/students/:studentId/progress`, an endpoint returning per-item log
counts (case category, procedure, academic activity type) split by
verified/pending status, for the faculty progress-breakdown feature. This is
Task 1 of 2 (backend); Task 2 (the frontend Progress tab) is scoped and
dispatched separately once this is reviewed and accepted.

## Plan reference
No MASTER_PLAN.md exists for this project (AGENTS.md §14.7). Unplanned: direct
developer request to give faculty an interactive, per-type progress view of
student logs (currently they see one flat overall-completion percentage and
undifferentiated log tables). Full design plan on file at
`C:\Users\aravi\.claude\plans\right-now-the-facult-staged-papert.md`, approved
by the developer. STATUS.md does not exist in this repo.

## MASTER_PLAN.md update
- [ ] None — this project has no MASTER_PLAN.md; nothing to append.

## Context for the agent
`main` moved since this plan was drafted (dermatology feature, commit
`a452bed`, already merged). Two things from that merge are relevant here and
must NOT be treated as things to fix or touch:
- A new `conferences` log family now exists (`conferencesTable`). It carries
  no `required`/target field anywhere, so it does not fit a progress-bar
  model. **Do not add a conferences section to this endpoint.** It is
  explicitly out of scope.
- `department_configs.requiredCases/requiredProcedures/requiredAcademic` are
  now nullable, and `completionPercent()` in `validation.ts` now returns
  `null` (not `0`) when no target is configured — "not tracked" is a real,
  already-established state elsewhere in this app. This endpoint does not
  return targets or percentages at all (see Response shape below), so it is
  not directly affected, but do not introduce a different zero-vs-null
  convention than the one already established.

## Files/areas in scope
- `artifacts/api-server/src/routes/student.ts` — add one new route,
  `router.get("/:studentId/progress", requireAuth, async (req, res) => {...})`,
  inserted immediately after the closing `});` of the existing
  `router.get("/:studentId/logs", ...)` handler (currently ends around line
  225, directly before the `// Postings` comment and
  `router.get("/:studentId/postings", ...)`). Do not reorder any other route.

## What to build

The route sits below `router.use("/:studentId", studentAccess)` (already
mounted earlier in this file), so `studentAccess` has already run and
guarantees: the caller is authenticated, the target student exists, is
`approved`, and is in the caller's own department (a professor or HOD caller),
or is the student themselves. A nonexistent student ID and a student in a
different department both already produce an identical
`403 {"message":"Student is outside your access scope"}` from `studentAccess`
before this handler ever runs — this is deliberate enumeration-collapse,
matching `tests/enumeration-collapse.test.ts`. Do not weaken or duplicate that
check in a way that could produce a different status code or a different
message for those two cases.

Despite that, mirror the existing `/:studentId/logs` handler immediately above
(read it in full before writing anything) for its defense-in-depth style: it
independently re-resolves the student row and re-checks
`caller.departmentId !== student.departmentId` even though `studentAccess`
already covers it. Do the same in this new route — parse `studentId`, look up
the student and its `departmentId` the same way `/:studentId/logs` does, and
re-check before running the three queries below. This project's ownership
rule (`AGENTS.md` §3) treats a missing re-check as a defect, not redundant
code.

Then run three separate `GROUP BY` queries against `case_logs`,
`procedure_logs`, and `academic_logs` — **all three filtered only by
`studentId`, with no `supervisorId` filter**. This is a deliberate departure
from `/:studentId/logs`'s filtering (which restricts a professor caller to
`supervisorId = caller.id`); add a comment next to this new route explaining
why, referencing the existing comment at `/:studentId/logs` ("Faculty
inspection is assignment-scoped. HODs retain department-wide oversight.") —
this new route's counts are deliberately NOT assignment-scoped, because they
represent the student's total training progress, not what one supervisor
personally reviewed.

Query 1 — case logs, grouped by `category` and `status`:
```
WHERE studentId = ? AND deletedAt IS NULL
GROUP BY category, status
```
A `NULL` `category` (rows predating migration 0005) is a real, valid group —
do not filter it out and do not coerce it to a string. Return it as `null`.

Query 2 — procedure logs, grouped by `procedureGroup`, `procedureName`,
`competencyLevel`, and `status`:
```
WHERE studentId = ? AND deletedAt IS NULL
GROUP BY procedureGroup, procedureName, competencyLevel, status
```

Query 3 — academic logs, grouped by `activityType` and `status`:
```
WHERE studentId = ?
GROUP BY activityType, status
```
`academic_logs` has no `deletedAt` column — do not add a `deletedAt` filter to
this query, and do not add a `deletedAt` column to the schema.

Shape the three query results into this exact response JSON (reshape
verified/pending into fields in code — the raw per-status rows are not the
response shape):

```json
{
  "caseCategories": [
    { "value": "string or null", "verified": 0, "pending": 0 }
  ],
  "procedures": [
    {
      "group": "string",
      "name": "string",
      "verified": 0,
      "pending": 0,
      "byCompetency": [
        { "level": "string", "verified": 0, "pending": 0 }
      ]
    }
  ],
  "academics": [
    { "value": "string", "verified": 0, "pending": 0 }
  ]
}
```

`verified` counts rows with `status = "verified"`. `pending` counts rows with
`status = "pending"`. Rows with `status = "rejected"` are counted in neither
and do not appear anywhere in the response — they are not verified, not
pending, and not part of "remaining" either. For `procedures`, `verified` and
`pending` are the totals across all competency levels for that
group+name; `byCompetency` is the same counts broken down by
`competencyLevel` for that same group+name.

Return **counts only**. No diagnosis, no patient identifier, no free-text
field of any kind, from any of the three tables (`AGENTS.md` §8).

Do not add `required`/target numbers to this response. The frontend already
holds per-item targets via a separate endpoint
(`GET /api/departments/:departmentId/catalog`) and joins them client-side;
that join is Task 2's job, not this one.

## Explicitly out of scope
- Any conferences data (see Context above).
- Any target/requirement number in the response.
- Any change to `/:studentId/logs`, `/:studentId/dashboard`, or any other
  existing route — read them for pattern only, do not modify them.
- Any change to `professor.ts`, `admin.ts`, `department.ts`, or any file
  outside `student.ts`.
- Any schema or migration change. The three log tables' columns already
  support this query as they exist today.

## Do NOT touch
- Any file other than `artifacts/api-server/src/routes/student.ts`.
- `studentAccess` (`artifacts/api-server/src/middlewares/student-access.ts`)
  and `requireAuth`/`requireRole`/`requireDepartment`
  (`artifacts/api-server/src/middlewares/auth.ts`) — do not modify, only rely
  on what is already mounted.
- The existing `/:studentId/logs`, `/:studentId/dashboard`, and every other
  route in this file — read-only reference, no edits.
- Any test file. No test file is in scope for this dispatch.

## Execution route
- B — Claude Code loop
- Why: this route touches the clinical log tables and the ownership boundary
  (`AGENTS.md` §3, §4) even though it deliberately departs from the
  assignment-scoping precedent right above it — that departure needs a
  reviewed diff, not just a diff + exit code.

## Manual (developer does)
- [ ] Approve this CURRENT_TASK.md before dispatch.
- [ ] Review the diff.
- [ ] Run `pnpm test` in `artifacts/api-server` after the diff is accepted,
      and separately exercise the four cases below by hand (curl or
      equivalent), pasting the request and full response for each. Claude
      Code does not run these — `AGENTS.md` §6 forbids any command that
      connects to a database, with no exception for read-only test runs, and
      `.env`'s `DATABASE_URL` could not be confirmed as a non-production host
      from this session.
- [ ] Merge into PR, when a new PR is opened for this branch, when ready —
      never automated.

## Agent (does on its own, once scope is confirmed)
- [ ] Add the one new route exactly as specified above.
- [ ] Report the exact diff, and confirm no other route or file was touched.

## Blocked on developer input
- None. The test-verification handoff above is resolved (developer runs it,
  per this session's decision) — not an open question.

## Order
### Steps inside this task
1. Add the new route to `student.ts`.
2. Report diff; hand off for review.

### Where this task sits
- Before this: PR #49 (Department requirements card), merged into this
  session's other work; unrelated to this feature.
- After this: Task 2 — the frontend Progress tab in `ProfessorPortal.tsx` —
  scoped and dispatched separately once this is reviewed and accepted, per
  `AGENTS.md` §9 (one feature per task).
- This is new work, on a **new branch cut from an updated `main`** (not
  continuing on `feature/computed-department-requirements`).

## Verification required before this is considered done
- [ ] Backend typecheck / build — no new errors.
- [ ] The four §11 cases below, run by the developer (see Manual), pasted with
      request and full response for each:

| Case | Expected |
|---|---|
| Unauthenticated request | `401` |
| Professor, student in another department | `403` — same message `studentAccess` already returns for this case |
| Professor, student in own department | `200` + the JSON shape above |
| Authenticated, nonexistent `studentId` | `403` — same collapsed message as "wrong department", per `studentAccess`; matches `tests/enumeration-collapse.test.ts` |

- [ ] Diff read and confirmed: exactly one route added, in
      `artifacts/api-server/src/routes/student.ts`, no other file touched, no
      `supervisorId` filter present in any of the three queries, no
      `conferences` reference, no target/`required` field in the response.

## Flags (AGENTS.md rule triggers)
- §3 Ownership before data — this route deliberately returns counts spanning
  all of a student's logs to a professor caller, not just their own
  supervised logs (a documented, reviewed departure from `/:studentId/logs`'s
  precedent, not an accidental widening). No patient text or identifiers are
  returned, so the exposure is bounded to counts.
- §4 The two ID systems — `:studentId` is `studentsTable.id`; `req.user.id` is
  `usersTable.id`. The route does not compare them; ownership is resolved
  through `studentAccess` and the student row lookup, matching
  `/:studentId/logs`'s own pattern.
- §9 One feature per task — confirmed; the frontend Progress tab is Task 2,
  dispatched separately after this is accepted.
- No §6/§7/§8/§10/§13 trigger — no schema change, no fabricated data (a `NULL`
  category is passed through as `null`, never invented or dropped), no
  patient text near a log, no secrets.

## Suggested review tier (set at scoping time)
- **Opus, high effort.** §15.2 fires: ownership resolution on the clinical
  tables (§3) and a route taking `:studentId` alongside `req.user.id` (§4).
  This tier is set now and cannot be lowered (§15.4), even if the returned
  diff turns out small.

## Suggested Antigravity model
- Claude Opus 4.6 (Thinking).

---

## Review findings to fix (dispatch 52)

The first dispatch (51) returned a correct, well-scoped diff — additive only,
no supervisorId filter, no conferences reference, no target field, matches the
spec above. `code-review` (Opus, 8 finder angles, verified) found one real bug
that must be fixed before this is accepted. Two other findings were reviewed
and are **not** being fixed — see below.

### Must fix

**`case_logs.status` has no `NOT NULL` constraint at the DB level** (unlike
`procedure_logs.status` and `academic_logs.status`, which both do —
`lib/db/migrations/0001_baseline.sql:85` vs. lines 13 and 129;
`lib/db/src/schema/logs.ts:26` lacks `.notNull()` unlike lines 50 and 71). The
new route's reshape loop for case categories
(`artifacts/api-server/src/routes/student.ts`, around line 313-322) only
increments `verified` on `row.status === "verified"` and `pending` on
`row.status === "pending"`. A row with `status = NULL` still creates a
category entry (via the `Map.set` that runs regardless of status) but
contributes to neither count — it is silently dropped, understating that
category's real progress with no visible signal.

**Fix:** treat a `NULL` `status` the same as `"pending"` for counting
purposes — `NULL` sits at the same semantic position as the column's own
`DEFAULT 'pending'` (a row that has not been given a definitive status), and
"pending" is already a bucket in the response shape, so this requires no new
field and no schema change. Change the case-category reshape loop's condition
from `row.status === "pending"` to `row.status === "pending" || row.status ===
null`, and add a one-line comment explaining why (mirroring how the same block
already explicitly comments its `NULL` `category` handling). Do **not** apply
this same change to the procedure or academic reshape loops —
`procedure_logs.status` and `academic_logs.status` are both `NOT NULL` at the
DB level, so a `NULL` status is not a real possibility there and adding
dead-code handling for it would be unmotivated.

### Reviewed, not being fixed

- **Redundant department re-check** (`student.ts` around lines 240-268)
  duplicates `studentAccess`, unlike `/:studentId/postings`,
  `/:studentId/thesis`, `/:studentId/certifications`, which trust the
  middleware alone. This was an explicit instruction in this task file's
  original `## What to build` section (mirror `/:studentId/logs`'s
  defense-in-depth style, given §3's stakes on the highest-severity rule in
  this repo). Deliberate, not a defect — leave as-is.
- **`Number(row.count)` on Postgres `bigint`** — theoretically lossy past
  `Number.MAX_SAFE_INTEGER`, but not reachable at single-student log-count
  scale. Not worth a dispatch by itself.

## Files/areas in scope for dispatch 52
- `artifacts/api-server/src/routes/student.ts` — only the case-category
  reshape loop's condition, as described above. Nothing else in this file.

## Do NOT touch (dispatch 52)
- Everything already listed under `## Do NOT touch` above, unchanged.
- The procedure and academic reshape loops — do not add `NULL`-status
  handling there; their columns are `NOT NULL`.
- The redundant department re-check block — reviewed and kept, not to be
  simplified in this dispatch.

## Verification required (dispatch 52)
- [ ] Diff read and confirmed: exactly one condition changed (the case-status
      check), no other line touched.
- [ ] Backend typecheck / build — no new errors.
