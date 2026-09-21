# Audit: Test Department Isolation & Config Mirroring

## (a) Department-scoped query table

| File:Line | Endpoint | ID Used | Data Touched | Verdict |
|-----------|----------|---------|--------------|---------|
| `student.ts:20` | `GET /requirements` | Config resolved | Config | Correct |
| `student.ts:32` | (Helper) `validateSupervisor()` | Own `departmentId` | User (Supervisors) | Correct |
| `student.ts:95` | `GET /:studentId/dashboard` | Config resolved | Config | Correct |
| `student.ts:106-114` | `GET /:studentId/dashboard` | Own `supervisorId` / Own `studentId` | Clinical (Logs) | Correct |
| `student.ts:180-205` | `GET /:studentId/logs` | Own `supervisorId` / Own `studentId` | Clinical (Logs) | Correct |
| `student.ts:407-422` | `GET /:studentId/postings` | Own `supervisorId` / Own `studentId` | Clinical (Logs) | Correct |
| `student.ts:424` | `GET /:studentId/postings` | Config resolved | Config | Correct |
| `student.ts:439` | `POST /:studentId/postings` | Config resolved | Config | Correct |
| `student.ts:442` | `POST /:studentId/postings` | Own `departmentId` | User (Supervisors) | Correct |
| `student.ts:499` | `GET /:studentId/leave-balance` | Config resolved | Config | Correct |
| `student.ts:577` | `POST /:studentId/leave-records` | Own `departmentId` (`studentUser.departmentId!`) | Config (`departmentCatalogTable` for `leave_type`) | **WRONG-DIRECTION** (Test students will fail to submit leaves as the test dept lacks catalog rows) |
| `student.ts:676-694` | `GET /:studentId/assessments` | Own `assessorId` / Own `studentId` | Clinical (Logs) | Correct |
| `student.ts:777` | `POST /:studentId/thesis` | Own `departmentId` | User (Supervisors) | Correct |
| `student.ts:821` | `POST /:studentId/case-logs` | Own `departmentId` | User (Supervisors) | Correct |
| `student.ts:851` | `POST /:studentId/procedure-logs` | Own `departmentId` | User (Supervisors) | Correct |
| `student.ts:856` | `POST /:studentId/procedure-logs` | Config resolved | Config | Correct |
| `student.ts:865-866` | `POST /:studentId/procedure-logs` | Own `departmentId` (`req.user!.departmentId!`) | Config (`departmentCatalogTable` for `competency_level`) | **WRONG-DIRECTION** (Test students fail to submit procedures) |
| `student.ts:891` | `POST /:studentId/academic-logs` | Own `departmentId` | User (Supervisors) | Correct |
| `student.ts:896` | `POST /:studentId/academic-logs` | Config resolved | Config | Correct |
| `student.ts:920` | `POST /:studentId/conference-logs` | Own `departmentId` | User (Supervisors) | Correct |
| `professor.ts:39-50` | `GET /:professorId/review-queue` | Own `departmentId` (`caller.departmentId`) | User (Supervisors) | Correct |
| `professor.ts:69-126`| `GET /:professorId/review-queue` | Own `departmentId` (`deptId`) | Clinical (Logs), User (Students) | Correct |
| `professor.ts:198-209`| `GET /:professorId/review-queue`| Own `departmentId` (`deptId`) | User (Students) | Correct |
| `professor.ts:236` | `GET /:professorId/review-queue` | Config resolved | Config | Correct |
| `department.ts:30` | `GET /:departmentId/catalog` | Config resolved | Config | Correct |
| `department.ts:33-34`| `GET /:departmentId/catalog` | Own `departmentId` | User (Supervisors) | Correct |
| `department.ts:61` | `GET /:departmentId/config` | Config resolved | Config | Correct |
| `department.ts:78-90`| `GET /:departmentId/professors` | Own `departmentId` | User (Supervisors) | Correct |
| `department.ts:115` | `GET /:departmentId/analytics` | Config resolved | Config | Correct |
| `department.ts:118-130`| `GET /:departmentId/analytics` | Own `departmentId` | User (Students) | Correct |
| `admin.ts:342` | `GET /leaves/pending` | Config resolved | Config | Correct |
| `admin.ts:440` | `GET /department/config` | Config resolved | Config | Correct |
| `admin.ts:497` | `GET /department/procedures` | Config resolved | Config | Correct |
| `admin.ts:550-564` | `GET /roster` | Own `departmentId` | User (Students) | Correct |
| `admin.ts:566` | `GET /roster` | Config resolved | Config | Correct |
| `admin.ts:597-607` | `GET /roster` | Own `departmentId` | User (Supervisors) | Correct |
| `logs.ts:64-72` | `PATCH /:logType/:logId/review` | Own `departmentId` | User (Students) | Correct |

## (b) Department-level config/requirements table

| Config Table / Flag | Read Path Resolved (Y/N) | Write Path Guarded (403 on Mirror) (Y/N) | Stale Copy at Creation |
|---------------------|--------------------------|------------------------------------------|------------------------|
| `procedureTypesTable` (procedure groups/requirements) | **Y** (`department.ts:36`, `admin.ts:498`) | **Y** (`admin.ts:515`, `admin.ts:628`) | None |
| `departmentCatalogTable` (Ward/posting label, case_category, academic) | **Y** (`student.ts:424`, `student.ts:896`) | **Y** (`admin.ts:618`, `admin.ts:638`) | None |
| `departmentCatalogTable` (`competency_level`) | **N** (`student.ts:865`) | **Y** (`admin.ts:618`, `admin.ts:638`) | None |
| `departmentCatalogTable` (`leave_type`) | **N** (`student.ts:577`) | **Y** (`admin.ts:618`, `admin.ts:638`) | None |
| `departmentConfigsTable` (Dermatology procedure gating, req targets) | **Y** (`student.ts:861`, `admin.ts:441`) | **Y** (`admin.ts:458`) | None |
| `assignmentTypesTable` (assignment types) | **N** (`assignments.ts:18`, `assignments.ts:42`) | **N** (`assignments.ts:24`) | None |

*Note on Stale Copies*: No config data is copied into the mirror department at creation time (`provisionMirrorForRealDepartment`). Only test user accounts and fixture clinical logs are generated. This is correct architecture (config remains solely on the source, while test logs remain solely on the test accounts).

## (c) The break trace

Trace: "a test student submits a case log → the test professor's queue → the test HOD's view"

**This chain does NOT break in the backend for `caseLogsTable`. It works end to end:**
1. **Submission (`student.ts:812-838`)**: Test student posts a case log. The route validates `supervisorId` against `req.user!.departmentId!` (`student.ts:821`, calling `validateSupervisor` at `student.ts:30`). This correctly enforces that the test student can only assign the log to a test professor (a professor sharing their exact test department ID). The log is inserted into `caseLogsTable` with `status: "pending"`.
2. **Prof Queue (`professor.ts:24-82`)**: Test prof requests their queue. `caseWhere` uses `eq(caseLogsTable.supervisorId, professorId)` (`professor.ts:59`). The query joins `studentsTable` and `usersTable`, filtering by `eq(usersTable.departmentId, deptId)` (`professor.ts:81`), where `deptId` is the test prof's department (`professor.ts:52`). Since the test student and test prof share the test department ID, this join succeeds, and the log appears.
3. **HOD View (`professor.ts:24-82`)**: Test HOD requests the queue. `isHod` is true, so `caseWhere` is `eq(caseLogsTable.status, "pending")` (`professor.ts:58`). The query filters by `eq(usersTable.departmentId, deptId)` (`professor.ts:81`). Since the test student is in the test department, this succeeds.

**Why the bug report ("test prof/HOD not seeing test-student uploads")?**
If the frontend is pulling the supervisor list using `GET /api/departments/:departmentId/professors`, the test student correctly sees and selects test faculty. The case logs chain works. However, **Procedure Logs and Leave Records break at submission**:
- Procedure log submission fails at `student.ts:865` because it looks up `competency_level` in `departmentCatalogTable` using the test student's `departmentId`. Since config is not mirrored, the test department has no catalog rows, and the API throws a 400 Bad Request.
- Leave record submission fails similarly at `student.ts:577` (looking up `leave_type` using the test department's ID).

## Explicitly out of scope (Developer Note)
- **Schema changes**: None proposed, none required. The existing table structure correctly supports the separation.
- **Frontend changes**: No frontend code was touched, though frontend queries for config (if any bypass the API) should be verified by the developer to ensure they don't break.
- **Existing test-department data cleanup**: Not addressed per instructions. The audit didn't actively query the DB, but any previously malformed logs must be cleaned manually by the developer.
