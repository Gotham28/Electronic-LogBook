# SECURITY_AUDIT — Arogya Electronic LogBook

**Phase 1: audit only. No file in the application was created, modified or deleted.**

| | |
|---|---|
| Date | 2026-09-08 |
| Branch | `security-audit-2026-09` |
| Commit audited | `2f1204c` — *fix(payments): log Razorpay's error code and description on order failure* |
| Working tree | one untracked file, `PR_DESCRIPTION.md`. No tracked file modified. |
| Stashes present | `stash@{0}: On main: pre-CORS-fix uncommitted work 2026-09-06` — not applied, not popped, not dropped |
| Scope | every route, handler, middleware, hook and component under `artifacts/api-server/src`, `artifacts/mockup-sandbox/src`, `lib/db`, `lib/api-client-react` |

## Counts

| Severity | Count |
|---|---|
| Critical | 4 |
| High | 12 |
| Medium | 9 |
| Low | 12 |
| **Total** | **37** |

SEC-34 through SEC-37 were added on 2026-09-09 by `docs/SECURITY_FIXES.md` §1b's preflight — a
read-only survey of every route that resolves a caller-supplied row id, run before Batch B to
confirm the 403-collapse behaviour documented for `studentAccess` holds everywhere it matters.
None of Batch B's six routes were affected; four routes *outside* Batch B were. Per §1b's own
instruction they are recorded here, not fixed, as this task is scoped to Batches B–H only.

---

## Findings

### Critical

| ID | Sev | File:line | What is wrong | What an attacker or wrong user could actually reach | Proposed fix |
|---|---|---|---|---|---|
| SEC-01 | Critical | `artifacts/api-server/src/routes/student.ts:326-334`, gated only by `artifacts/api-server/src/middlewares/student-access.ts:15-25` | `GET /:studentId/leave-records` returns `db.select().from(leaveRecordsTable)` — the whole row, including the free-text `reason`. `studentAccess` admits any caller whose `departmentId` matches the student's; only the `student` role is narrowed to self. There is no assignment or supervisor check for faculty. | Any professor account in the department can read every resident's leave reasons — which AGENTS.md §8 identifies as capable of disclosing a health condition — for residents they do not supervise. One HTTP GET per student id. | Restrict leave records to the owning student and the department HOD, resolving the owner server-side, and return 403 for any other caller. |
| SEC-02 | Critical | `artifacts/api-server/src/routes/student.ts:98-99` and `:115` (route at `:38-121`) | `GET /:studentId/dashboard` builds `recentLogs` with bare `db.select().from(caseLogsTable)` / `procedureLogsTable`, returning every column — `patientUhid`, `chiefComplaints`, `history`, `examination`, `diagnosisProvisional`, `diagnosisFinal` — with no supervisor scoping and no `deletedAt` filter. The sibling route `/logs` (`:165-173`) *does* scope professors to `supervisorId = caller.id`, so the omission here is inconsistent, not intentional. | Any professor in the department can read full patient clinical text from the most recent case and procedure log of any resident they do not supervise, including logs the resident has soft-deleted. | Apply the same `caller.role === "professor" ? eq(supervisorId, caller.id)` scoping and `isNull(deletedAt)` filter already used at `student.ts:165-173`. |
| SEC-03 | Critical | `artifacts/api-server/src/routes/student.ts:359` | `req.log.error(error, "Leave POST error")` logs the whole error object. drizzle-orm 0.45.2 wraps every failed query in `DrizzleQueryError`, whose `message` is literally ``Failed query: <SQL>\nparams: <all bound parameters>`` (`node_modules/drizzle-orm/errors.js:10-19`, thrown at `pg-core/session.js:41`). Pino serialises that `message`. The bound parameters of this INSERT include the leave `reason`. | Any failure on `POST /:studentId/leave-records` — a constraint violation, a connection drop — writes the resident's leave reason text into the application log, where it is retained by the hosting platform. Direct AGENTS.md §8 violation. | Log only `{ studentId, status: 500 }` and never the error object, matching the pattern already used in `app.ts:96`. |
| SEC-04 | Critical | `lib/db/check_reetha.mjs:3`, `check_reetha_student.mjs:3`, `check_schema.mjs:3`, `check_schema_exact.mjs:3`, `delete_reetha.mjs:3`, `query_tables.mjs:3`, `query_reetha.mjs:3`, and repo-root `query_reetha.mjs:3` | Eight tracked files contain a production Postgres connection string as a literal. Six use `process.env.DATABASE_URL || '<literal>'`, which **fails open to production** when the variable is unset. Two — `lib/db/query_reetha.mjs:3` and the repo-root `query_reetha.mjs:3` — hardcode it with no environment fallback at all and therefore *always* target production. AGENTS.md §13 lists seven files in `lib/db/` and describes them all as `\|\|` fallbacks; the root-level copy is an eighth file it does not name, and two of them are unconditional. | Anyone with read access to the repository or to `origin/main` history (entered at `10bbd69`) holds live production database credentials for a system containing real patient records. One of the affected scripts is `delete_reetha.mjs`. | Delete all eight scripts, rotate the database credential, and purge it from git history; no value was printed in this report. |

### High

| ID | Sev | File:line | What is wrong | What an attacker or wrong user could actually reach | Proposed fix |
|---|---|---|---|---|---|
| SEC-05 | High | `artifacts/api-server/src/routes/student.ts:205` (`/postings`), `:365` (`/assessments`), `:474` (`/thesis`), `:502` (`/certifications`) | Same gap as SEC-01: the only gate is `studentAccess`, which is department-wide for faculty. No route resolves an assignment or supervisor relationship. | Any professor in the department reads any resident's postings, exam marks, thesis details and certificates without supervising them — AGENTS.md §3, "no professor acts outside their assignments". | Add the same owner/supervisor resolution used by `/logs`, returning 403 on mismatch. |
| SEC-06 | High | `artifacts/api-server/src/routes/student.ts:272`, `:382`, `:448` | Conditional department scoping that fails **open**: `if (caller.departmentId !== null) { …check… }` with no `else`, and `if (professorDeptId !== null && studentUser?.departmentId !== professorDeptId)`. A null department skips the check entirely and the handler proceeds. This is the exact shape AGENTS.md §3 prohibits. | Currently blocked in practice: `requireDepartment` (`middlewares/auth.ts:72-78`) is mounted unconditionally at `student.ts:14`, so `departmentId` cannot be null at these lines today. The weakness is one middleware removal or one new router mount away from being live cross-department read access. | Invert each to fail closed — resolve the department, and return 403 when it is missing rather than skipping the comparison. |
| SEC-07 | High | 23 sites: `student.ts:118,199,226,251,321,418,469,630,667`; `admin.ts:57,101,136,178,260,296,313,356,373,401,475`; `department.ts:55,84,227`; `logs.ts:98`; `professor.ts:232` | Every one of these is `req.log.error(error, "…")`, logging the whole error. As established in SEC-03 the `DrizzleQueryError.message` carries the SQL plus all bound parameters; its `cause` is the node-postgres `DatabaseError`, whose `detail` field carries `Failing row contains (…)` — the entire offending row — for check-constraint violations. `app.ts:95-96` already documents this hazard and defends against it; these 23 route-level catches run first and defeat that defence. | On any database error in these handlers, SQL parameters and potentially whole table rows — including clinical free text — are written to the application log. Only ids and status codes may be logged. | Replace each with a log of the relevant record id and status code only, and let `app.ts`'s handler own the rest. |
| SEC-08 | High | `artifacts/api-server/src/routes/admin.ts:222` | Specific instance of SEC-07 worth calling out: the failing statement is the `INSERT` at `admin.ts:203-210`, whose bound parameters include the new professor's `passwordHash` alongside their full name and email. | A unique-violation or connection error on faculty creation writes a bcrypt password hash into the log. | Log `{ status: 500 }` only. |
| SEC-09 | High | `artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx:32-38`, `:55-58` | All five data fetches carry `.catch(() => <empty>)` — `{ profile: null, caseLogs: [], procedureLogs: [], academicLogs: [] }`, `{ data: [] }`, `[]`, `[]`, `{ data: null }`. `window.print()` is then fired unconditionally in the `finally` block. | A resident whose network call fails prints, signs and submits a **blank official logbook** with no indication anything is missing. AGENTS.md §7: a failed call must show a visible error state. | Remove the per-call `.catch` fallbacks and render a visible error with a retry, printing only when every fetch succeeded. |
| SEC-10 | High | `artifacts/mockup-sandbox/src/components/HODPortal.tsx:96,125,152` (`error`) and `:97,149` (`analyticsError`) | Both error states are written on failure and **never rendered**. Grep across the file returns only the declaration and the setter for each; there is no read site. The spinner at `:261` clears once `loading` is false, so the portal then renders normally. | An HOD whose dashboard load fails entirely sees a complete, ordinary-looking portal with no error anywhere — the file AGENTS.md §7 says has regressed on this rule twice. | Render both states, with a retry, wherever their data would otherwise appear. |
| SEC-11 | High | `artifacts/api-server/src/routes/auth.ts:154`; `artifacts/mockup-sandbox/src/lib/session.ts:22-28`; `artifacts/mockup-sandbox/src/lib/apiClient.ts:40-43` | `POST /logout` only calls `res.clearCookie`. The frontend does not authenticate with the cookie — it sends `Authorization: Bearer` from `sessionStorage`. The JWT issued at `auth.ts:148` carries `expiresIn: "1d"` and is not invalidated. The project already has a working revocation mechanism, `sessionVersion` (bumped at `auth.ts:169,182` and `admin.ts:19,131,169`, checked at `auth.ts:51`), and logout does not use it. | A token captured before logout — from a shared or compromised machine, or via XSS — keeps full account access for up to 24 hours after the user believes they have signed out. | Bump `usersTable.sessionVersion` in the logout handler so the existing check at `auth.ts:51` rejects the old token. |
| SEC-12 | High | `artifacts/api-server/src/routes/auth.ts:19-31` (keyed on `req.ip` at `:23`); no `app.set("trust proxy")` anywhere in `artifacts/api-server/src/app.ts` | Express is not configured to trust the proxy, so behind Render's load balancer `req.ip` is the proxy's address for every request. The throttle's per-key bucket therefore becomes one shared global bucket of 100 POSTs per 15 minutes across all users. The map is also per-process and lost on restart, as the comment at `:16-17` acknowledges. | Two effects: there is no per-attacker brute-force limit on `POST /auth/login` at all, and one attacker can exhaust the shared bucket and lock every legitimate resident, professor and HOD out of login for 15 minutes. | Set `trust proxy` to the deployment's hop count and key the throttle on the resolved client IP, with a separate per-account failure counter. |
| SEC-34 | High | `artifacts/api-server/src/routes/logs.ts:45-48` vs `:51-54` | `PATCH /:logType/:logId/review` looks up the log by id alone first (`404 "Log not found"` if none) and only afterward checks whether the caller is its supervisor (`403 "This entry was assigned to another faculty member"`). Two separate branches, two separate status codes, two separate bodies. Live-confirmed: nonexistent `logId` → `404 {"message":"Log not found"}`; a real log belonging to another professor → `403 {"message":"This entry was assigned to another faculty member"}`. | Any professor or HOD can walk log ids sequentially and, from the 404-vs-403 split alone, learn exactly which case/procedure/academic log ids exist in the system — the same roster-enumeration risk `docs/SECURITY_FIXES.md` §1b's exception documents for `studentAccess`, present here because this route was never brought under that pattern. | Combine the lookup and the ownership check into a single query (or a single response branch) that returns the same status and body for "no such log" and "not your log," mirroring how `studentAccess` and `admin.ts`'s `/leaves/:id/action` already do this. |
| SEC-35 | High | `artifacts/api-server/src/routes/professor.ts:43-46` vs `:48-51` | `GET /:professorId/review-queue` returns `404 "Professor not found"` for a nonexistent id, then separately `403 "Faculty member is outside your department"` for a real professor in a different department. Live-confirmed via an HOD caller (the only caller who can reach past the earlier self-id check at `:32`): nonexistent id → `404 {"message":"Professor not found"}`; a real cross-department professor → `403 {"message":"Faculty member is outside your department"}`. | An HOD can enumerate professor/HOD user ids across every department in the system from the 404-vs-403 split, learning who exists elsewhere in the organization. | Same fix shape as SEC-34: one query, one branch, identical status and body for both cases. |
| SEC-36 | High | `artifacts/api-server/src/routes/admin.ts:76-79` vs `:80-83` (`/students/:id/approve`); `:122-125` vs `:126-129` (`/students/:id/reject`); `:154-157` vs `:158-161` (`DELETE /users/:id`) | All three HOD-only routes share one anti-pattern: an existence check returning `404`, followed by a separate department/role check returning `403` with a different message. Live-confirmed for all three: nonexistent id → `404` (`"Pending student not found"` / `"Pending student not found"` / `"User not found"`); a real user id that exists in a different department → `403` (`"Cannot approve a student outside your department"` / `"Cannot reject a student outside your department"` / `"Cannot remove a user outside your department"`). | An HOD can enumerate user ids belonging to *other departments* — residents and faculty they have no legitimate reason to see — from the 404-vs-403 split on any of these three routes. | Same fix shape: combine each pair into one query with one response, as `admin.ts`'s own `/leaves/:id/action` (`:284-292`) already does correctly and was used as the live control for this finding — nonexistent and cross-department both return the identical `404 {"message":"Leave not found"}` there. |
| SEC-37 | High | `artifacts/api-server/src/routes/payments.ts:172` vs `:173` | `POST /verify` returns `404 "Payment order not found"` for an unknown `razorpay_order_id`, then separately `403 "This payment does not belong to your account"` when the order exists but belongs to a different account. Live-confirmed with a real payment row and two distinct payment-scoped tokens: nonexistent order → `404 {"message":"Payment order not found"}`; another user's real order → `403 {"message":"This payment does not belong to your account"}`. | A pending applicant can enumerate valid Razorpay order ids — and by extension learn which other applicants have live payment attempts in flight — from the 404-vs-403 split. Lower blast radius than SEC-34–36 (order ids are opaque, high-entropy strings from Razorpay, not sequential integers), but the same structural leak. | Same fix shape: look up the order without filtering by owner, and once found, return one uniform response (e.g. `403`) for both "no such order" and "not yours," instead of branching on which is true. |

### Medium

| ID | Sev | File:line | What is wrong | What an attacker or wrong user could actually reach | Proposed fix |
|---|---|---|---|---|---|
| SEC-13 | Medium | `lib/db/drop.mjs:5-8` | A tracked script that runs `DROP TABLE IF EXISTS "leave" / "postings" / "assessments" CASCADE` against `process.env.DATABASE_URL`, with no confirmation prompt, no environment guard and no dry-run. | Anyone who runs this file with a production `DATABASE_URL` in scope destroys three tables of real records irreversibly; the project has no migration history and no backup path documented. | Delete the script, or gate it behind an explicit non-production assertion. |
| SEC-14 | Medium | `artifacts/mockup-sandbox/src/components/HODPortal.tsx:282-284` (line moved from `269-271` since this row was written — re-verified 2026-09-09, content and defect unchanged) | `analyticsData?.logStats ?? { pending: 0, verified: 0, rejected: 0 }` and `analyticsData?.topProcedures ?? []` — invented zeros substituted for a failed fetch. The three values are computed but not currently rendered anywhere in the file. | Not user-visible today, but this is verbatim the regression AGENTS.md §7 records twice against this file; it becomes live the moment an analytics panel is wired up. | Delete the fallbacks and derive the panel from `analyticsError` instead. |
| SEC-15 | Medium | `artifacts/mockup-sandbox/src/components/HODPortal.tsx:158-168`, `:329-331`, `:371`, `:427` (three render-site lines moved from `309-312`/`350-351`/`406-407` since this row was written — re-verified 2026-09-09, content and defect unchanged) | `fetchRoster` reports failure with `toast.error` only and leaves `roster` at `null`. The render path then produces `?? 0` summary cards and the copy "No students in this department." / "No faculty in this department." | After the toast fades, an HOD sees a department with zero approved students, 0% average progress and zero faculty, presented as fact. | Hold a roster error state and render it in place of the cards and tables. |
| SEC-16 | Medium | `artifacts/mockup-sandbox/src/components/pages/AttendancePage.tsx:44-46`, `:73-76` | `balance` is initialised to `{ casual: { used: 0, total: null }, academic: { used: 0, total: null } }` and is never cleared when the fetch throws. | A resident whose leave-balance call fails is shown "0 days used", which may lead them to apply for leave they do not have. | Reset the balance to a null/error state on failure and render an error in the card. |
| SEC-17 | Medium | `artifacts/mockup-sandbox/src/components/pages/AssessmentsPage.tsx:34-35`; `PostingsPage.tsx:58-59` | Failure is a toast only; the list state stays empty and the table renders its empty message. (`CaseLogsPage.tsx:164`, `ProcedureLogsPage.tsx:155` and `AcademicLogsPage.tsx:119` do this correctly and are the model to copy.) | A failed load is indistinguishable from "you have no assessments / no postings". | Add a rendered error state with retry, matching the three log pages. |
| SEC-18 | Medium | `artifacts/api-server/src/routes/student.ts:79-81`, `:98-99` | The dashboard's `groupBy(status)` counts and its `recentCases`/`recentProcs` queries omit `isNull(deletedAt)`, although both tables have that column (`lib/db/src/schema/logs.ts:30` and `:55`) and the delete routes at `student.ts:627,664` set it. | A resident's "logged" totals include entries they deleted, and a deleted entry can reappear under "recent". The numbers on the dashboard do not match the logbook. | Add `isNull(deletedAt)` to all four queries, matching `student.ts:166-170`. |
| SEC-19 | Medium | `artifacts/mockup-sandbox/src/lib/session.ts:22-28` | The JWT is held in `sessionStorage` and attached as a Bearer header. The correctly-flagged `httpOnly` cookie set at `auth.ts:14` is not the credential actually used. | Any script running on the frontend origin can read a full-privilege session token; combined with SEC-11 it stays valid for 24 hours regardless of logout. | Keep the token in the httpOnly cookie and drop the `sessionStorage` copy, or accept the trade-off explicitly and fix SEC-11 so the exposure window closes at logout. |
| SEC-20 | Medium | `artifacts/api-server/src/routes/auth.ts:19-31` | Nothing counts failed password attempts per account. The only limiter is the per-IP (in practice per-process, see SEC-12) POST counter. | Password guessing against a single named account is limited only by the shared bucket, and distributes trivially across source addresses. | Add a per-account failure counter with backoff, persisted in the database. |
| SEC-21 | Medium | `artifacts/api-server/package.json` → `express` → `qs` | Two advisories on the only vulnerable package that reaches the production runtime: **GHSA-x5fp-wj9c-mxmx** (array-limit bypass via bracket-key comma parsing, `>=6.14.2 <=6.15.3`, patched `>=6.15.4`) and **GHSA-4mjr-xmp4-gh2g** (denial of service via attacker-controlled `isBuffer`, `>=2.2.5 <6.16.0`, patched `>=6.16.0`). Reached via `artifacts__api-server>express>qs` and `>express>body-parser>qs`. | Query-string parsing on every API request; the DoS advisory is the practical concern for an unauthenticated caller. | Bump `express` so `qs >= 6.16.0` resolves — a dependency change, so Phase 2 only and on your instruction. |

### Low

| ID | Sev | File:line | What is wrong | What an attacker or wrong user could actually reach | Proposed fix |
|---|---|---|---|---|---|
| SEC-22 | Low | `artifacts/api-server/src/routes/department.ts:106-118` | The analytics student query filters on `usersTable.departmentId` but not `usersTable.status`, unlike the roster query at `admin.ts:428`. | Rejected and pending students are counted in `totalStudents` and appear in the HOD's registrations table as "Active". Same department only — no cross-tenant exposure. | Add `eq(usersTable.status, "approved")`. |
| SEC-23 | Low | `artifacts/mockup-sandbox/src/components/LoginProductPreview.tsx:32,33,52` | "Pediatrics" is hardcoded three times and paired with a fabricated resident profile — registration `PG2024-PAED-187`, joined `01/06/24`, completion `01/06/27`. | Every visitor to the login page of a second department sees another department's name in the product illustration. AGENTS.md §5, and §7 on invented data. | Drive the preview from the selected department, or make the labels generic. |
| SEC-24 | Low | `HODPortal.tsx:133,141`; `layout/AppLayout.tsx:169`; `pages/AttendancePage.tsx:74`; `pages/PrintableLogbook.tsx:52`; `pages/AcademicLogsPage.tsx:77`; `pages/CaseLogsPage.tsx:98`; `pages/PostingsPage.tsx:68`; `pages/ProcedureLogsPage.tsx:107` | Nine whole-object console logs of the caught error. The object is an `ApiError` (`lib/apiClient.ts:3-13`) whose `.data` is the server's JSON error body. | Server error bodies are generic `{ message }` today, so no clinical text reaches the browser console — but the pattern prints whatever the server later starts returning. | Log a short string and the status code only. |
| SEC-25 | Low | `artifacts/api-server/src/routes/student.ts:297` | The only raw `sql` predicate built from request-derived values. Verified **not** an injection: drizzle binds `${studentId}` and `${currentYear + '-%'}` as parameters rather than concatenating them. | Nothing today. It is one careless edit away from string concatenation in the most sensitive table in the schema. | Rewrite as `and(eq(...), eq(...), like(...))` so raw SQL is not the idiom here. |
| SEC-26 | Low | `artifacts/mockup-sandbox/src/components/ui/chart.tsx:78` | The only `dangerouslySetInnerHTML` in the codebase. It interpolates `ChartConfig` keys and colour values into a `<style>` block. `ChartContainer` and `ChartConfig` are imported nowhere outside this file — vendored shadcn code that is currently dead. | Nothing today: no server data reaches it. If a future chart is fed API values as config keys or colours, this becomes a CSS-injection sink. | Delete the unused component, or hard-restrict the interpolated values to a `^[a-zA-Z0-9-]+$` allowlist before use. |
| SEC-27 | Low | `artifacts/api-server/src/routes/admin.ts:201` | `bcrypt.hash(password, 10)` for HOD-created faculty, against cost 12 everywhere else (`auth.ts:102,164,181`, `lib/department-provisioning.ts:19`). | Faculty password hashes are ~4× cheaper to attack than everyone else's if the database is ever exfiltrated. | Change to 12 for consistency. |
| SEC-28 | Low | `artifacts/api-server/src/lib/validation.ts:23` | Zod issue paths are returned verbatim, e.g. `patientUhid: Required`. | An unauthenticated caller can enumerate internal field names by probing schemas. Low value: the same names are visible in the client bundle. | Return a generic message and log the detail server-side, or accept it deliberately. |
| SEC-29 | Low | `.env.example` | Lists `ALLOWED_ORIGINS`, `VITE_API_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `EMAIL_USER`, `EMAIL_APP_PASSWORD` — but omits `DATABASE_URL` and `JWT_SECRET`, the two variables the application refuses to boot without (`lib/db/src/index.ts:8`, `artifacts/api-server/src/lib/env.ts:2`). | A new deployment fails at boot with no documented cause; historically this is what makes people reach for the hardcoded fallbacks in SEC-04. | Add both key names — names only, no values. |
| SEC-30 | Low | `artifacts/api-server/build.mjs:104` | `sourcemap: "linked"` emits `.mjs.map` alongside the server bundle, containing the full TypeScript source. | The maps are not served over HTTP by this application, so exposure requires filesystem or image access. Raises the value of any container compromise. | Use `sourcemap: false` in production builds, or keep maps and upload them only to an error reporter. |
| SEC-31 | Low | `pnpm-lock.yaml` (transitive dev tree) | Twelve high-severity advisories, all on build/dev-only paths: `js-yaml` ×2 (GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj), `brace-expansion` ×2 (GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895), `fast-uri` ×5 (GHSA-7p8r-x3mc-p8w7, GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp), `nanoid` (GHSA-2v37-7h3g-55p8), `browserslist` ×2 (GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g); plus `postcss` moderate (GHSA-fxqj-rqcc-2cmp) and `esbuild` low (GHSA-g7r4-m6w7-qqqr). Reached through `orval`, `drizzle-kit`, `vite` and `postcss`. | Requires an attacker who can already influence the build environment. Nothing on the served runtime path. | Refresh the dev toolchain when convenient — a dependency change, Phase 2 only and on your instruction. |
| SEC-32 | Low | `artifacts/mockup-sandbox/src/lib/apiClient.ts:61`, `:81` | A non-JSON response body's first 200 characters are placed into the thrown `ApiError` message, which surfaces in toasts. | If a proxy or gateway returns an HTML error page, fragments of it are shown to the user. No application data involved. | Use a fixed message and keep the body out of the UI. |
| SEC-33 | Low | `artifacts/api-server/src/migrate.ts:10` | Prints raw `error.message` when the error has no `code`. | Migration statements bind no clinical data, and `applyMigrations` uses a raw connection rather than drizzle, so no bound parameters are attached — but the branch is unbounded by design. | Bound the printed message or drop to the code-only branch. |

---

## Areas audited and found clean

These are reported as results, not omissions.

**B — the two ID systems.** Every place a `studentsTable.id` and a `usersTable.id` meet was traced to its source rather than inferred from the variable name. **No mismatch was found.**

| Site | Left side | Right side | Verdict |
|---|---|---|---|
| `middlewares/student-access.ts:15` | `studentsTable.userId` | `req.user.id` (users) | correct |
| `routes/student.ts:69`, `:155` | `req.user.id` (users) | `studentsTable.userId` | correct |
| `routes/student.ts:267`, `:376`, `:611`, `:648` | `studentsTable.id` from `userId` lookup | `:studentId` param (students) | correct |
| `routes/student.ts:464` | `assessorId` ← `req.user.id` (users) | — | correct, never client-supplied |
| `routes/student.ts:497`, `:509` | `researchTable.studentId` / `certificationsTable.studentId`, both FK to `studentsTable.id` (`schema/research.ts:12`, `schema/certifications.ts:11`) | `:studentId` param (students) | correct |
| `routes/professor.ts:32`, `:60`, `:64`, `:68` | `req.user.id` / `supervisorId` (both users) | `:professorId` param (users) | correct |
| `routes/logs.ts:51` | `supervisorId` (users) | `reviewer.id` (users) | correct |
| `routes/admin.ts:88-89` | `paymentsTable.userId` (users, `schema/payments.ts`) | `:id` param (users) | correct, and documented in-line at `:85-87` |
| `routes/assignments.ts:72`, `:86` | `usersTable.id` via `students.userId` join | `caller.id` (users) | correct |
| Frontend | `session.studentProfileId` → `/api/students/:id/*`; `session.id` → `/api/professors/:id/*` | | correct |

All `studentId` columns in the schema reference `studentsTable.id`; all `supervisorId` / `reviewerId` / `assessorId` / `guideId` / `mentorId` / `reviewedBy` columns reference `usersTable.id`. The two systems are used consistently.

**A — unauthenticated routes.** No admin, debug, seed or dev route is reachable without authentication. Three endpoints are public by design and were each checked: `GET /api/healthz` (`routes/health.ts:6`); `GET /api/departments/` (`routes/department.ts:10-15`), which returns only id, name, code and programme duration for departments that have an approved HOD, and is needed by the registration form; and `POST /api/payments/webhook` (`routes/payments-webhook.ts:36`), which is unauthenticated on purpose and verifies an HMAC signature over the raw body before touching anything, resolving ownership from the stored `razorpay_order_id` rather than from the payload. `routes/seed.ts` is a comment and an import; `provision-department.ts` is a CLI entry point requiring `DEPARTMENT_SETUP_FILE`, not a route.

**G — injection.** No SQL injection. All twelve `sql\`\`` sites (`admin.ts:19,131,169`; `auth.ts:58,74,169,182`; `department.ts:153`; `payments.ts:65,138`; `student.ts:297,408`) interpolate either a column reference or a bound parameter; none concatenates a string. No dynamic ORM filter is built from raw user input — `assignments.ts:30` escapes `\`, `%` and `_` before the `ilike`. No `child_process`, no `exec`, no `eval`, no `new Function`. No file upload, download or `sendFile` route exists, so there is no path-traversal surface; the only `readFile` is `provision-department.ts:8`, reading an operator-supplied CLI path.

**H — XSS.** One `dangerouslySetInnerHTML`, recorded as SEC-26 and currently dead. No `innerHTML`, no `eval`. All clinical and user-supplied text is rendered as React children — e.g. `HODPortal.tsx:539` `{leave.reason}` — and is therefore escaped.

**I — CORS.** Verified sound against the installed `cors@2.8.6`. `app.ts:29-55` uses a strict allowlist; production refuses to boot without `ALLOWED_ORIGINS` (`app.ts:35-39`); there is no wildcard and no reflection of an untrusted `Origin`. Reading `node_modules/.pnpm/cors@2.8.6/…/lib/index.js:218-221` confirms that a disallowed origin causes the middleware to call `next()` with **no** `Access-Control-Allow-Origin` header at all, so `credentials: true` is never paired with a permissive origin. The additional non-GET guard at `app.ts:57-74` enforces `application/json`, rejects untrusted origins with 403, and blocks cookie-authenticated writes that arrive without an `Origin` header.

**I — cookies.** `auth.ts:14` sets `httpOnly: true`, `secure` in production, `sameSite: "lax"`, `path: "/"`. Correct. (The token is nonetheless also handed to the client and used from `sessionStorage` — SEC-19.)

**E — hardcoded department behaviour.** No branch on `departmentId === 1` anywhere. No Pediatrics-specific procedure name, posting name or target number in server code: requirements come from `department_configs`, `procedure_types` and `department_catalog` throughout, and every write is scoped to `req.user.departmentId`. The only violation is the login-page illustration, SEC-23. `tests/support.ts:30` uses department names as fixtures and labels them synthetic — not a violation.

**F — secrets, otherwise.** `.env` is in `.gitignore:3` and is **not tracked** — `git ls-files` returns only `.env.example`. No secret reaches the client bundle: the sole `import.meta.env` reference outside `BASE_URL` is `VITE_API_URL` (`apiClient.ts:15,17`). `JWT_SECRET` (`lib/env.ts:1-5`) and `ALLOWED_ORIGINS` (`app.ts:35-39`) both fail closed at boot with no fallback value, exactly as commit `76daae7` established. `razorpayCredentials()` (`payments.ts:32-37`) returns null and the route answers 503 rather than substituting a value — a deliberate soft-fail, not a fallback secret.

**J — error responses.** No endpoint returns a stack trace or a raw database error. `app.ts:89-98` maps SQLSTATE `23505` / `23503` / `23514` to fixed messages, logs only a regex-validated five-character code, and returns a generic 500 otherwise.

---

## Notes for the developer

**1. Conflict between the task brief and the repository — AGENTS.md §12 requires me to raise this rather than pick a side.**

The brief states there is no test suite. There is one, and it works: `artifacts/api-server/tests/` runs 32 tests against in-process PGlite with no database and no network. I ran it once, as verification only:

```
ℹ tests 32   ℹ pass 32   ℹ fail 0   duration_ms 22772.4137
```

`tests/support.ts:62-68` issues real HTTP requests and returns real status codes, and `tests/tsconfig.json` aliases `@workspace/db` to the PGlite module, so the four-case evidence standard for Phase 2 is fully achievable without touching a database. AGENTS.md describes this suite; the brief does not. Please confirm which is authoritative before Phase 2.

**2. AGENTS.md §1 requires every task to begin with `git checkout main && git pull origin main`. The brief forbids git operations. I did neither** — I ran only read-only `git status`, `git log`, `git stash list` and `git ls-files`, and worked from `2f1204c` on `security-audit-2026-09`. Flagging rather than choosing.

**3. `npm audit --json` could not run.** There is no `package-lock.json` — this is a pnpm workspace — so npm exits `ENOLOCK`, and its suggested remedy (`npm i --package-lock-only`) writes a lockfile, which Phase 1 forbids. I substituted `pnpm audit --json`, which reads `pnpm-lock.yaml`, contacts the advisory API and writes nothing; `git status` was byte-identical afterwards. Results are in SEC-21 and SEC-31. Say the word if you would rather I had not run it.

**4. Git ownership warning.** Git refuses this working directory as "dubious ownership" (owned by `BUILTIN\Administrators`, running as `NITROG\aravi`). The documented fix writes to your global git config, which the brief forbids, so I passed `-c safe.directory=…` per-command instead and changed nothing. Worth fixing at your convenience.

**5. Untracked file present.** `PR_DESCRIPTION.md` is untracked at the repository root. AGENTS.md §1 treats a dirty tree as a stop condition; since Phase 1 is read-only I continued, but it should be resolved before Phase 2 commits.

**6. No database command was run at any point.** No `drizzle-kit push`, no `drizzle-kit generate`, no `drizzle-kit migrate`, no `psql`, no client of any kind, read or write. `DATABASE_URL` is not set in this shell, and the test suite reaches PGlite in-process only.

---

## Status

| Finding | Status | Commit |
|---|---|---|
| SEC-04 | **FIXED** | `bcbb109` — *fix(security): delete eight scripts carrying a hardcoded database credential* |
| SEC-01, SEC-02, SEC-05 | **FIXED** | `ca77022` — *fix(security): scope six student.ts routes by ownership/supervision, not just department* |
| SEC-03, SEC-08 | **FIXED** | `f68c2bd` — *fix(security): stop logging bound query parameters on two routes* |
| SEC-11 | **FIXED** | `9c51ea5` — *fix(security): invalidate the session token on logout* |
| SEC-09, SEC-10, SEC-23 | **FIXED** | `1dbe79c` — *fix(security): stop three UI surfaces from showing something untrue on failure* |
| SEC-07 | **FIXED** | `619771c` — *fix(security): stop logging bound query parameters at the remaining 25 sites* |
| SEC-12 | **FIXED** | `d3dab84` — *fix(security): resolve the real client IP for rate limiting, add a per-account login lockout* |
| SEC-06 | **FIXED** | `ede73b0` — *fix(security): fail closed on department scope in three student.ts routes* |
| SEC-34, SEC-35, SEC-36, SEC-37 | **FIXED** | `6508b19` — *fix(security): collapse existence-vs-ownership status codes on four routes (SEC-34-37)* |
| SEC-14, SEC-15, SEC-16, SEC-17 | **FIXED** | `622a0e2` — *fix(security): stop four surfaces from rendering fake data on a failed load (SEC-14-17)* |
| All others (SEC-13, SEC-18 … SEC-33 excl. 34-37) | **OPEN** | — |

**Batches B through H are all complete.** Every finding named in `docs/SECURITY_FIXES.md` is fixed and committed. SEC-34 through SEC-37 — found during the §1b preflight, out of scope for the original task — were fixed separately on 2026-09-09: see "SEC-34–37" below.

### SEC-34–37 — existence-vs-ownership status collapse, fixed `6508b19`

`logs.ts` PATCH `/:logType/:logId/review`, `professor.ts` GET `/:professorId/review-queue`,
`admin.ts` POST `/students/:id/approve`, POST `/students/:id/reject`, DELETE `/users/:id`, and
`payments.ts` POST `/verify` each looked up the row first (404 if absent) and only then
checked ownership (403 if present but not the caller's) — letting any authenticated caller
enumerate ids by walking them and watching the status code. All seven call sites (three in
`admin.ts`) now fold the existence check into the same condition as the ownership check and
return one 403 with one fixed body for both, mirroring `studentAccess` and `admin.ts`'s own
`/leaves/:id/action`, per the exception recorded in `docs/SECURITY_FIXES.md`'s corrected
Evidence Gate B.

**Breaking-change check, done before any edit.** Grepped `artifacts/mockup-sandbox/src/` for
every call site of all four routes, then grepped the whole frontend for any code branching on
`.status === 404` / `.status === 403` (via the `ApiError.status` field every call site's catch
can see). The only status-based branch anywhere in the frontend is `LoginPage.tsx:53`
(`err.status === 402`, an unrelated payment-required flow). No call site of any of these four
routes treats 404 and 403 differently — every one shows the same generic toast/error message
regardless of status. Collapsing them changes no frontend behavior.

**Evidence:** `artifacts/api-server/tests/enumeration-collapse.test.ts`, one test per route (six —
`admin.ts` gets three), each asserting all four cases (401 unauthenticated, 403 wrong-owner, 200
correct-owner, 403 nonexistent-id) and `assert.deepEqual` on the full response body between the
wrong-owner and nonexistent-id cases, not just the status. `access.test.ts:214` asserted the old
404 for a nonexistent id on `/admin/students/:id/approve`; updated to 403, the only other file this
change touched. Full suite: 60/60, zero regressions. `tsc --noEmit`: clean.

### SEC-14–17 — fake data on a failed load, fixed `622a0e2`

Re-verified 2026-09-09 against the corrected line numbers from the earlier scan
(`HODPortal.tsx:282-284` for SEC-14; `:158-168`/`:329-331`/`:371`/`:427` for SEC-15). All four
were confirmed still live before editing — none turned out to be a legitimate empty state.

- **SEC-14** (`HODPortal.tsx:282-284`) was dead code: `logStats`/`topProcedures`/`totalLogs`
  were computed with `?? 0`/`?? []` fallbacks but never referenced by any render in the file
  (grepped for `logStats.`, `totalLogs`, `topProcedures.` — the only hit was the declaration
  itself). Deleted outright; no error state was needed since nothing rendered it.
- **SEC-15** (`HODPortal.tsx` roster tab) — a second, independent instance of the file's named
  regression (SEC-10 fixed the analytics panel; this is the roster tab). On a failed
  `fetchRoster`, the toast faded and the tab then rendered "0 Approved students / 0% Average
  progress / 0 Faculty" and "No students/faculty in this department." — indistinguishable from
  a real, empty department. Fixed with a `rosterError` state that replaces the summary cards
  and both tables with a visible error and Try again.
- **SEC-16** (`AttendancePage.tsx:44-46,73-76`) — the leave-balance fetch failure left `balance`
  at its initial `{used: 0, total: null}` shape, which the backend also returns for a real,
  genuinely-unconfigured department (`student.ts:339-340`) — a resident who had actually used
  leave would see "0 used" and could believe their full allowance was untouched. Fixed with a
  `balanceError` state that replaces the two leave-balance cards (not the unrelated "Pending
  Approval" card, which is driven by a separate, successful fetch).
- **SEC-17** (`AssessmentsPage.tsx:34-35`, `PostingsPage.tsx:58-59`) — both left their list at
  `[]` on failure, rendering the same "you have none yet" empty state a real empty list would.
  Postings' version additionally invited adding a new posting, risking a duplicate if real
  postings existed but failed to load. Both fixed with an `error` state that replaces the
  empty-state with a visible error and Try again, mirroring `CaseLogsPage.tsx`'s existing
  pattern.

**Noticed, not fixed (AGENTS.md sec 9 — flagged, not silently expanded into this diff):**
`AttendancePage.tsx`'s leave-*records* list (`leaves`, rendered around `:180`) has the same
shape of issue as SEC-17 — a failed fetch and a genuinely empty list both render "No leave
records yet." It shares one combined `fetchLeaves`/`Promise.all` with the balance fetch this
batch did fix, but was not itself one of the four named findings, so it was left alone here.

**Evidence:** verified live, not just read, against the ephemeral PGlite-backed harness
(`tests/preview.ts` on port 3000 + `vite dev` on port 5173, proxying `/api` to it — no
`DATABASE_URL` read or touched). Logged in as the synthetic `hod1@example.test` and
`student1@example.test` fixture accounts, monkeypatched `window.fetch` in the browser to reject
one endpoint at a time (`/api/admin/roster`, `/leave-balance`, `/assessments`, `/postings`),
and confirmed by screenshot and `get_page_text` that each surface renders only the error state
and Try again button, with none of the fabricated strings/zeros anywhere in the DOM. Restored
`fetch` and confirmed the roster tab's Try again recovers to real data (2 approved students, 2
faculty) - the fix does not break the happy path. `tsc -p tsconfig.json --noEmit`: clean. No
automated frontend test suite exists in this project to run.

### Phase 2 progress

**Step 0 — two-ID-system evidence: complete.** The full site-by-site trace requested is in the section below — 90 rows, 0 defects. This replaces the unsupported "clean" assertion made in Phase 1.

**Batch A — SEC-04: complete, committed as `bcbb109`.** All eight files deleted. Pre-deletion reference check passed: `git grep` across every tracked file, plus explicit checks of `package.json` at all four workspace levels, `pnpm-workspace.yaml`, `.replit`, `vercel.json` and `scripts/post-merge.sh`. The repository has no CI workflow files. The only surviving references are the prose in AGENTS.md §13 that documents the problem. No credential value appears in the diff, the commit message, or this report.

Note: the commit message was amended once, immediately after creation, to strip a stray `@` character that leaked from PowerShell here-string syntax into a Bash call. Message only, no content change, on an unpushed local tip. No rebase, no force, no history rewrite of anything previously pushed.

**Batch B's Evidence Gate, as originally written, was not satisfiable — flagged and stopped rather than worked around.** The gate required a genuine 404 for "nonexistent studentId," distinguishable from the 403 the same middleware returns for "wrong owner." Live-probed against `/logs` — the reference route Batch B is told to mirror — using an HOD account and a `studentId` verified absent from every department: `403 {"message":"Student is outside your access scope"}`, identical to both the wrong-owner and cross-department cases. `access.test.ts:61` already asserts this. The gate was corrected by the developer in `docs/SECURITY_FIXES.md` (new §1b, corrected §2 Evidence Gate B) rather than worked around.

**§1b preflight — complete, read-only.** Surveyed every route in the API that resolves a caller-supplied row id for the same 403-collapse property `studentAccess` is documented to have. All 18 `student.ts` routes under `/:studentId` inherit it uniformly (empirically confirmed for 8 of them via the pre-existing, passing `access.test.ts:61`; the remaining `student.ts` routes are either write-only with no existing-row lookup, or a two-tier `:logId` check with a single combined predicate, verified by direct reading). `assignments.ts`'s two `:recipientId` routes and `admin.ts`'s `/leaves/:id/action` and `/department/{procedures,catalog}/:id` use a single combined query and were confirmed safe (live-tested for `/leaves/:id/action`: nonexistent and cross-department both return identical `404 {"message":"Leave not found"}`). `department.ts`'s `:departmentId` routes compare the param to the caller's own department id directly, with no separate existence path — the one internal 404 branch (`analytics`, `:99-103`) is unreachable by construction.

Four routes broke the pattern — an existence check and an ownership check in **separate branches with different status codes and bodies** — all live-confirmed with real requests: `logs.ts` PATCH `/:logType/:logId/review`, `professor.ts` GET `/:professorId/review-queue`, `admin.ts` POST `/students/:id/approve`, POST `/students/:id/reject` and DELETE `/users/:id`, and `payments.ts` POST `/verify`. None is one of Batch B's six routes. Recorded as **SEC-34** through **SEC-37**, severity High, per §1b's explicit instruction: recorded, not fixed — out of scope for this task. Continuing to Batch B, as §1b directs when the discrepancy is outside it.

**Batches B through H — now unblocked and in progress.** The guard hook was widened by the developer to cover `artifacts/api-server/src/`, `artifacts/api-server/tests/` and `artifacts/mockup-sandbox/src/` for this task. Verified live before use, not assumed.

**Batch B — complete, committed as `ca77022`.** All six routes fixed by mirroring `student.ts:165-173`'s existing supervisor-scoping. `/leave-records` and `/certifications` exclude professors entirely (no supervisor relationship exists on either table) and reuse `studentAccess`'s exact 403 body rather than a custom message — caught and fixed during implementation, before writing tests: a distinct message would have let a professor learn whether a `studentId` exists by comparing 403 text, reintroducing the §1b enumeration leak one layer above `studentAccess`. `/postings`, `/assessments` and `/thesis` scope professors by `supervisorId`/`assessorId`/`guideId`-or-`coGuideId` and return 200 with filtered (possibly empty) data for a non-supervising professor, matching `/logs`'s actual behaviour — not a route-level 403, a deliberate reading documented inline in the test file, not a silent guess. `/dashboard`'s `recentLogs` is now supervisor-scoped, excludes soft-deleted rows, and its `SELECT` is narrowed to `{id, date, status}` — no clinical columns, and the field is unconsumed by the frontend regardless. Evidence: `artifacts/api-server/tests/ownership.test.ts`, 7 tests, all 24 required status codes plus the additional soft-delete and non-supervising-professor cases. Full suite after the change: 39/39, zero regressions.

**Batch C — complete, committed as `f68c2bd`.** Both catch blocks (`student.ts` leave-records POST, `admin.ts` professor-creation POST) were passing the raw caught error to `req.log.error`; `drizzle-orm`'s `DrizzleQueryError.message` carries the SQL plus every bound parameter, so a failure leaked the leave reason or the new professor's bcrypt hash. Both now log `{id-field, status: 500}` only, matching `app.ts:96`. Evidence Gate C: forced a real failure on each route via a `CHECK(false) NOT VALID` constraint (added and dropped inside the test, touching no other fixture data), planted a secret marker in the field that would have leaked, and ran with `NODE_ENV=production` so pino's real, un-prettified line actually prints instead of being swallowed by the suite's normal `LOG_LEVEL=silent`. Both captured lines are pasted in the commit message; grepped for the leave-reason marker, the plaintext-password marker, `"insert into"`, `"params:"`, and a bcrypt hash pattern — zero matches on all five, on both lines. Full suite: 41/41, zero regressions; confirmed the `NODE_ENV`/`LOG_LEVEL` override does not leak into other test files (`node:test` runs each file in its own process).

**Batch D — complete, committed as `9c51ea5`.** `POST /auth/logout` only cleared the cookie; the frontend authenticates via a Bearer token in `sessionStorage`, unaffected by that. Fixed using the `sessionVersion` mechanism this codebase already has (bumped by `change-password` in the same file), rather than a new blocklist: logout now requires `requireAuth` and bumps the caller's `sessionVersion`, mirroring `change-password`'s existing pattern line for line. Confirmed safe to require auth here: the frontend already calls logout fire-and-forget (`App.tsx:194`) and clears local session state regardless of the response. Evidence Gate D, plus two additional cases: token works pre-logout (200) → logout (200) → same token reused (401) → freshly issued token post-logout (200, login not broken) → the original token stays dead even after that sibling re-login (401, since `sessionVersion` only increases) → logout itself with no token at all (401, fail closed). `artifacts/api-server/tests/logout.test.ts`. Full suite: 43/43, zero regressions.

**Batch E — complete, committed as `1dbe79c`.** `PrintableLogbook.tsx`: every per-call `.catch(() => <empty>)` removed; `window.print()` now fires only after all five requests succeed, inside the same try block — any failure sets a visible error with retry/cancel and prints nothing. `HODPortal.tsx`: `error` now replaces the whole portal with a full error state (the actual SEC-10 defect — a failed load previously still rendered "a complete, ordinary-looking portal"); `analyticsError` renders as a banner with retry. No new fallback numbers introduced; the pre-existing dead `logStats`/`topProcedures`/`totalLogs` computation was left untouched, as removing dead code is outside this batch. `LoginProductPreview.tsx`: the fabricated resident (`PG2024-PAED-187`, fake dates) replaced with this codebase's own existing `"—"` convention; the three hardcoded "Pediatrics" occurrences became neutral wording — no substitute fake identifier introduced. This repo has no frontend test framework, and installing one is forbidden by this task, so Evidence Gate E was gathered live in a real browser: rendered both components in isolation via the project's own existing `/preview/<name>` mockup mechanism (bypasses login entirely) against a throwaway `node:http` stub standing in for the backend (one real 200, 500 for everything else); all scaffolding and the stub were deleted before the commit, confirmed via `git status` showing only the three real files changed. Captured: all 5 of PrintableLogbook's requests fired and returned 500, page showed the new error text, no print dialog (network log + screenshot). HODPortal with a seeded user showed the `analyticsError` banner with no fallback numbers anywhere in the page text; with no user, the entire normal portal (header, tabs) did not render — only "Not logged in / Try again" did (screenshots both cases). Login page's full text dump: "Your department", four `"—"` values, zero occurrences of "Pediatrics" or "PG2024". `tsc --noEmit` and `vite build` both clean.

**Batch F — complete, committed as `619771c`.** Step 1 reconciliation done before touching any code: SEC-07's prose said "23 sites" but its own File:line column enumerates 25; re-reading all five files directly (not trusting either number) confirmed 25 is correct — a plain arithmetic slip in the original write-up (9+11+3+1+1=25), not an overlap with SEC-03/SEC-08, neither of which appears in that list. Line numbers had shifted from Batches B/C/E's earlier edits to `student.ts`/`admin.ts`, so every site was re-located by its stable message string rather than trusted by line number. Same mechanism as SEC-03/SEC-08: all 25 log an id and status code only now. One correction made mid-batch, before any test ran: most of these ids are declared inside their `try` block, a separate lexical scope from the `catch` block the log call lives in — `tsc --noEmit` caught this immediately (TS18004 at 23 sites) before it reached any test, and every site was fixed to use a directly-in-scope expression (`req.params.X` / `req.user!.departmentId`) instead, matching what Batch C already did correctly for its two sites. Evidence Gate F: grepped all five files for `req.log.error(error` and `console.error` — zero matches. Full suite: 43/43, zero regressions; no new test required for this batch, per its own evidence spec.

**Batch G — complete, committed as `d3dab84`.** `app.set("trust proxy", 1)` added to `app.ts` — exactly one hop, not `true`, per the batch's explicit warning. Verified empirically before writing any test (a throwaway, uncommitted diagnostic): with a numeric trust proxy, Express always resolves `req.ip` to the **last** `X-Forwarded-For` entry regardless of how many precede it, so a value an attacker prepends before reaching the real load balancer is discarded — only what that one trusted hop itself appends is trusted. `auth.ts`'s existing IP throttle needed no code change beyond this (it already read `req.ip`). Added a second, independent mechanism: a per-account failed-login counter (10 failures / 15 min, checked before the password comparison, cleared on success) — the IP throttle alone does nothing against an attacker spread across many source IPs targeting one account. Evidence Gate G, all three required cases plus one extra: two distinct resolved IPs get two separate buckets; 100 requests with a varying attacker-prepended prefix but a fixed real last-hop all land in one bucket (attacker-controlled prefix is ignored); one account driven to lockout via 10 different simulated source IPs does not block a different account; a success below threshold genuinely resets the counter. `artifacts/api-server/tests/rate-limit.test.ts`. Full suite: 47/47, zero regressions.

**Batch H — complete, committed as `ede73b0`.** Three fail-open conditionals inverted: `leave-balance` and `assessments` GET got a guard clause (`if (departmentId === null) { 403; return; }`) ahead of their existing lookup; `assessments` POST got a De Morgan inversion of its combined condition. `requireDepartment` stays mounted, unchanged. Two facts emerged while gathering evidence, both changed how this had to be verified. First: the scenario cannot be produced over HTTP at all — three independent, out-of-batch-scope layers each separately prevent it (`requireDepartment`; the database's own `users_department_required` CHECK constraint, which makes a null `departmentId` an impossible data state for these three roles, not an application choice; and `studentAccess`'s own department-matching query, which via ordinary SQL equality — `column = NULL` is never true — already 403s a null-department caller before any of these three handlers run). `dept-scope-failclosed.test.ts` proves the three HTTP-reachable cases per route and documents the unreachability rather than asserting a case that cannot run. Second, and following directly from the first: since the fixed code is therefore never exercised by any HTTP request today, its only purpose — continuing to fail closed the day one of those three layers is removed — cannot be verified by an HTTP test either. So `dept-scope-failclosed-unit.test.ts` tests it at the level it lives at: each handler pulled directly out of the real, unmodified router via Express's own `route.stack` (no server, no `requireAuth`/`requireDepartment`/`studentAccess` — none touched, removed, or weakened), called with a hand-built `req` carrying `departmentId: null`, asserting 403 and that the consequential database call never happens (the insert, for the POST route, whose own pre-existing design still needs two stubbed reads first; any select at all, for the two GET routes). Verified the unit test actually catches a regression, not just passing tautologically: reverted the POST guard to its old form, watched the test fail with a specific message, restored the fix, reran clean. Full suite: 54/54 passing (51 prior + 3 new), zero regressions.

---

## Step 0 — two ID systems: full site trace

Every site where a `studentsTable.id` value and a `usersTable.id` value are compared, assigned, or passed to one another. Each side traced to the column or expression it originates from, not inferred from the variable name.

### The two spaces, and where they are established

| Space | Canonical source | Columns that hold it |
|---|---|---|
| **U** = `usersTable.id` | `usersTable.id` | `students.userId`, `students.mentorId`, `*_logs.supervisorId`, `*_logs.reviewedBy`, `assessments.assessorId`, `leave_records.reviewedBy`, `postings.supervisorId`, `research.guideId`, `research.coGuideId`, `progress.guideId`, `progress.coGuideId`, `appraisals.evaluatorId`, `attendance.verifiedBy`, `leave.approvedBy`, `payments.userId`, `assignments.facultyId`, `assignment_types.createdBy`, `assignment_recipients.reviewedBy`, `audit.performedById` |
| **S** = `studentsTable.id` | `studentsTable.id` | `case_logs.studentId`, `procedure_logs.studentId`, `academic_logs.studentId`, `leave_records.studentId`, `postings.studentId`, `research.studentId`, `assessments.studentId`, `certifications.studentId`, `attendance.studentId`, `appraisals.studentId`, `progress.studentId`, `assignment_recipients.studentId` |

Verified against `lib/db/src/schema/`: every `student_id` column carries `.references(() => studentsTable.id)`; every supervisor/reviewer/assessor/guide/faculty/creator column carries `.references(() => usersTable.id)`. There is no column whose FK contradicts its name.

**Where each request-supplied id enters, traced to origin:**

- `req.user.id` → **U**. Set at `middlewares/auth.ts:59` from the row selected at `:48-50`, whose first projected column is `id: usersTable.id`. The JWT `id` claim it is looked up by is minted at `routes/auth.ts:148` from `user.id`, where `user` is a full `usersTable` row (`auth.ts:128`).
- `req.paymentUser.id` → **U**. Set at `middlewares/payment-token.ts:45` from `account.id`, selected at `:35-36` as `id: usersTable.id`.
- `:studentId` route param → **S**. Confirmed three ways: `middlewares/student-access.ts:13` resolves it with `eq(studentsTable.id, …)`; the session field the frontend sends is `studentProfileId`, projected at `routes/auth.ts:120` as `studentProfileId: studentsTable.id`; and every frontend call site uses that field (`Dashboard.tsx:43`, `AppLayout.tsx:167`, `CaseLogsPage.tsx:84,129,146`, `ProcedureLogsPage.tsx:78,92,132`, `AcademicLogsPage.tsx:59,104`, `AssessmentsPage.tsx:32`, `AttendancePage.tsx:53,54,103`, `PostingsPage.tsx:56,82`, `MilestonesPage.tsx:29`, `PrintableLogbook.tsx:32-38`).
- `:professorId` route param → **U**. Confirmed by `routes/professor.ts:40`, which resolves it with `eq(usersTable.id, professorId)` and requires role professor/hod; the frontend sends `user.id`, projected at `routes/auth.ts:119` as `id: usersTable.id` (`ProfessorPortal.tsx:113`).
- `/admin/:id` route params → **U**. `routes/admin.ts:20,74,119,152` all resolve with `eq(usersTable.id, …)`; the frontend sends the roster's `id` field, projected at `admin.ts:417` as `id: usersTable.id` — deliberately distinct from `studentProfileId: studentsTable.id` at `:418`.

The single most load-bearing line for this whole discipline is `routes/auth.ts:119-120`, which projects both ids into the session under **different names**. Every downstream correctness result depends on it.

### Site table

`join` = the U↔U bridge predicate `students.userId = users.id`; both sides are U by definition of the column.

| File:line | Left value | Src | Right value | Src | OK? |
|---|---|---|---|---|---|
| `middlewares/student-access.ts:12` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `middlewares/student-access.ts:13` | `studentsTable.id` | S | `:studentId` (idSchema) | S | OK |
| `middlewares/student-access.ts:15` | `student.userId` (sel. `:11`) | U | `caller.id` (`auth.ts:59`) | U | **OK — the ownership check** |
| `routes/student.ts:29` | `usersTable.id` | U | `supervisorId` param (client body) | U | OK — existence/department check only, never an ownership decision |
| `routes/student.ts:57` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/student.ts:59` | `studentsTable.id` | S | `studentId` (`:40`) | S | OK |
| `routes/student.ts:69` | `caller.id` | U | `student.userId` (sel. `:48`) | U | **OK** |
| `routes/student.ts:79,80,81` | `*LogsTable.studentId` | S | `studentId` | S | OK |
| `routes/student.ts:98,99` | `*LogsTable.studentId` | S | `studentId` | S | OK |
| `routes/student.ts:143` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/student.ts:145` | `studentsTable.id` | S | `studentId` (`:126`) | S | OK |
| `routes/student.ts:155` | `caller.id` | U | `student.userId` (sel. `:135`) | U | **OK** |
| `routes/student.ts:166,169,172` | `*LogsTable.supervisorId` | U | `caller.id` | U | **OK — the pattern Batch B is to mirror** |
| `routes/student.ts:166-173` | `*LogsTable.studentId` | S | `studentId` | S | OK |
| `routes/student.ts:177,180,183` | `*LogsTable.supervisorId` | U | `usersTable.id` | U | join — OK |
| `routes/student.ts:218` | `postingsTable.supervisorId` | U | `usersTable.id` | U | join — OK |
| `routes/student.ts:219` | `postingsTable.studentId` | S | `studentId` (`:207`) | S | OK |
| `routes/student.ts:243,247` | insert `studentId`→`postings.studentId` | S→S | insert `supervisorId`→`postings.supervisorId` | U→U | **OK — both spaces in one statement, each to its own column** |
| `routes/student.ts:266` | `studentsTable.userId` | U | `caller.id` | U | OK |
| `routes/student.ts:267` | `ownProfile.id` (sel. `:264` = `studentsTable.id`) | S | `studentId` | S | **OK — resolves S from U through the DB, per AGENTS.md §4** |
| `routes/student.ts:276` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/student.ts:277` | `studentsTable.id` | S | `studentId` | S | OK |
| `routes/student.ts:297` | `leaveRecordsTable.studentId` | S | `studentId` | S | OK |
| `routes/student.ts:329` | `leaveRecordsTable.studentId` | S | `studentId` (`:328`) | S | OK |
| `routes/student.ts:350` | insert `studentId`→`leave_records.studentId` | S→S | — | — | OK |
| `routes/student.ts:375` | `studentsTable.userId` | U | `caller.id` | U | OK |
| `routes/student.ts:376` | `ownProfile.id` (sel. `:373`) | S | `studentId` | S | **OK** |
| `routes/student.ts:386` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/student.ts:387` | `studentsTable.id` | S | `studentId` | S | OK |
| `routes/student.ts:413` | `assessmentsTable.assessorId` | U | `usersTable.id` | U | join — OK |
| `routes/student.ts:414` | `assessmentsTable.studentId` | S | `studentId` | S | OK |
| `routes/student.ts:435` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/student.ts:436` | `studentsTable.id` | S | `studentId` (`:429`) | S | OK |
| `routes/student.ts:446` | `usersTable.id` | U | `student.userId` (sel. `:433`) | U | **OK — explicit S→U resolution through the DB** |
| `routes/student.ts:464,465` | insert `assessorId`←`req.user.id` | U→U | insert `studentId` | S→S | **OK — assessorId never client-supplied** |
| `routes/student.ts:477` | `researchTable.studentId` | S | `studentId` (`:476`) | S | OK |
| `routes/student.ts:490,491` | `guideId`/`coGuideId` (client body) | U | validated vs `usersTable.id` (`:29`) | U | OK |
| `routes/student.ts:497` | insert `studentId`←`:studentId` | S→S | `...body` `guideId`→`research.guideId` | U→U | OK |
| `routes/student.ts:503` | `certificationsTable.studentId` | S | `:studentId` | S | OK |
| `routes/student.ts:509` | insert `studentId`←`:studentId` | S→S | — | — | OK |
| `routes/student.ts:526,532` | `supervisorIdNum` validated vs `usersTable.id` | U | insert → `case_logs.supervisorId` (U) + `studentId` (S) | U/S | OK |
| `routes/student.ts:555,564` | as above, `procedure_logs` | U/S | | | OK |
| `routes/student.ts:580,589` | as above, `academic_logs` | U/S | | | OK |
| `routes/student.ts:610,611` | `studentsTable.userId`=`caller.id`; `ownProfile.id`≠`studentId` | U/S | | | **OK** |
| `routes/student.ts:616` | `caseLogsTable.studentId` | S | `studentId` | S | OK |
| `routes/student.ts:647,648,653` | as `:610,611,616`, procedure logs | U/S | | | **OK** |
| `routes/professor.ts:32` | `caller.id` | U | `professorId` (`:24`) | U | **OK — confirmed U by `:40`** |
| `routes/professor.ts:40` | `usersTable.id` | U | `professorId` | U | **OK — this line is what proves the param's space** |
| `routes/professor.ts:60,64,68` | `*LogsTable.supervisorId` | U | `professorId` | U | **OK** |
| `routes/professor.ts:77,92,106` | `*LogsTable.studentId` | S | `studentsTable.id` | S | OK |
| `routes/professor.ts:78,93,107,175` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/professor.ts:117,134,151` | out `studentId`←`student.id` | S | consumed by frontend as `/api/students/:id` | S | OK |
| `routes/professor.ts:180-195, 210-212, 215` | log `studentId` grouped, keyed by `s.studentId` (`:168` = `studentsTable.id`) | S | S | S | OK |
| `routes/logs.ts:51` | `target.supervisorId` (sel. `:32/35/38`) | U | `reviewer.id` | U | **OK** |
| `routes/logs.ts:60,77` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/logs.ts:61` | `studentsTable.id` | S | `target.studentId` | S | **OK** |
| `routes/logs.ts:73` | `reviewedBy`←`reviewer.id` | U→U | — | — | OK |
| `routes/logs.ts:82,85,88` | `*LogsTable.studentId` ∈ `{studentsTable.id}` | S | `*LogsTable.supervisorId`=`reviewer.id` | U | **OK — both in one predicate, each correct** |
| `routes/admin.ts:20,74,119,152` | `usersTable.id` | U | `:id` param | U | OK |
| `routes/admin.ts:51,248,427` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/admin.ts:89` | `paymentsTable.userId` | U | `userId` (`:66`) | U | **OK — documented in-line at `:85-87`** |
| `routes/admin.ts:163` | `target.id` (usersTable row) | U | `req.user.id` | U | OK |
| `routes/admin.ts:247` | `leaveRecordsTable.studentId` | S | `studentsTable.id` | S | OK |
| `routes/admin.ts:282` | `reviewedBy`←`req.user.id` | U→U | — | — | OK |
| `routes/admin.ts:285,286` | `leaveRecordsTable.studentId` ∈ `{studentsTable.id}` | S | S | S | OK |
| `routes/admin.ts:417,418` | out `id`←`usersTable.id`; `studentProfileId`←`studentsTable.id` | U / S | — | — | **OK — both emitted, distinct names** |
| `routes/admin.ts:453,454,455` | `caseCounts.get(student.studentProfileId)` | S | maps keyed by log `studentId` | S | **OK — uses `studentProfileId`, not the sibling `id`** |
| `routes/assignments.ts:24` | `createdBy`←`req.user.id` | U→U | — | — | OK |
| `routes/assignments.ts:32,70,85,108` | `students.userId` | U | `users.id` | U | join — OK |
| `routes/assignments.ts:44,45` | `students.id` ∈ `body.studentIds` | S | client-supplied, re-validated vs dept+role | S | OK |
| `routes/assignments.ts:48` | `facultyId`←`caller.id` | U→U | — | — | OK |
| `routes/assignments.ts:50` | `recipients.studentId`←`s.id` (sel. `students.id`) | S→S | — | — | OK |
| `routes/assignments.ts:52,93,116` | `audit.performedById`←`caller.id` | U→U | — | — | OK |
| `routes/assignments.ts:69` | `recipients.studentId` | S | `students.id` | S | OK |
| `routes/assignments.ts:72` | `users.id` (via recipients→students→users) | U | `caller.id` | U | **OK — student branch** |
| `routes/assignments.ts:72,110` | `assignments.facultyId` | U | `caller.id` | U | **OK — professor branch** |
| `routes/assignments.ts:86` | `students.userId` | U | `caller.id` | U | **OK** |
| `routes/assignments.ts:113` | `reviewedBy`←`caller.id` | U→U | — | — | OK |
| `routes/auth.ts:109` | `students.userId`←`user.id` | U→U | — | — | OK |
| `routes/auth.ts:119,120` | out `id`←`usersTable.id`; `studentProfileId`←`studentsTable.id` | U / S | — | — | **OK — the origin of the whole discipline** |
| `routes/auth.ts:122,130` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/auth.ts:137` | `paymentsTable.userId` | U | `user.id` | U | OK |
| `routes/auth.ts:139,148` | JWT `id`←`user.id` | U→U | — | — | OK |
| `routes/auth.ts:177,182` | `usersTable.id` | U | `req.user.id` / `user.id` | U | OK |
| `routes/payments.ts:67,70,140,143` | `paymentsTable.userId` | U | `req.paymentUser.id` | U | OK |
| `routes/payments.ts:173` | `payment.userId` | U | `req.paymentUser.id` | U | **OK** |
| `routes/department.ts:108,109` | out `studentId`←`studentsTable.id`; `userId`←`studentsTable.userId` | S / U | — | — | OK — distinct names |
| `routes/department.ts:117` | `studentsTable.userId` | U | `usersTable.id` | U | join — OK |
| `routes/department.ts:129,133-135,151,166,170,174` | log `studentId` ∈ `studentIds` (`:120` from `s.studentId`) | S | S | S | OK |
| `routes/department.ts:191` | `caseMap[s.studentId]` | S | maps keyed by log `studentId` | S | OK |

**Result: 90 rows in the table above, covering roughly 130 individual predicates across 11 files. Zero defects.** No U value is ever compared or assigned to an S value or vice versa. The three places where the spaces must actually cross all resolve through the database rather than assuming the numbers match — `student.ts:267`, `student.ts:376`, `student.ts:446`, plus `student.ts:610/647` — which is exactly what AGENTS.md §4 requires.

**One observation, not a defect.** `student.ts:29` (`validateSupervisor`) takes a client-supplied **U** id from the request body. It is validated to exist in `usersTable` with role professor/hod in the caller's own department before use, and it only ever lands in a `supervisorId`/`guideId` column — it is never used to decide whose data is read or written. That is within AGENTS.md §4's "client-supplied IDs are never trusted for ownership decisions". Flagging it because it is the only place a client-supplied id from either space reaches a query at all.

---

## Fabricated-data scan — commit `ebd075e6b061ca0f4da21267030180e1239aa7a0`, 2026-09-09

Read-only. Requested after that commit's `HODPortal.tsx` fallback (`totalStudents: 15, avgCompletion: 42,
logStats: {...}, topProcedures: [{name: "Intubation", count: 20}]`, comment "Keep analytics mocked or
silent fail if endpoint missing") was named directly, with the developer not knowing the author account
`AI Bot <bot@example.com>`. Two parts: every file that commit touched, then the whole of
`artifacts/mockup-sandbox/src/` as it stands today.

**Top-line answer: nothing fabricated is currently rendering clinical or patient-facing data.** The
specific fallback named above is gone from the working tree. The broader pattern it belongs to —
AGENTS.md §7's "no fabricated fallback numbers" — is still live in the same file today, but every live
instance was already on record as SEC-14/SEC-15 (both **OPEN**, both re-verified below) before this scan
started; nothing new was found there. Detail follows.

### Part 1 — the commit itself, file by file

| File | Fabrication/silent-failure found at that commit | Still in working tree today? |
|---|---|---|
| `artifacts/mockup-sandbox/src/components/HODPortal.tsx:113-115` | The named fallback: `{totalStudents: 15, avgCompletion: 42, logStats: {pending:10, verified:45, rejected:2}, topProcedures:[{name:"Intubation", count:20}]}`, comment "Keep analytics mocked or silent fail if endpoint missing" (`:107`) | **No.** Replaced by Batch E (`1dbe79c`, fixing SEC-09/SEC-10/SEC-23) with a dedicated `analyticsError` state that renders a visible alert instead. |
| `artifacts/api-server/src/middlewares/auth.ts:73`, `artifacts/api-server/src/routes/auth.ts:305` | `const JWT_SECRET = process.env.JWT_SECRET \|\| "fallback-secret-for-dev-only"` — a hardcoded secret used the moment the real one is unset | **No.** `lib/env.ts` now reads `JWT_SECRET` and throws at startup, naming it, if unset (commit `76daae7`, predates this session). |
| `artifacts/mockup-sandbox/src/components/LoginPage.tsx:99,212` | `React.useState("Demo@2026")` prefilling the password field, plus "Demo account ready" copy | **No.** Current file has no demo-password prefill and no such copy. |
| `artifacts/mockup-sandbox/src/components/RegistrationPage.tsx:55` | `` kuhsId: `KUHS-${form.registrationNumber}` // Mock KUHS ID for now `` — fabricated instead of collected | **No.** `kuhsId` is now a real, required form field (`University ID`, `:237`). |
| `artifacts/api-server/src/seed.ts` (250+ lines, deleted since) | Console-logged "Created Mock Case Log" / "Created Mock Leave Request" and printed demo credentials on seed | **No.** Reduced to a 3-line legacy shim: "No demo users, passwords, or clinical records are inserted." delegating to `provision-department.ts`, which was also checked and is clean. |
| `artifacts/api-server/src/routes/student.ts` (removed by this commit, not added) | One pre-existing fabricated clinical narrative, `learningPoints: "Classified dehydration clinically and demonstrated ORS preparation."`, was deleted *by* this commit — introduced even earlier, not something to chase here | N/A — already gone, and gone before this session started |
| `artifacts/api-server/src/app.ts:59` | `cors({ origin: true, credentials: true })` — not this scan's a/b/c criteria (not fabricated data), but real and worth naming: reflects any origin with credentials on, forbidden by standing instruction | **No.** Current `app.ts:50-63` uses an explicit `ALLOWED_ORIGINS` allowlist that fails closed if unset. Checked because it was sitting right next to the fallback secret; not filed as a SEC item since it is already fixed and outside this scan's three-part scope. |
| `fix.js` (repo root) | Not fabrication — a one-off codemod script (`return res.status(...)` → `res.status(...); return;` across three route files, plus a `"Male"` → `"male"` seed replace) | Still present, untouched since. Not a §7 issue; noted only because it is dead tooling debris at the repo root. Not fixed here — out of this task's scope, flagging per AGENTS.md §9 rather than acting on it. |

`admin.ts` (new in this commit, 162 lines) and the rest of `auth.ts`'s diff were read in full: every catch
block logs and returns a proper status, no literal fallback data, no swallowed error. One comment worth
recording verbatim because it is the historical origin of the department-scoping bug class fixed in
Batches B/H: `admin.ts:236`, *"We should ideally filter by department, but for MVP HOD sees all leaves or
leaves in their dept"* — on `/admin/leaves/pending`, not one of Batch B's six routes or SEC-34–37's four.
Not filed as a new SEC item here since it is outside this scan's fabrication/silent-failure scope; flagging
its existence per AGENTS.md §9.

### Part 2 — current `artifacts/mockup-sandbox/src/` tree, whole-directory scan

Keyword sweep (`mock`, `dummy`, `sample`, `placeholder`, `demo`, `fallback`, `seed`) across every `.ts`/
`.tsx` file: the only hits are the Radix `AvatarFallback` UI primitive and the `mockup-sandbox`/`.generated/
mockup-components` path segments — both naming artifacts, not data. `PrintableLogbook.tsx:23-26` carries a
comment citing AGENTS.md §7 directly, explaining why it deliberately has *no* per-call `.catch` fallback —
evidence the rule is understood and applied correctly there, not a finding.

Every `catch` block in every page/component file under `components/` and `components/pages/` was read
(17 files: `Dashboard.tsx`, `DepartmentSettings.tsx`, `HODPortal.tsx`, `layout/AppLayout.tsx`,
`LoginPage.tsx`, `AcademicLogsPage.tsx`, `AssessmentsPage.tsx`, `AssignmentsPage.tsx`, `AttendancePage.tsx`,
`CaseLogsPage.tsx`, `MilestonesPage.tsx`, `PostingsPage.tsx`, `PrintableLogbook.tsx`,
`ProcedureLogsPage.tsx`, `PaymentStep.tsx`, `ProfessorPortal.tsx`, `RegistrationPage.tsx`). Every one either
calls `setError`/a dedicated error state, or `toast.error`, with the real message or a plain description —
no catch sets state to a fabricated literal. Four files render something misleading on a failure that is
reported as only a transient toast, with no persistent visible error state — all four were already on
record before this scan, all four re-verified live today:

- **SEC-15** — `HODPortal.tsx`, roster tab. Re-verified: `fetchRoster` (`:158-168`, unchanged) still only
  toasts; the render still shows "0 Approved students / 0% Average progress / 0 Faculty" and "No students
  in this department." on failure, indistinguishable from a real empty department. Line numbers for the
  three render sites have drifted (`309-312`→`329-331`, `350-351`→`371`, `406-407`→`427`) since Batch E
  added ~20 lines of unrelated error-state code above them; corrected in the row above. Still **OPEN**.
- **SEC-14** — `HODPortal.tsx`, dead analytics fallback. Re-verified still present and still unrendered
  (`logStats`/`topProcedures`/`totalLogs`, now `:282-284`); grepped the whole file for
  `logStats.`/`totalLogs`/`topProcedures.` and the only hit is the dead declaration itself. Still **OPEN**.
- **SEC-16** — `AttendancePage.tsx:44-45,73-76`. Re-verified: leave balance still initializes to
  `{used: 0, total: null}` and the fetch failure's `catch` (`:73`) still only logs and toasts, never
  resetting the balance to an error state. Still **OPEN**.
- **SEC-17** — `AssessmentsPage.tsx:34-35`, `PostingsPage.tsx:58-59`. Re-verified: both catches are still
  toast-only with the list left empty, indistinguishable from "you have none." Still **OPEN**.

**SEC-23** (`LoginProductPreview.tsx` — fabricated "Pediatrics" resident profile) was re-checked as part of
this sweep: confirmed **FIXED**, no match for any of the previously-fabricated strings in the current file.

**Net result: no new SEC finding.** This scan reproduced the already-recorded SEC-14/15/16/17 independently
before checking whether they were already tracked, then found they were — the audit already had this
pattern fully mapped. Nothing found in `ebd075e` or in today's tree falls outside SEC-01 through SEC-37 as
they already stand. The two line-number corrections above are the only change this scan made to existing
rows.
