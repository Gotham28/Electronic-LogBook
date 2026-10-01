# Admin resident approval and test-account management — implementation plan

Status: **Approved by the developer; Task 1 implementation is starting.**

Prepared: 2026-10-02 (Asia/Calcutta).

Repository: `C:\Users\user\Downloads\Electronic-LogBook`.

Analyzed commit: `14a4b62c5c02c1b660fccd3375e4e0714d4a0c22` on current `origin/main`.

This document is the requested one-off analysis and specification for two separate implementation tasks. It is not a roadmap. The developer approved the plan and clarified that no-payment handling for admin-created residents is existing behavior, not an additional feature. That behavior must be preserved when HOD approval is selected. Approval authorizes implementation of the specified application changes; it does not authorize production database changes, deployment, merges, or deletion of actual accounts.

## 1. Confirmed requirements and decisions

1. Each resident added through the admin portal gets an individual choice: **Approve by HOD** or **Automatic**. This is not a saved department setting.
2. The same choice applies when admin adds a resident to a mirror test department.
3. If Approve by HOD is selected and the target department has no active, approved HOD, the server creates an approved account automatically and explains that outcome.
4. Admin-created residents already bypass payment in the existing automatic-approval flow. The developer clarified this is existing behavior, not an additional feature request. Preserve that same no-payment policy when an admin-created resident is sent to the HOD queue. Normal self-registration retains its existing payment gate.
5. Normal self-registration continues to require payment followed by HOD approval. It has no automatic-approval choice.
6. Admin must be able to deactivate and permanently delete test residents and test professors, including professors added while impersonating the test HOD. Reactivation accompanies deactivation, consistent with the real-department controls.
7. Preserve existing HOD and admin account protections. This request does not add deletion or deactivation of test HOD accounts.
8. Preserve the HOD approval endpoint's existing indistinguishable `403` response for nonexistent and out-of-department targets. After the conflict with AGENTS.md §11 was explained, the developer authorized using safety judgment and disregarding AGENTS.md where necessary. The existing behavior prevents account-ID enumeration. Do not weaken it merely to produce a `404` evidence case.

Proposed defaults for approval with this document: show both choices in the form; initially select Automatic to preserve current admin behavior; reset the choice to Automatic for each new form. The no-HOD fallback applies at creation time. It does not retroactively approve residents who were already pending when their HOD subsequently disappeared.

## 2. What the repository actually does

| Concern | Finding | Source at analyzed commit |
|---|---|---|
| Admin-created residents are immediately approved | Correct. The backend writes `status: "approved"`; the UI always announces approval. This existing admin path does not require payment, as the developer clarified. | `artifacts/api-server/src/routes/superadmin.ts:569–608`; `artifacts/mockup-sandbox/src/components/AdminPortal.tsx:551–592, 987–993` |
| Admin can choose HOD approval | Incorrect today. Neither the request schema nor form has an approval-mode field. | `superadmin.ts:569–580`; `artifacts/mockup-sandbox/src/lib/apiClient.ts:171–173` |
| Admin can correctly add a test resident from Test accounts | The Add control is broken in that context. It casts the tab value `test-accounts` into a faculty/resident union. The submit handler then takes its resident branch but always passes the real `department.id`. Resident fields are hidden because the invalid type is not `resident`. Generated identifiers can allow this request to succeed in the real department. | `AdminPortal.tsx:466, 555–585, 879, 903`; defaults at `31–41` |
| Test HOD can add faculty | Correct. HOD routes use the authenticated HOD's department, including a test HOD's mirror department; new professors are approved. | `artifacts/api-server/src/routes/admin.ts:19, 209–260` |
| Admin cannot delete/deactivate test residents or faculty | Correct in the UI. Test rows have only Log in as for approved users. Backend support already exists for any department. | `AdminPortal.tsx:1080–1120`; `superadmin.ts:620–724` |
| Test accounts are a separate account system | Incorrect. They are ordinary users/student profiles in departments marked `isTest`, linked to a real department through `configSourceDepartmentId`. They differ from the browser-only demo mode. | `lib/db/src/schema/users.ts`; `artifacts/api-server/src/lib/department-provisioning.ts:86–145`; `apiClient.ts:39–46` |
| A pending admin-created resident can pass through the current HOD approval path | Not yet supported because the current admin creation path never creates pending residents. The generic HOD endpoint checks for a paid payment; login issues a payment token to an unpaid pending student. When adding the HOD option, preserve the developer-confirmed admin no-payment policy and keep the existing payment checks for self-registration. | `admin.ts:91–99`; `artifacts/api-server/src/routes/auth.ts:213–222` |
| Deactivate works on a pending resident | Incorrect. The endpoint only updates approved users, but returns success even if a pending account was not updated. This becomes relevant when admin can create pending residents. | `superadmin.ts:639–644` |
| Faculty Delete only deletes the faculty profile | Incorrect. The shared cascade also deletes resident records where the professor is supervisor, reviewer, verifier, guide, or approver. Deactivate preserves these records. | `artifacts/api-server/src/lib/hard-delete-user.ts:75–157`; existing warning in `AdminPortal.tsx:796–827` |

The two fixes must remain separate diffs. Task 1 includes correcting test-resident creation because the requested approval choice cannot function in a mirror department while the form targets the real department. Task 2 adds test-account lifecycle controls and fixes the pending-account deactivation no-op. These are explicit scope components, not incidental cleanup.

## 3. Task 1 — per-resident admin approval choice

Execution route: **B**. Review tier: **Opus/high** under the project's terminology, because this task adds a schema field, changes account authorization/payment eligibility, and resolves student profiles through user IDs. This does not prescribe changing the active chat model. Implemented locally on `codex/admin-resident-approval`; no commit or production application has occurred.

### 3.1 Required behavior

| Creation path | Choice | Active HOD in target department | Created status | Payment | Review queue |
|---|---|---|---|---|---|
| Admin → real department | Automatic | Either | approved | Not required | None |
| Admin → real department | Approve by HOD | Yes | pending | Not required | That real department's HOD |
| Admin → real department | Approve by HOD | No | approved | Not required | None; show fallback explanation |
| Admin → mirror department | Automatic | Either | approved | Not required | None |
| Admin → mirror department | Approve by HOD | Yes | pending | Not required | That mirror department's HOD |
| Admin → mirror department | Approve by HOD | No | approved | Not required | None; show fallback explanation |
| Self-registration | No choice | Available HOD required by existing registration | pending | Required | Own department's HOD after payment |
| HOD directly creates a resident | Existing behavior | Acting HOD | approved | Existing bypass | None |

An active HOD means a database user whose department equals the **actual target department**, role is `hod`, and status is `approved`. A real department's HOD does not qualify as the mirror department's HOD. A failed HOD lookup is an error, not proof that no HOD exists.

### 3.2 Data model and migration draft

There is currently no trustworthy admin-origin/payment-exemption field on users or students. Account status alone cannot distinguish unpaid self-registered students from unpaid admin-created students.

Add `studentsTable.adminProvisioned` / database column `students.admin_provisioned`, boolean, NOT NULL, default false. Set it to true only inside the authenticated superadmin resident-creation transaction, for both approval choices. Never accept this field in registration, resident profile updates, or an arbitrary client payload. A missing profile or absent/false marker must never grant payment exemption.

This deliberately records one fact: this resident was provisioned through admin. The column makes it possible for the new pending-HOD branch to retain the **existing** no-payment rule while leaving normal self-registration's payment gate intact. It does not mark payments as paid or invent a payment record. Existing rows receive false; do not infer historical origin from emails, identifiers, department names, existing approval status, or missing payments. Existing approved admin-created residents continue to log in as before.

Draft the next sequential migration, expected at the analyzed commit to be `lib/db/migrations/0023_student_admin_provisioned.sql`. Recheck the number on refreshed main before implementation. Register it in `lib/db/src/migrations.ts`. Do not modify existing migration files or their checksums. Update the migration-count assertion in `tests/migrations.test.ts` and prove the default, preservation of existing rows/statuses, and safe rerun in PGlite.

The migration is handed to the developer for manual application. No production connection or migration execution is part of implementation verification. API code reading the new column must not be deployed before the migration is applied.

### 3.3 Backend steps

1. Extend `POST /api/superadmin/departments/:id/students`' strict Zod schema with optional `approvalMode: "hod" | "automatic"`, default `automatic` for compatibility with older callers. Reject unknown modes and attempted `status`, payment-exemption, or ownership fields.
2. Preserve the existing validation, password hashing, duplicate-email handling, and atomic user/profile insert. Resolve the target department from the route parameter; never use a student ID as a department or user ID.
3. Within creation's transaction, look up an approved HOD in the target department when mode is hod. Compute pending if found; otherwise approved. The decision uses the HOD state observed during the transaction. HOD replacement after creation routes the pending account to the department's current HOD, not a stored reviewer ID.
4. Insert the user with the computed status and the student profile with `adminProvisioned: true`. Roll back both if either insert fails.
5. Return HTTP `201` with the existing `student.id` semantics preserved (**usersTable.id**), department ID, actual status, requested mode, effective mode, and nullable fallback reason `no_active_hod`. Use an outcome-specific message. Return no password, password hash, session token, or invented payment data.
6. For pending accounts, notify the current target-department HOD after the transaction commits, using the existing approval-request email template and escaping. Add a generic pending-student notification export in `src/lib/student-notifications.ts`; keep `notifyCurrentHodOfPaidStudent` as a compatibility wrapper so payment callers retain their existing behavior. Notification failure does not undo creation; expose acceptance/failure separately and show a warning. Do not log the email payload or error object. Automatic/fallback creation must not send a pending-approval notice.
7. In `POST /api/admin/students/:id/approve`, preserve requireAuth/requireRole/requireDepartment and resolve the pending user's real department before eligibility. Read the admin marker by joining `students.userId = users.id`. Skip the paid-payment check only for a confirmed admin-provisioned student. All unmarked self-registered students still require a real paid row. Keep the status-change guard, `409` race response, existing approval email, and indistinguishable wrong-department/nonexistent `403` behavior.
8. In `/api/auth/login`, for pending students resolve the same server-owned marker. An admin-provisioned pending student gets `403` with a clear awaiting-HOD message, **no payment token and no session token**. An ordinary unpaid pending student still gets the existing `402` payment flow; an ordinary paid pending student still waits for HOD approval. Approved/rejected behavior stays intact.
9. In `src/middlewares/payment-token.ts`, reject payment access for admin-provisioned students with `403`, even if a correctly signed payment-scope token is presented. Retain token signature/scope checks and existing pending-account checks. This keeps the exemption consistent beyond the login screen.
10. Extend `GET /api/superadmin/departments` with mirror department name and mirror current HOD metadata, using the existing department/HOD maps. Preserve existing fields. The form needs accurate target information; real-department HOD metadata must not be reused for a test resident.

### 3.4 Frontend steps

1. Extend `AdminDepartment` and `createAdminStudent` request/response typing in `src/lib/apiClient.ts` for the new metadata, mode and actual outcome. Keep the client mode separate from server-owned provenance.
2. Replace `activeTab as any` with explicit, valid form context. A real Residents Add opens a resident form targeted at the real department. A Test accounts Add opens a **test resident** form targeted at `mirrorDepartmentId`. Faculty Add continues to target the real department. Creating additional test faculty from admin is not required by this task; test HOD faculty creation remains available.
3. Capture target department ID/name and real/test scope when opening the form. Display them clearly. Disable Test accounts Add if no mirror exists or its context failed to load. Never fall back to the real ID. Close/reset the form when department or target context changes; prevent a tab switch from silently changing an open form's destination.
4. Show all resident fields for both real and test resident forms. Show a labeled radio group with Approve by HOD and Automatic. Both options remain visible without a HOD; explain that selecting HOD approval then results in automatic approval. A stale UI HOD indicator cannot override the server's final result.
5. Replace the unconditional Immediately approved text with mode/target-aware explanatory copy. Do not imply self-registered residents can select automatic approval.
6. Submit the captured target ID and selected mode. Render success from the returned actual status: approved; awaiting target HOD approval; or approved automatically because no active HOD is assigned. Show notification warnings independently of account creation success.
7. Refresh the appropriate real or mirror roster and department summary after success. Preserve visible loading/error/retry states. Reset form and choice for the next addition. Use pending badges and correct real/test HOD wording on pending rows.
8. The existing LoginPage already displays generic `403` error messages and opens payment only on `402` with a payment token. Verify this behavior; no LoginPage change is planned unless verification disproves it. The existing HOD queue also already lists pending students by actual department; no HODPortal UI change is required.

### 3.5 Planned files

Modify:

- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`
- `artifacts/api-server/src/routes/superadmin.ts`
- `artifacts/api-server/src/routes/admin.ts` — approval handler only
- `artifacts/api-server/src/routes/auth.ts` — pending-student login eligibility only
- `artifacts/api-server/src/middlewares/payment-token.ts`
- `artifacts/api-server/src/lib/student-notifications.ts`
- `lib/db/src/schema/students.ts`
- `lib/db/src/migrations.ts`
- `artifacts/api-server/tests/migrations.test.ts`

Create:

- `lib/db/migrations/0023_student_admin_provisioned.sql` — number subject only to newer main migrations
- `artifacts/api-server/tests/admin-resident-approval.test.ts`

Reuse existing tests unchanged where possible. No department configuration field, persistent department approval setting, payment-provider change, browser-demo change, or clinical-log route change is planned.

### 3.6 Acceptance tests

Use fresh PGlite fixtures with real and mirror departments, independently assigned HODs, a department without an active HOD, and deliberately different user/student IDs.

1. Exercise all six admin rows in the behavior table and an omitted-mode legacy caller. Assert HTTP `201`, returned outcome, database status, marker, and actual department. Explicitly test a mirror without an HOD while the parent real department has one.
2. Pending real resident appears only in the real HOD's queue; pending test resident only in the mirror HOD's queue. Neither real nor unrelated HOD can approve the mirror resident. Same checks in the other direction.
3. Own HOD can approve an admin-provisioned resident with **no payment rows** (`200`); rejection still works and stops login. Normal unpaid self-registration remains `402` on approval; paid normal registration remains approvable by the own HOD only.
4. Admin pending login returns `403` and neither paymentToken nor session token; after approval login returns `200`. Automatic and no-HOD fallback residents can log in immediately with `200`, without a paid row.
5. Public registration rejects forged approvalMode/adminProvisioned/status fields and still creates pending, unmarked students. Payment token middleware refuses marked accounts and continues to admit eligible ordinary pending applicants. Mock payment/email services; never initiate a real charge or email.
6. Invalid mode, duplicate details, invalid date, absent department, and profile-insert failure do not create partial accounts. Assert a failed HOD lookup returns an error rather than approving automatically.
7. Pending notification uses the actual target HOD; provider failure leaves the pending account intact with visible notification failure. Automatic creation produces no pending notification.
8. Print each authorization request and its response separately. Approval evidence: unauthenticated `401`; wrong department/role `403`; own HOD/admin-provisioned pending target `200`; nonexistent target `403` under the explicitly authorized enumeration protection. Resident creation uses its normal `201` success code, with `401` unauthenticated, `403` wrong role, and `404` absent department. Do not describe either as the literal unmodified §11 matrix.
9. Verify the new migration in PGlite: fresh install, existing data default false, no status changes, rerun/checksums, expected migration count. No backfill infers historical provenance.
10. Browser verification against an isolated synthetic test app: real vs test Add, visible target and both options, missing-HOD explanation, actual server-result toast, pending login message, mirror roster refresh, and failed requests showing error rather than a fabricated successful state. Check desktop and a narrow/mobile width.

## 4. Task 2 — admin management of test residents and professors

Execution route: **B**. Review tier: **Opus/high**, because it integrates deletion of clinical records and must demonstrate the user/student ID boundary and department isolation. The production cascade is reused unchanged. This is a separate feature/diff, preferably started after Task 1 is reviewed; it can otherwise be scoped independently with pending fixtures.

### 4.1 UI action matrix

| Test account | Status | Actions |
|---|---|---|
| Resident or professor | approved | Log in as, Deactivate, Delete |
| Resident or professor | pending | Deactivate, Delete; no Log in as |
| Resident or professor | rejected | Reactivate, Delete; no Log in as |
| HOD | approved | Existing Log in as only |
| HOD | Any other status | No lifecycle action through these controls |

Delete remains an explicit, irreversible action behind the existing detailed confirmation. Do not use account deletion as a substitute for deactivation.

### 4.2 Implementation steps

1. In the Test accounts table, add actions only for actual roles student/professor. Include professors created by the test HOD, not just the originally seeded professor. Keep HOD protection in UI and backend. Include pending wording on pending residents.
2. Reuse `deactivateAdminUser`, `reactivateAdminUser`, and `hardDeleteAdminUser`. These routes already allow admin across departments and receive **usersTable.id** from the roster. Do not add mirror-specific delete routes, infer student IDs, or change admin's existing global authority.
3. Add actual target scope/department name to deactivation/reactivation context and `userToDelete`. Show the test department in the confirmation. The faculty warning must explain deletion of linked resident records and assignment-type reassignment to the **test** department HOD, with acting-admin fallback if that department has no approved HOD. Do not name the parent real HOD as the recipient.
4. After success, refresh the target mirror roster and summary. Extend the existing handlers with captured scope or a targeted refresh helper; current handlers only call fetchRoster for the real department. Clear delete context only on successful deletion or cancellation. Disable duplicate actions while a request is in flight; keep the actual error visible on failure.
5. Fix `POST /api/superadmin/users/:id/deactivate` to transition both pending and approved student/professor accounts to rejected, bumping sessionVersion and preserving all records. Keep role protections and 404 for a missing user. Use a guarded update with returning to detect races; an already rejected account returns the existing successful idempotent outcome without pretending another transition happened, and a conflicting concurrent transition returns `409`. Do not broaden other account-management routes.
6. Preserve reactivation's existing rejected → approved semantics and sessionVersion increment. Its confirmation must explicitly say the user can sign in after reactivation; it does not restore pending approval. Do not silently use Reactivate as an Approve button for a pending resident.
7. Keep `hardDeleteUserCascade` and its caller's reassignment/transaction behavior unchanged. If new isolation/cascade tests reveal an unrelated flaw, stop and report it for separately scoped work rather than bundling a cascade redesign.
8. Verify impersonated sessions stop working after deactivation/delete; reactivation requires a fresh sign-in and does not revive old tokens. Preserve the existing impersonation restriction to approved accounts in actual test departments.

### 4.3 Planned files

Modify:

- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`
- `artifacts/api-server/src/routes/superadmin.ts` — deactivation transition only

Create:

- `artifacts/api-server/tests/admin-test-account-management.test.ts`

Reuse `src/lib/apiClient.ts` management helpers and `src/lib/hard-delete-user.ts` unchanged. No migration is required for this task.

### 4.4 Acceptance tests

1. Provision real/mirror department fixtures and create a professor through the mirror HOD route. Confirm all mirror residents/professors appear with the action matrix above; HOD lacks lifecycle actions.
2. Deactivate an approved test resident/professor (`200`); status becomes rejected, sessionVersion increments, profile/log/review/assignment records remain, old ordinary/impersonated session fails (`401`). Deactivate a pending test resident (`200`) and assert the status actually changed. An already rejected request is idempotent; a conflicting guarded update is reported as `409`.
3. Reactivate a deactivated test resident/professor (`200`); new login succeeds and old session remains invalid. A pending or already active account gets the existing `409`. HOD/admin target gets `403`.
4. Hard-delete a test resident (`200`); assert deletion of their resolved student profile and dependent synthetic records. Hard-delete a test professor (`200`); assert the existing linked-record cascade, mentor clearing, assignment-type reassignment to the mirror HOD, and admin fallback without a mirror HOD. Parent real department and an unrelated department remain intact.
5. For each management endpoint print four individual requests/responses: unauthenticated `401`; non-admin caller `403`; authorized admin with valid resident/professor `200`; admin with nonexistent user `404`. Also show explicit protected HOD/admin target refusals, invalid IDs (`400`), repeated deletion (`404`), and FK conflict (`409`) without partial deletion.
6. Browser verification: confirmation shows correct test department and faculty cascade effect; cancel causes no request; success refreshes mirror rows; errors remain visible; unavailable mirror shows an error and never displays real-department accounts as test accounts. Test a professor added by impersonating the test HOD. Check desktop/mobile layout.

## 5. Verification and delivery sequence

1. Refresh clean main and recheck the relevant paths/next migration number at the start of each implementation task. Do not apply existing stashes.
2. Create a task-specific CURRENT_TASK.md with one feature, route B, the tier above, this document as its approved reference, exact scope, agent steps, and developer-only migration/deployment items. Keep the two feature branches/diffs separate. Use the project's Antigravity implementation and review loop unless the developer explicitly chooses another implementation method for Stage 2.
3. Task 1: draft schema/migration, implement backend eligibility and creation, then client context/controls; complete automated and browser verification. Review the schema/payment exemption and evidence before accepting it.
4. Task 2: add controls/context and pending-deactivation fix; complete isolation, session and cascade verification. Review before accepting it.
5. Required checks, run from repository root unless stated otherwise:

   ```powershell
   pnpm --dir artifacts/api-server test
   pnpm --dir artifacts/api-server typecheck
   pnpm --dir artifacts/mockup-sandbox typecheck
   pnpm --dir artifacts/mockup-sandbox build
   git diff --check
   ```

   The API test script uses `tests/tsconfig.json`, which aliases `@workspace/db` to the PGlite database module. If pnpm's runtime wrapper attempts dependency installation, use the already-installed local tsx runner instead; do not approve dependency purging simply to run tests. Any unresolved check failure must be reported as unverified.
6. Deliver HANDOFF.md and a review report with scope adherence, rule violations/authorized exceptions, individual evidence, blast radius, expanded scope, skipped work, and verdict. No PR/merge/deployment before the developer's acceptance of the reviewed implementation.
7. Developer deployment order for Task 1: review migration, back up production, manually apply the additive migration through the approved project process, confirm application, deploy API, deploy UI. An older UI remains compatible through automatic default mode. An older API rejects the new mode field, so UI-first deployment is not acceptable. Task 2 has no schema dependency; if released alongside Task 1, use the same reviewed API/UI rollout.
8. Retaining the new column is compatible with rolling application code back to the old automatic-only version. However, old code payment-gates newly created pending admin residents. A rollback with such accounts requires a developer decision and manual resolution; do not auto-approve them or drop the column. Permanent account deletion is not reversible through an application rollback.

## 6. Limits, observed issues, and approval boundary

- Analysis created this plan; after approval, the implementation files and tests listed below were also changed.
- No external database was contacted, no .env was read/edited, no live email/payment was initiated, no actual account was changed, and no commit/push/PR was created. Backend tests used disposable in-process PGlite and intercepted email.
- The test suite verifies the implemented server paths and the frontend typecheck/build pass. No live/pilot or interactive browser session was used.
- Existing HOD/nonexistent `403` behavior conflicts with the literal §11 evidence matrix. The developer authorized safety judgment after that conflict was presented. Keep the enumeration protection and label the evidence exception clearly; unrelated endpoints keep their existing contracts.
- The additive migration and eligibility paths need review before release. The migration is only drafted; the developer must apply it before deploying code that reads the new column. Production migration execution remains developer work.
- The API package typecheck reports 12 existing `TS7030` diagnostics on response-return patterns throughout `superadmin.ts`; these were present as a pattern before the changes. The final API check has no other diagnostics. The test-project typecheck also reports existing errors in unrelated tests; both new test files are free of type diagnostics.
- The frontend typecheck passes. The production frontend build completes; it reports existing sourcemap-location warnings in generated UI component files and the existing large JavaScript-chunk warning.
- Default generated registration/KUHS identifiers are currently used even by the real resident form. This was noticed, is not needed for these two fixes, and is left unchanged; real-department identity validation deserves a separate decision.
- The Test Login Credentials card claims a shared password for all mirror accounts, which may be inaccurate for custom faculty/residents with individually entered passwords. Credential-display/reset redesign is outside these fixes; do not copy credential values into logs, reports, or tests of real accounts.
- Deletion's faculty cascade is existing behavior. This plan makes that consequence clear in the test-account confirmation and proves isolation; it does not redesign retention or supervisor reassignment.
- If a department loses its HOD after residents were made pending, those accounts remain pending. Automatic fallback is evaluated during creation only; handling later HOD loss is separate work.
- No changes to browser-only demo accounts, provisioning seed data, department targets/catalogs, HOD replacement, or clinical log permissions are planned.

Plan approval was received from the developer. The developer clarified that no-payment handling for automatically approved admin-created residents already exists and is not an additional feature request. Implementation preserves it and extends the same rule to the new HOD-review choice, while keeping payment requirements for self-registration. Both approved tasks are implemented locally and await code review.

## 7. Analysis verification already performed

The initial tree was clean; main was already current. Existing stashes, preserved untouched:

- `stash@{0}: WIP on feature/leave-allowance-restructure: eacd1e5 Merge pull request #54 from Gotham28/fix/mobile-responsiveness`
- `stash@{1}: On feature/catalog-delete: WIP catalog-delete and competency levels`

Ran the two existing suites `superadmin.test.ts` and `superadmin-user-delete.test.ts`: **29 tests passed, 0 failed**, exit code 0. Selected individual observed evidence, against synthetic PGlite accounts (response excerpts intentionally omit tokens and personal/clinical content):

```text
DELETE /api/superadmin/users/10/hard as unauthenticated
401 {"message":"No token found in cookies or authorization header"}

DELETE /api/superadmin/users/10/hard as hod1
403 {"message":"Forbidden: Insufficient role permissions"}

DELETE /api/superadmin/users/10/hard as admin
200 {"message":"Account and associated records permanently deleted"}

DELETE /api/superadmin/users/99999/hard as admin
404 {"message":"User not found"}

POST /api/superadmin/users/4/reactivate as unauthenticated
401 {"message":"No token found in cookies or authorization header"}

POST /api/superadmin/users/4/reactivate as hod0
403 {"message":"Forbidden: Insufficient role permissions"}

POST /api/superadmin/users/2/reactivate as admin, after deactivation
200 {"message":"Account reactivated. The user must sign in again."}

POST /api/superadmin/users/99999/reactivate as admin
404 {"message":"User not found"}
```

These are baseline responses from existing endpoints, not evidence of new implementation. Admin's global privilege is intentional: wrong-owner evidence here is a caller without admin authority, not an admin from another department.

Execution limitations: initial checkout/pull failed because `.git` is sandbox-read-only; the same authorized commands succeeded with escalation. The pnpm wrapper attempted dependency installation before tests and aborted for lack of TTY; no tracked changes resulted. Direct local tsx initially failed at Node userInfo under sandbox restrictions. The same local runner succeeded with escalation. No automatic approval rejection occurred.

## 8. Shell command audit

Commands below are the actual analysis commands, in order. Read commands that searched nonexistent paths are retained rather than omitted. Repeated commands reflect sandbox retries, not additional feature work. The file was created using apply_patch; the final read/diff/status verification is recorded at the end.

```powershell
git status
git stash list
git checkout main
git pull origin main
git log --oneline -5
git checkout main
git pull origin main
git log --oneline -5
git rev-parse HEAD
rg --files -g AGENTS.md -g CURRENT_TASK.md -g HANDOFF.md -g package.json -g '*Admin*' -g '*Demo*' -g '*demo*' -g '*admin*' -g '*hod*' -g '*HOD*'
rg -n 'Immediately approved|created with approved status|Self-registered students|HOD queue|test resident|Test Resident|test department|Test Department' artifacts lib
Get-Content AGENTS.md
Get-Content artifacts/api-server/src/routes/superadmin.ts
Get-Content artifacts/mockup-sandbox/src/components/AdminPortal.tsx
rg -n 'router\.(get|post|patch|delete)|create.*Schema|status:|departmentId|hodUserId' artifacts/api-server/src/routes/superadmin.ts
rg -n 'function |const handle|fetchRoster|fetchMirrorRoster|apiFetch|addFormType|mirrorRoster|useEffect' artifacts/mockup-sandbox/src/components/AdminPortal.tsx
rg -n 'pending|approval|sendHODApproval|sendAccountCreated|router\.(post|patch|delete)|status' artifacts/api-server/src/routes/auth.ts artifacts/api-server/src/routes/admin.ts artifacts/api-server/src/middlewares/auth.ts artifacts/api-server/src/lib/hard-delete-user.ts artifacts/api-server/src/lib/mailer.ts
$p='artifacts/api-server/src/routes/superadmin.ts'; $s=Get-Content $p; 494..724 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }
$p='artifacts/mockup-sandbox/src/components/AdminPortal.tsx'; $s=Get-Content $p; 451..680 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }
$p='artifacts/api-server/src/routes/admin.ts'; $s=Get-Content $p; 1..160 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }; 260..335 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }
rg -n 'AdminDepartment|AdminUserRow|createAdminStudent|getPendingStudents|approveStudent|paymentStatus|hasPaid|payment' artifacts/mockup-sandbox/src/lib/api.ts artifacts/mockup-sandbox/src/components/HODPortal.tsx lib/db/src/schema artifacts/api-server/src/routes/payments.ts artifacts/api-server/tests/superadmin.test.ts artifacts/api-server/tests/auth.test.ts artifacts/api-server/tests/payments.test.ts
Get-Content artifacts/api-server/package.json; Get-Content artifacts/mockup-sandbox/package.json; Get-Content package.json; Get-Content artifacts/api-server/tests/helpers.ts
rg --files artifacts/api-server/tests lib/db/src lib/db/migrations artifacts/mockup-sandbox/src | rg 'api|payment|auth|migration|setup|users|departments|superadmin|delete'
Get-Content artifacts/api-server/tests/superadmin.test.ts -TotalCount 75; Get-Content artifacts/api-server/tests/superadmin-user-delete.test.ts -TotalCount 100; Get-Content lib/db/src/schema/users.ts; Get-Content lib/db/src/schema/departments.ts
rg -n 'createAdminStudent|interface AdminDepartment|interface AdminUserRow|type AdminDepartment|type AdminUserRow|notifyCurrentHodOfPaidStudent|exempt|createdBy|registrationSource' artifacts lib/db lib/api-spec
$p='artifacts/mockup-sandbox/src/lib/apiClient.ts'; $s=Get-Content $p; 1..75 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }; 125..208 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }; $p='artifacts/mockup-sandbox/src/components/HODPortal.tsx'; $s=Get-Content $p; 185..225 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }; 590..645 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }
Get-Content artifacts/api-server/tests/database.ts -TotalCount 95; Get-Content artifacts/api-server/tests/support.ts -TotalCount 140; Get-Content artifacts/api-server/src/lib/student-notifications.ts; Get-Content lib/db/src/schema/students.ts; Get-Content lib/db/src/migrations.ts -TotalCount 100; Test-Path CURRENT_TASK.md
Get-Content artifacts/api-server/src/middlewares/payment-token.ts; Get-Content artifacts/api-server/tests/tsconfig.json; Get-Content artifacts/api-server/tests/enumeration-collapse.test.ts -TotalCount 125; Get-Content artifacts/api-server/tests/payments-webhook.test.ts -TotalCount 105
rg -n 'test\(|students|deactivate|401|404|pending|paid' artifacts/api-server/tests/superadmin.test.ts artifacts/api-server/tests/access.test.ts artifacts/api-server/tests/patch.test.ts artifacts/api-server/tests/migrations.test.ts artifacts/api-server/tests/log-leaks.test.ts; Get-Content artifacts/api-server/src/lib/hard-delete-user.ts
rg -n 'console\.|diagnostic|test\(' artifacts/api-server/tests/superadmin.test.ts artifacts/api-server/tests/superadmin-user-delete.test.ts; Get-Content artifacts/api-server/tests/migrations.test.ts -TotalCount 30; $p='artifacts/api-server/src/routes/superadmin.ts'; $s=Get-Content $p; 31..62 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }; $p='artifacts/mockup-sandbox/src/components/AdminPortal.tsx'; $s=Get-Content $p; 788..852 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }
Get-Command pnpm,node -ErrorAction SilentlyContinue | Select-Object Name,Source; rg -n 'approval|nonexistent|SEC-36' docs/SECURITY_FIXES.md; rg -n 'superadmin|students.*approve|students.*create|approvalMode' lib/api-spec/openapi.yaml; Get-Content artifacts/api-server/src/lib/department-provisioning.ts -TotalCount 145
# Next command working directory: artifacts/api-server
pnpm exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/superadmin.test.ts tests/superadmin-user-delete.test.ts
# Working directory back to repository root for the following inspection
git status --short; Test-Path node_modules/.bin/tsx.cmd; Test-Path node_modules/tsx/dist/cli.mjs; Test-Path artifacts/api-server/node_modules/.bin/tsx.cmd; Get-Content pnpm-workspace.yaml -TotalCount 100; Get-Content artifacts/api-server/src/routes/auth.ts | Select-Object -Skip 188 -First 48
# Following two commands working directory: artifacts/api-server (second escalated)
.\node_modules\.bin\tsx.cmd --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/superadmin.test.ts tests/superadmin-user-delete.test.ts
.\node_modules\.bin\tsx.cmd --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/superadmin.test.ts tests/superadmin-user-delete.test.ts
# Remaining commands working directory: repository root
Get-Content artifacts/mockup-sandbox/src/components/AdminPortal.tsx -TotalCount 44; $p='artifacts/api-server/tests/superadmin.test.ts'; $s=Get-Content $p; 190..212 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }; Get-Content lib/db/package.json; rg -n 'payment|403|402' artifacts/mockup-sandbox/src/components/Login.tsx artifacts/mockup-sandbox/src/components/LoginPage.tsx artifacts/mockup-sandbox/src/App.tsx; git status --short
$p='artifacts/mockup-sandbox/src/components/LoginPage.tsx'; $s=Get-Content $p; 74..112 | ForEach-Object { '{0}: {1}' -f $_,$s[$_-1] }; Get-Content artifacts/api-server/tests/mailer-escaping.test.ts -TotalCount 12; rg -n 'csrf|redact|password|req.body' artifacts/api-server/src/app.ts artifacts/api-server/src/lib/logger.ts; rg --files -g '*SECURITY*' -g '*TASK*' -g '*test*' .agents .codex artifacts/mockup-sandbox | Select-Object -First 35
git diff --check
git status --short
Get-Content ADMIN_ACCOUNT_WORKFLOWS_PLAN.md -TotalCount 24
```
