# Mochi adoption handoff

Mochi adoption on task/mochi-ai-adoption began at a4b80671d0b19770a3b6bcc72713a0b461916b98, compared with origin/main 5b5e16e. The developer accepted the independent re-review and approved committing and opening the PR on 2026-11-24.

## Changes

- Part 0. AGENTS.md §9 and §14.5 permit the approved bundle with separate parts and verification. Antigravity applied the scoped wording.
- Part 1. Migration 0032, the Drizzle schema, and the assistant routes record event metadata. The usage read returns scoped aggregates for HODs and admins. Antigravity wired panel-open telemetry.
- Part 2. The resident dashboard shows progress against configured targets. The professor queue flags assigned records. The HOD card retrieves one weekly digest per department. Migration 0033 stores the digest and its generation claim. The model receives four aggregate counts and selects one of two next steps. The response summary uses server-derived counts and fixed wording.
- Part 3. Antigravity added the Mochi entry points in error panels and the grounding label. The answer provider supplies a label from facts it already collected.

## API and migration evidence

Commands used for this verification

~~~powershell
pnpm run typecheck:libs
pnpm --dir artifacts/api-server run typecheck
pnpm --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/arogya-weekly-digest.test.ts tests/migrations.test.ts
pnpm --dir artifacts/api-server test 2>&1 | Tee-Object -FilePath 'tmp/mochi-adoption-api-tests.txt'
git diff --exit-code 5b5e16e -- artifacts/api-server/src/lib/arogya/input-privacy.ts
~~~

The first two commands exited 0. The targeted test run exited 0.

~~~text
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
~~~

The input-privacy comparison exited 0 with empty output. The usage schema uses string types for the categorical fields role, feature, and event type. It has no column for prompts, answers, or any other free text. The approved separate digest cache stores the aggregate summary.

The full suite runs against in-process PGlite and loopback HTTP, with provider responses stubbed for the digest. The exact suite output is recorded locally in tmp/mochi-adoption-api-tests.txt.

The full suite exited 1. This is the final output and the comparison of unique failed test names against the four files rerun on clean base 5b5e16e.

~~~text
Baseline failures: 18
Candidate failures: 18
Differing failure names: 0
ℹ tests 402
ℹ pass 384
ℹ fail 18
ℹ duration_ms 745744.7201
~~~

The clean comparison ran from the API directory of a disposable worktree at 5b5e16e.

~~~powershell
& 'D:/Electronic-LogBook-main/artifacts/api-server/node_modules/.bin/tsx.CMD' --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/clinical-works.test.ts tests/department-template.test.ts tests/physiology-logbook.test.ts tests/surgery-procedure-fields.test.ts
~~~

~~~text
ℹ tests 56
ℹ pass 38
ℹ fail 18
~~~

The baseline names are in tmp/mochi-adoption-baseline-failures.txt. All Mochi tests and the PGlite migrations passed. The task's full-pass requirement remains open.

### Usage reads

~~~text
GET /api/arogya/usage (unauthenticated) -> 401 {"message":"No token found in cookies or authorization header"}
GET /api/arogya/usage?departmentId=3 (HOD of another department) -> 403 {"error":"You cannot view Mochi usage for this department."}
GET /api/arogya/usage (HOD of own department) -> 200 {"departmentId":1,"counts":[{"feature":"mochi","eventType":"panel_open","count":1}]}
GET /api/arogya/usage (college-scoped admin) -> 200 {"departmentId":null,"counts":[{"feature":"mochi","eventType":"panel_open","count":1},{"feature":"mochi","eventType":"quick_action_click","count":1}]}
GET /api/arogya/usage?departmentId=3 (admin of another college) -> 403 {"error":"You cannot view Mochi usage for this department."}
GET /api/arogya/usage (platform admin) -> 200 {"departmentId":null,"counts":[{"feature":"mochi","eventType":"nudge_click","count":1},{"feature":"mochi","eventType":"panel_open","count":1},{"feature":"mochi","eventType":"quick_action_click","count":1}]}
GET /api/arogya/usage?departmentId=2147483647 (platform admin, nonexistent department) -> 404 {"error":"Department not found."}
~~~

### Resident progress

~~~text
GET /api/arogya/progress-gaps (unauthenticated) -> 401 {"message":"No token found in cookies or authorization header"}
GET /api/arogya/progress-gaps (professor outside the resident role) -> 403 {"message":"Forbidden: Insufficient role permissions"}
GET /api/arogya/progress-gaps (resident with own profile) -> 200 {"gaps":[{"label":"Cases","verified":0,"target":7},{"label":"Procedures","verified":0,"target":11},{"label":"Test group 0: Test procedure 0","verified":0,"target":2},{"label":"Test training: Fixture procedure","verified":0,"target":2},{"label":"Academic activities","verified":0,"target":3}]}
GET /api/arogya/progress-gaps (resident of a different department) -> 200 {"gaps":[{"label":"Cases","verified":0,"target":8},{"label":"Procedures","verified":0,"target":12},{"label":"Test group 1: Test procedure 1","verified":0,"target":3},{"label":"Academic activities","verified":0,"target":4}]}
GET /api/arogya/progress-gaps (resident account without a profile) -> 404 {"error":"Resident profile not found."}
~~~

### HOD weekly digest

~~~text
POST /api/arogya/department-report/weekly (unauthenticated) -> 401 {"message":"No token found in cookies or authorization header"}
POST /api/arogya/department-report/weekly (professor) -> 403 {"message":"Forbidden: Insufficient role permissions"}
POST /api/arogya/department-report/weekly (HOD of another department, body departmentId=2) -> 403 {"error":"Use the department assigned to your account."}
POST /api/arogya/department-report/weekly (HOD of own department) -> 200 {"status":"ready","weekStart":"2026-11-23","generatedAt":"2026-11-24T04:22:25.785Z","summary":"Approved residents: 2. Logs: 0 verified, 1 pending, 0 rejected. Start with the pending review queue."}
POST /api/arogya/department-report/weekly (HOD with a department removed after authentication) -> 404 {"error":"Department not found."}
~~~

## Browser checks

The frontend used a localhost Vite instance with an intercepted synthetic API. Every browser request to another origin was aborted.

~~~powershell
$env:VITE_API_URL = 'http://127.0.0.1:4321/__mochi_fixture__'
$env:BASE_PATH = '/'
pnpm --dir artifacts/mockup-sandbox run dev --host 127.0.0.1 --port 4321 --strictPort
pnpm --dir artifacts/mockup-sandbox run typecheck
~~~

- Resident, 1365×900. Configured counts, keyboard nudge, and the singular grounding label verified. Screenshot in tmp/mochi-resident-targets-desktop.png.
- Resident, 390×844. The failed progress request showed an error with no fallback count. Screenshot in tmp/mochi-resident-targets-error-mobile.png.
- Professor, 1365×900. Three recognized flags rendered. The nudge opened Mochi and recorded an event with only its event type. Screenshot in tmp/mochi-professor-review-flags.png.
- Case logs, 1365×900 and 390×844. The error was visible and the button opened Mochi by click and by keyboard. Screenshots in tmp/mochi-error-action-desktop.png and tmp/mochi-error-action-mobile.png. The underlying page still shows the existing zero-case count when its fetch fails.
- HOD. At 1365×900, keyboard refresh advanced the card from pending to ready. At 390×844, a failed response showed an alert with no stale summary, and retry recovered. All four fixture requests were POST with an empty JSON object. Screenshots in tmp/mochi-hod-weekly-digest-desktop.png and tmp/mochi-hod-weekly-digest-mobile-error.png. Antigravity timed out after writing the card. Direct execution corrected the nullable department ID and the untyped response check. The final frontend typecheck exited 0.

## Cost and release checks

A six-week calendar month allows at most six digest requests per eligible department. The measured digest message strings occupy 813 UTF-8 bytes including the role names and four maximum safe-integer counts. The estimate allows 1,000 input tokens including protocol framing, at $0.15 per million, and caps each response at 400 tokens at $0.60 per million. At the RBI reference rate of ₹92.7968 per USD from 23 November 2026, that is approximately ₹0.22 per eligible department per month before taxes. [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini), [RBI reference rate](https://www.rbi.org.in/home.aspx)

The ₹500 monthly budget covers all OpenAI activity. To verify it, add estimated digest spend across eligible departments on the live API to the project's other monthly OpenAI usage. That count includes any mirror department with an eligible HOD who can open the card. The department count and account billing data were unavailable.

The developer applies 0032 and 0033 through the project's tracked migration runner before the API and UI roll out. The agent ran no production database commands and made no Render changes. The separate Luna migration follows adoption and uses synthetic requests in the approved OpenAI test project before a Render change.

## Review prechecks

- gh pr list --head task/mochi-ai-adoption exited 0 with no PR in the result.
- The staging area was empty. git diff --check 5b5e16e exited 0.

### Privacy, department scope, and copy

~~~powershell
$mochiDepartmentPattern = '\b(?:departmentId|deptId|department_id)\s*(?:===?|!==?)\s*\d+|\b\d+\s*(?:===?|!==?)\s*\w*(?:departmentId|deptId|department_id)\b|\b(?:eq|ne)\([^,]*(?:departmentId|deptId|department_id),\s*\d+|pediatrics|paediatrics'
git diff --no-ext-diff --unified=0 5b5e16e -- artifacts lib 2>$null | rg '^\+[^+]' | rg -in $mochiDepartmentPattern
$mochiPaths = @(git ls-files --others --exclude-standard)
$mochiPaths | ForEach-Object { rg -inHl $mochiDepartmentPattern -- $_ }
git diff --no-ext-diff --unified=0 5b5e16e -- artifacts/mockup-sandbox/src artifacts/api-server/src 2>$null | rg '^\+[^+]' | rg -n '\bArogya\b'
$mochiPaths | ForEach-Object { rg --case-sensitive -nHl '\bArogya\b' -- $_ }
git diff --no-ext-diff --unified=0 5b5e16e -- artifacts/api-server/src artifacts/mockup-sandbox/src lib/db/src 2>$null | rg '^\+[^+]' | rg -n '\b(?:console|req\.log|logger)\.(?:log|trace|debug|info|warn|error|fatal)\b|\b(?:localStorage|sessionStorage|Sentry)\b|\bfetch\s*\('
$mochiPaths | ForEach-Object { rg -nH 'console\.(log|warn|error|info|debug)\(|req\.log\.(warn|error|info|debug)\(|logger\.(warn|error|info|debug)\(|localStorage|sessionStorage|Sentry|fetch\(' -- $_ }
~~~

The department and UI copy checks returned no matches in tracked additions or the eight untracked files. The changed production files add one log line. The only untracked logs are three test fixture evidence statements.

~~~text
50:+          req.log.warn({ userId: actor.id, status: 500 }, "Mochi request usage could not be recorded");
~~~

## Independent review results

Four read-only reviews covered scope, project rules, evidence, and compatibility at the scoped high-assurance tier. Verdict: accept with changes. The change remains uncommitted and requires the developer's decision before the fixes or close-out.

- Major, Part 2. Required-field flags can miss legacy procedure patient ID, age, and competency fields, configured academic fields, and conditional Clinical Work fields. Clinical Work rows also omit the posting-date flag. Inspect routes/professor.ts lines 451, 491, 581, and 621 alongside routes/student.ts lines 1420, 1534, and 1748. The current queue fixture covers case flags only. Nonclinical academic and conference posting-date rules were not established.
- Major, Part 2. The HOD card may display the previous week's results under “This week” on a tab kept open through Monday. Inspect HODPortal.tsx lines 242 and 531.
- Major, Part 2. The digest can point an HOD to an empty queue when every pending log is already assigned to professors. The digest counts the whole department. The HOD queue lists pending items assigned to that HOD or unassigned. Inspect weekly-digest.ts lines 56–61 and routes/professor.ts lines 357–369.
- Evidence limit, Part 2. The resident test gets the required four statuses, but the 403 uses an account with the wrong role and the fixture contains no foreign verified log to exercise clinical count isolation. The HOD 404 simulates a missing department lookup. The existing professor queue returns the same 403 for inaccessible and nonexistent faculty, as covered by SEC-35.
- Measurement limits, Part 1. V2 requests are counted but model usage is discarded by the existing provider, leaving token counts empty. The endpoint accepts quick-action counts. The approved UI wiring covers panel opens, and the sample buttons do not send quick-action events.
- Blast radius. New professor posting and procedure catalog reads run before the existing queue response and can affect the HOD and faculty badges that also fetch it. The existing case page's zero-case count alongside its error predates this task.

For the fix dispatch, keep the authorized queue scope and reuse existing validation for fields applicable to each log type. Add procedure, academic, and Clinical Work fixtures where relevant and add a foreign verified log to the resident isolation fixture. Refresh the digest when its Asia/Kolkata week expires. Make its recommendation valid for the department-wide counts it receives. Retest at the same tier.

Verify each finding against the codebase before acting on it. If one is wrong for
this codebase, push back with technical reasoning rather than implementing it.
Do not agree performatively. Fix it and show the code.

## Working tree file inventory

~~~text
 M AGENTS.md
 M CURRENT_TASK.md
 M HANDOFF.md
 M artifacts/api-server/src/lib/arogya.ts
 M artifacts/api-server/src/lib/arogya/provider.ts
 M artifacts/api-server/src/routes/arogya.ts
 M artifacts/api-server/src/routes/professor.ts
 M artifacts/api-server/tests/arogya-department-diagnostics.test.ts
 M artifacts/api-server/tests/migrations.test.ts
 M artifacts/mockup-sandbox/src/components/Dashboard.tsx
 M artifacts/mockup-sandbox/src/components/HODPortal.tsx
 M artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx
 M artifacts/mockup-sandbox/src/components/QuarterlyAppraisalSection.tsx
 M artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx
 M artifacts/mockup-sandbox/src/components/arogya/AssistantAnswer.tsx
 M artifacts/mockup-sandbox/src/components/pages/AcademicLogsPage.tsx
 M artifacts/mockup-sandbox/src/components/pages/CaseLogsPage.tsx
 M artifacts/mockup-sandbox/src/components/pages/ClinicalWorksPage.tsx
 M artifacts/mockup-sandbox/src/components/pages/ConferencesPage.tsx
 M artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx
 M artifacts/mockup-sandbox/src/lib/apiClient.ts
 M lib/db/src/migrations.ts
 M lib/db/src/schema/index.ts
?? artifacts/api-server/src/lib/arogya/weekly-digest.ts
?? artifacts/api-server/tests/arogya-adoption.test.ts
?? artifacts/api-server/tests/arogya-usage.test.ts
?? artifacts/api-server/tests/arogya-weekly-digest.test.ts
?? lib/db/migrations/0032_assistant_usage_events.sql
?? lib/db/migrations/0033_assistant_department_weekly_digests.sql
?? lib/db/src/schema/assistant_department_weekly_digests.ts
?? lib/db/src/schema/assistant_usage_events.ts
~~~

## Review fix round, 2026-11-24

The developer approved the three fixes and tracking the 18 baseline test failures separately. The branch remains at a4b80671d0b19770a3b6bcc72713a0b461916b98 against 5b5e16e.

- Professor review queue. Restored required-field coverage for legacy procedures, applicable academic fields, conference type and role, and configured Clinical Work subtype and competency. Free-text procedures skip the old catalog criteria. Clinical Work dates use the assigned verified posting ranges already used for case and procedure flags. Existing route, department and supervisor authorization remain in effect.
- HOD card. Watches the next Monday boundary in Asia/Kolkata while the card is visible and rechecks on focus or visibility changes. It derives the current week on reentry and cancels superseded requests. A result must match the active account, department and week. The shared API client checks the token and abort state before clearing a session for a cancellable request. Only the HOD digest supplies a cancellation signal.
- Weekly digest. Antigravity job 0ec344fd28b24dbb801076a47b7ab514 changed the recommendation to review pending workload with faculty. The generation test assigns the only pending item to a professor and verifies the wording. The model input and one-call-per-department-per-week cache are unchanged.
- Added a synthetic verified procedure in a different department. Its owning resident sees one verified procedure, while the first resident sees zero.

~~~powershell
pnpm --dir artifacts/api-server run typecheck
pnpm --dir artifacts/mockup-sandbox run typecheck
pnpm --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/arogya-adoption.test.ts tests/arogya-weekly-digest.test.ts tests/case-review-details.test.ts tests/enumeration-collapse.test.ts tests/migrations.test.ts 2>&1 | Tee-Object -FilePath 'tmp/mochi-review-fix-targeted.txt'
git diff --check 5b5e16e
~~~

Both typechecks and the diff check exited 0. The targeted test log reports:

~~~text
✔ professor review flags respect legacy procedure fields and configured academic and clinical requirements (144.6746ms)
✔ free-text procedures ignore requirements from a retained procedure catalog (152.8472ms)
ℹ tests 19
ℹ pass 19
ℹ fail 0
~~~

The resident request returned 200 with Procedures verified 0, target 11. The resident from the other department got 200 with Procedures verified 1, target 12. The HOD's ready digest returned 200 with the department-wide wording. The authorization fixture responses, cache behavior and PGlite migration results are in the targeted test log.

The browser fixture started just before midnight Sunday in Asia/Kolkata. The ready card refreshed in the same open tab after advancing through midnight. The previous summary disappeared. At mobile width, a failed request showed an error and retry recovered. All five calls posted an empty JSON body. A hidden tab did not fetch until visible, and an inactive HOD route did not fetch until reentry. Both returned ready after exactly one new request. A delayed JSON 401 from an old digest request preserved a newer synthetic session. Screenshot: tmp/mochi-hod-weekly-rollover.png.

The full API run exited 1 with the same 18 failures observed on the clean base. The developer approved handling those failures separately. The full output is in tmp/mochi-review-fix-api-tests.txt.

~~~powershell
pnpm --dir artifacts/api-server test 2>&1 | Tee-Object -FilePath 'tmp/mochi-review-fix-api-tests.txt'
exit $LASTEXITCODE
~~~

~~~powershell
$mochiBaseline = Get-Content -LiteralPath 'tmp/mochi-adoption-baseline-failures.txt'
$mochiCandidate = rg --no-line-number '^\s*✖ .+? \(\d[\d.]*ms\)' tmp/mochi-review-fix-api-tests.txt | ForEach-Object { $_ -replace '^\s*✖ (.+?) \(\d[\d.]*ms\).*$', '$1' } | Sort-Object -Unique
$mochiDifferences = @(Compare-Object -ReferenceObject $mochiBaseline -DifferenceObject $mochiCandidate)
"Baseline failures: $($mochiBaseline.Count)"
"Candidate failures: $($mochiCandidate.Count)"
"Differing failure names: $($mochiDifferences.Count)"
$mochiDifferences
rg --no-line-number '^ℹ (tests|pass|fail|duration_ms)' tmp/mochi-review-fix-api-tests.txt
~~~

~~~text
Baseline failures: 18
Candidate failures: 18
Differing failure names: 0
ℹ tests 404
ℹ pass 386
ℹ fail 18
ℹ duration_ms 692860.1086
~~~

## Independent re-review after the fixes

### Scope adherence

The scope lens confirmed the fixes complete Part 2. The session guard respects the approved account-switch behavior for the HOD digest, the sole caller using a cancellation signal. No production routes moved or changed their authorization contract. The full unstaged inventory remains 23 tracked changes and eight untracked task files.

### Rule violations by section

The rules lens found no new ownership, department-scoping, ID-system, or privacy issues under §§3–5 and §8. Clinical flags expose only codes on records that the authenticated reviewer already receives. The digest still sends four department counts to its provider. The high-assurance tier specified under §15 remained in place.

### Evidence check

The evidence lens confirmed the 19 focused results, including the free-text and professor-assignment cases, the aggregate digest request, and the other department's verified procedure. The resident 403 tests role enforcement. The source uses a resident ID filter. A second resident from the same department is not covered by that fixture. The HOD 404 is a simulated disappearance. Browser checks used synthetic requests. The final full API run reproduced all 18 baseline failures and showed no additional failing names.

### Blast radius

The compatibility lens confirmed that the new card refreshes when visible, reenters after the week changes, and protects a newer session from an obsolete request. The week calculation uses the browser clock. A device clock that trails the server can show an already loaded summary until the browser reaches Monday.

### What was expanded beyond scope

No unrelated source was changed. The free-text and conference checks complete the professor flag fix. The shared client adjustment is limited to cancellation-aware requests used by the HOD card.

### What was skipped

The 18 baseline failures are separate by developer approval. Existing raw Clinical Work error logging and duplicate procedure catalog definitions were noted as separate follow-ups. The project-wide budget still needs account spend evidence. Migrations, Render changes, and the Luna move remain pending.

### Verdict

Accept. The scoped fixes passed independent re-review and introduced no additional full-suite failures. The developer accepted the result. Release still requires the spend check and developer-applied migrations.

## Close-out on 2026-11-24

The four parts are complete in the code. The three role updates within Part 2 have separate commits.

| Part | Commit | Work |
| --- | --- | --- |
| 0 | 95d3bcb | Approved related work can share one task |
| 1 | 41e2d4d | Metadata-only usage tracking and scoped counts |
| 2, resident | 2dd36ea | Progress against configured targets |
| 2, faculty | 26a7e49 | Flags on assigned review records |
| 2, HOD | c2b07b2 | Cached weekly digest |
| 3 | 0f64c71 | Error actions and answer-source labels |

PR pending.

Independent review used the scoped high-assurance tier. The final API and UI checks ran locally with synthetic fixtures. The 18 matching baseline failures, rollout cost confirmation, and migrations 0032 and 0033 are tracked separately. This repository has no STATUS.md or MASTER_PLAN.md, so this handoff records the result. AGENTS.md §14.2 still names Claude Chat. The developer's approval was recorded in this conversation.

### After adoption

Luna is a separate task for elogbook-api. Use the approved OpenAI test project to verify ordinary replies, structured JSON, tool calls, and failure behavior with synthetic requests. Preserve the 400 and 800 output limits in both Chat Completions builders using max_completion_tokens. Use reasoning_effort none for low cost and latency. Record cost and latency before changing Render and include a rollback to gpt-4o-mini. The live department demo and professor champions are developer-owned. Patient-text conversion remains parked.
