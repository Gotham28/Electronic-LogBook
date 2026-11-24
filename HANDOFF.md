# HANDOFF — gpt-6-luna compatibility for both Mochi OpenAI call paths

Branch `task/luna-model-migration`, worked from `origin/main` `5b5e16e`. Executor: Direct (Sonnet). Nothing committed, no push, no PR. Replaces the stale `HANDOFF.md` from an earlier task (tracked in git; the diff will show it as replaced). No secret value appears here; `OPENAI_API_KEY` is named only.

Suggested review tier: Standard / medium (legacy Sonnet), as scoped. Unratcheted: no independent Antigravity tier exists (AGENTS.md §15.4).

## What changed
| File | Change |
|---|---|
| `artifacts/api-server/src/lib/arogya/model-params.ts` (new) | `reasoningEffortParam()`: returns `{ reasoning_effort }` only when `OPENAI_REASONING_EFFORT` is set and non-blank after trim, else `{}`. No imports, so no cycle. |
| `artifacts/api-server/src/lib/arogya/provider.ts` | v2 `providerRequest`: `max_tokens: 800` -> `max_completion_tokens: 800`; spreads `reasoningEffortParam()`; import added. |
| `artifacts/api-server/src/lib/arogya.ts` | v1 `callOpenAI`: `max_tokens: 400` -> `max_completion_tokens: 400`; same spread; import added. |
| `artifacts/api-server/scripts/eval-arogya.ts` | Existing live structured-JSON check: `max_completion_tokens: 500` plus the env gate. New live tool-call round trip (one strict tool, `parallel_tool_calls:false`, asserts exactly one `tool_calls` entry with valid args, returns a synthetic tool result, asserts strict-schema JSON back). New live plain-text check in the v1 shape (no tools, no `response_format`). No database, no real records. |
| `artifacts/api-server/tests/arogya-model-params.test.ts` (new) | Mocked `fetch`, 3 cases each for v1 and v2: unset env, blank env, `none`. v2 is driven through `answerArogya` directly (no database); v1 through `callOpenAI`. |
| `.env.example` | Adds `OPENAI_REASONING_EFFORT=` with a comment (key name only, no value). |

## Guard hook notes (report, not a deviation)
- `scripts/eval-arogya.ts` and `.env.example` were blocked by `antigravity-guard.ps1` until the developer widened the allow list by hand. The hook was not edited by the agent; the Direct-executor scope check apparently did not match the `## Executor` text `Direct (legacy: Sonnet direct)`. Worth a look.
- `pnpm run typecheck:libs` (`tsc --build`) was run once so `lib/db/dist` existed; the output is gitignored. Without it `pnpm typecheck` fails with TS6305.

## Verification (output from this run)

### `pnpm typecheck` (artifacts/api-server)
```
$ tsc -p tsconfig.json --noEmit
typecheck exit=0
```

### `pnpm eval:arogya` (offline, no `AROGYA_EVAL_LIVE`)
```
Arogya offline evaluation passed: 90/90 core retrievals, 3 sensitive-input blocks, 4 unsupported prompts, 30 edge cases total.
Live provider evaluation skipped; set AROGYA_EVAL_LIVE=true to send the curated synthetic examples to the configured model.
```

### `pnpm test` (artifacts/api-server): FAILS, 18 failures, none in files this task touched
```
ℹ tests 395
ℹ pass 377
ℹ fail 18
ℹ cancelled 0
ℹ skipped 0
```
New tests, all pass:
```
✔ v1 callOpenAI: unset env sends max_completion_tokens and neither max_tokens nor reasoning_effort
✔ v1 callOpenAI: blank env does not send reasoning_effort
✔ v1 callOpenAI: OPENAI_REASONING_EFFORT=none sends reasoning_effort "none"
✔ v2 providerRequest: unset env sends max_completion_tokens and neither max_tokens nor reasoning_effort
✔ v2 providerRequest: blank env does not send reasoning_effort
✔ v2 providerRequest: OPENAI_REASONING_EFFORT=none sends reasoning_effort "none"
```
The 18 failing tests (clinical-works x11, the radiology template and its dry-run/apply tests x4, two logbook-profile validation tests x2, and `surgery-procedure-fields`):
```
POST clinical-works: 401 / 403 / 201 / nonexistent student          (400 !== 201: "Competency level is required for this department")
category and sub-type rules
PATCH clinical-works: 401 / 403 / 200 / 404
PATCH changing the category clears a stale sub-type and re-checks it
DELETE clinical-works: 401 / 403 / 200 / 404, and a deleted row cannot be edited
faculty review: only the named supervisor or the HOD can verify, and verified rows are locked
rejected entries can be edited and go back to pending with remarks cleared
logbook read: owner and HOD see all entries, a professor sees only entries they supervise
review queue lists pending clinical works with category names
HOD adds sub-types under a category; bad parents, wrong kinds and in-use categories are refused
HOD hard-delete of a student removes their clinical work logs
the radiology template matches the requested lists
a dry run reports the changes and saves nothing
applying merges flags without dropping existing ones and loads the catalog and schedule
applying twice changes nothing more
the document's 15, 15 and 18 sections are available in the corresponding years
validation covers participation, year, date ranges, attendance, appraisal ratings and discussion
the supplied SQL creates Surgery, its config and exactly the four requested role codes   (23502: null value in column "college_id" of relation "departments")
```
**Pre-existing baseline (relayed by the reviewing session; not run by this session):** on clean `5b5e16e`, `pnpm test` gave 389 tests, 371 pass, 18 fail, with the same 18 names as listed above. This worktree's run is 395 tests, 377 pass, 18 fail; the difference of 6 is the new `arogya-model-params` tests. `origin/main` `41c2131` was **not** tested.

### `git diff --stat 5b5e16e` (fresh run, includes `CURRENT_TASK.md` and `HANDOFF.md`)
```
 .env.example                                    |   3 +
 CURRENT_TASK.md                                 | 274 ++++++++++++------------
 HANDOFF.md                                      | 182 ++++++++++------
 artifacts/api-server/scripts/eval-arogya.ts     |  67 +++++-
 artifacts/api-server/src/lib/arogya.ts          |   4 +-
 artifacts/api-server/src/lib/arogya/provider.ts |   4 +-
 6 files changed, 334 insertions(+), 200 deletions(-)
```
`eval-arogya.ts` is 65 insertions and 2 deletions (67 lines changed). `git diff` ignores untracked files, so the two new files are not in that stat: `src/lib/arogya/model-params.ts` and `tests/arogya-model-params.test.ts`. The `HANDOFF.md` line count changes as this file is edited; it replaces an earlier task's tracked `HANDOFF.md`, and `CURRENT_TASK.md` is the planning output.

### `grep -rn "gpt-" artifacts/api-server/src`
No matches (grep exit 1).

## Live eval: developer-run, relayed second-hand. Raw output for both runs is below ("Raw terminal output").
**Plainly: the live eval exits 1 on both models, with 3/7 role checks passing on each.** The developer ran it; this session did not. The raw output reached this file via the coordinator session (which received the terminal tab's text from the developer), so it is second-hand to this session. The summary text in this section and the next was written from earlier relayed figures and matches the raw output below.

### First run (relayed by the planning session)
Run from `artifacts/api-server` with the developer's own key in the shell. **Key used: the production key (developer-confirmed in chat).** This departs from the task's `## Developer decisions` ("an approved OpenAI test-project key"). Only synthetic eval prompts were sent (no database, no patient or user data), so no §8 exposure, but the spend landed on the production project. Recommendation: use the test-project key for the rerun.

| Run | Result |
|---|---|
| `OPENAI_MODEL=gpt-6-luna`, `OPENAI_REASONING_EFFORT=none`, `AROGYA_EVAL_LIVE=true` | Offline 90/90. Live: `resident-cases-1` passes (structured-JSON request with `max_completion_tokens` + `reasoning_effort: "none"` accepted, no 400). Then throws at the numeric rule: `faculty-appraisal-1: answer introduced an unsupported numeric claim.` |
| `OPENAI_MODEL=gpt-4o-mini`, `OPENAI_REASONING_EFFORT` unset | Identical: `resident-cases-1` passes, `faculty-appraisal-1` fails the same way. |

Reading: the failure is **not a Luna regression**. It also shows the rollback configuration (gpt-4o-mini + `max_completion_tokens`, no effort) is accepted. Either the existing any-digit rule in `liveEvaluation` (`/\b\d+\b/`) is strict, or that fixture invites a number (e.g. "Quarter 1"). **The numeric rule, fixtures and prompts were deliberately not changed.** Whether to allow such numbers is a developer decision (AGENTS.md §14.5, any value the agent would otherwise guess).

Because the original loop threw on the first failure, **the new tool-call and plain-text checks had never run** at that point.

### Diagnostics edit made after that run (`scripts/eval-arogya.ts` only)
`liveEvaluation` now records a failure per item instead of throwing on the first: it prints `FAIL <id>: <message>` and the rejected answer (the model's `workflowId`/`reply`/`steps` JSON, synthetic output, no patient data) to stderr, continues through all items and the tool-call and plain-text checks, then throws at the end if anything failed (non-zero exit). The pass line now reads `... evaluation: N/M role-specific responses passed.` Re-verified after the edit:
```
$ pnpm typecheck        -> exit 0
$ pnpm eval:arogya (offline)
Arogya offline evaluation passed: 90/90 core retrievals, 3 sensitive-input blocks, 4 unsupported prompts, 30 edge cases total.
Live provider evaluation skipped; set AROGYA_EVAL_LIVE=true to send the curated synthetic examples to the configured model.
```
### Rerun with the diagnostics edit (relayed by the planning session; unverified)
Source: the developer's "luna live eval" terminal tab (`luna-live-eval.ps1` scratchpad script), **production key again**. The figures below were relayed in a cross-session message; the raw terminal output is not pasted here, so a reviewer who wants it must ask the developer for it.

| | RUN 1: `gpt-6-luna`, `OPENAI_REASONING_EFFORT=none` | RUN 2: `gpt-4o-mini`, effort unset |
|---|---|---|
| Exit | 1 | 1 |
| Offline | 90/90 | 90/90 |
| Live role checks | 3/7 passed | 3/7 passed (same four failures) |
| Tool-call round trip | PASSED: "one strict tool call with valid arguments, then valid strict-schema JSON" | PASSED |
| Plain-text check | PASSED: "non-empty plain reply" | PASSED |

Failing items, identical on both models:
- `faculty-appraisal-1` and `faculty-appraisal-2`: unsupported numeric claim.
- `hod-student-approval-2`: answer omitted the required idea "HOD".
- `hod-student-approval-3`: answer omitted the required idea "payment".

Interpretation (coordinator-verified, relayed; not independently re-checked by this session):
- The numeric failures come from "below 4" in the remediation step. That "4" is in the workflow knowledge itself (`src/lib/arogya/knowledge/faculty.ts:6`, `hod.ts:7`). Production's `containsUnverifiedNumber` allows numbers found in knowledge; the eval's any-digit rule (`/\b\d+\b/` in `liveEvaluation`) does not. So the eval is stricter than production, and the rule predates that knowledge text.
- The two `mustMention` failures are wording-strict fixtures that both models miss.
- All four are existing eval-fixture issues, the same on both models. **Not a Luna regression.** `gpt-6-luna` is at parity with `gpt-4o-mini` on every check, and every request setting was accepted on both: `max_completion_tokens`, `reasoning_effort: "none"`, strict tool calling with `parallel_tool_calls: false`, strict `response_format`.

### Status of the live verification item
The task asked for the structured-JSON check, tool-call round trip and plain-text check all passing. The tool-call round trip and plain-text check pass, and the structured-JSON request is accepted by both models. But **the live run exits 1: 4 of 7 role checks fail on both models, for pre-existing eval reasons.** Those four were left unfixed because the numeric rule and the fixtures are out of scope (AGENTS.md §14.5: loosening is a developer decision). All of this is relayed and unverified until the raw output is pasted. Even taken at face value it is not a green eval: it indicates the parameter migration is accepted by both models, nothing more.

### Raw terminal output (developer-run, production key, relayed via the coordinator session)
Source: the developer ran `luna-live-eval.ps1` (a session scratchpad script) in the "luna live eval" terminal tab. The masked key line is omitted, and the key was cleared from the process at the end. **Two lines are trimmed from each run:** the Node stack trace and the "Node.js v24.12.0" version line. Otherwise verbatim.

```
=== RUN 1: gpt-6-luna, OPENAI_REASONING_EFFORT=none ===
$ tsx --tsconfig tests/tsconfig.json scripts/eval-arogya.ts
Arogya offline evaluation passed: 90/90 core retrievals, 3 sensitive-input blocks, 4 unsupported prompts, 30 edge cases total.
FAIL faculty-appraisal-1: faculty-appraisal-1: answer introduced an unsupported numeric claim.
  rejected answer (synthetic eval output, no patient data): {"workflowId":"quarterly-appraisal","reply":"You can submit a quarterly appraisal for an approved resident in your department. An existing appraisal for the same resident and period prevents another submission.","steps":["Open Assessments and select Quarterly Appraisal.","Select the approved resident, exact quarter, and year.","Enter the appraisal date, select a publication, and complete all ten scores. If any score is below 4, enter the required remediation text.","Review the form and submit it."]}
FAIL faculty-appraisal-2: faculty-appraisal-2: answer introduced an unsupported numeric claim.
  rejected answer (synthetic eval output, no patient data): {"workflowId":"quarterly-appraisal","reply":"A professor in the resident’s department can create a quarterly appraisal. Check that the resident is approved and that no appraisal already exists for the same quarter and year.","steps":["Open Assessments and select Quarterly Appraisal.","Select the resident and the exact quarter and year.","Enter the appraisal date, select the publication, and complete all ten scores. If any score is below 4, enter the required remediation text.","Review the form and submit it."]}
FAIL hod-student-approval-2: hod-student-approval-2: answer omitted required idea "HOD"
  rejected answer (synthetic eval output, no patient data): {"workflowId":"student-approval","reply":"After payment is completed, approve the self-registered resident from Pending Students.","steps":["Open Student Access.","Open Pending Students.","Review the resident’s registration.","Approve the resident."]}
FAIL hod-student-approval-3: hod-student-approval-3: answer omitted required idea "payment"
  rejected answer (synthetic eval output, no patient data): {"workflowId":"student-approval","reply":"Review new self-registrations under Pending Students in Student Access.","steps":["Open Student Access.","Select Pending Students.","Review the registration and approve or reject it."]}
Arogya live synthetic evaluation: 3/7 role-specific responses passed. No project database or user records were used.
Arogya live tool-call round trip passed: one strict tool call with valid arguments, then valid strict-schema JSON.
Arogya live plain-text check passed: non-empty plain reply.
Error: Arogya live evaluation failed: faculty-appraisal-1, faculty-appraisal-2, hod-student-approval-2, hod-student-approval-3
[ELIFECYCLE] Command failed with exit code 1.
=== RUN 1 exit code: 1 ===
=== RUN 2: gpt-4o-mini, OPENAI_REASONING_EFFORT unset ===
$ tsx --tsconfig tests/tsconfig.json scripts/eval-arogya.ts
Arogya offline evaluation passed: 90/90 core retrievals, 3 sensitive-input blocks, 4 unsupported prompts, 30 edge cases total.
FAIL faculty-appraisal-1: faculty-appraisal-1: answer introduced an unsupported numeric claim.
  rejected answer (synthetic eval output, no patient data): {"workflowId":"quarterly-appraisal","reply":"To post a student's quarterly appraisal, follow these steps:","steps":["Open Assessments and select the Quarterly Appraisal section.","Select an approved resident in your department and the exact quarter and year.","Complete the appraisal date, publication selection, all ten scores, and the required remediation text when any score is below 4.","Review the form and submit it."]}
FAIL faculty-appraisal-2: faculty-appraisal-2: answer introduced an unsupported numeric claim.
  rejected answer (synthetic eval output, no patient data): {"workflowId":"quarterly-appraisal","reply":"To enter an appraisal for a resident in your department, follow these steps:","steps":["Open Assessments and select the Quarterly Appraisal section.","Select an approved resident in your department and the exact quarter and year.","Complete the appraisal date, publication selection, all ten scores, and the required remediation text when any score is below 4.","Review the form and submit it."]}
FAIL hod-student-approval-2: hod-student-approval-2: answer omitted required idea "HOD"
  rejected answer (synthetic eval output, no patient data): {"workflowId":"student-approval","reply":"To approve a pending resident after payment, follow these steps:","steps":["Open Pending Students from Student Access.","Review the registration.","Approve or reject the registration. The resident can sign in after approval."]}
FAIL hod-student-approval-3: hod-student-approval-3: answer omitted required idea "payment"
  rejected answer (synthetic eval output, no patient data): {"workflowId":"student-approval","reply":"You can review new student registrations in the Pending Students section.","steps":["Open Pending Students from Student Access.","Review the registration.","Approve or reject the registration."]}
Arogya live synthetic evaluation: 3/7 role-specific responses passed. No project database or user records were used.
Arogya live tool-call round trip passed: one strict tool call with valid arguments, then valid strict-schema JSON.
Arogya live plain-text check passed: non-empty plain reply.
Error: Arogya live evaluation failed: faculty-appraisal-1, faculty-appraisal-2, hod-student-approval-2, hod-student-approval-3
[ELIFECYCLE] Command failed with exit code 1.
=== RUN 2 exit code: 1 ===
=== Done. Key cleared from this process. ===
```

### Follow-ups (not done here)
- Align the eval's numeric rule with production's evidence-based `containsUnverifiedNumber` check.
- Review the two `mustMention` fixtures (`hod-student-approval-2`, `hod-student-approval-3`).
- Rerun with the test-project key once the task's key decision is honoured (this run used production; see above).

## Noticed, not acted on
- `AGENTS.md` §14.1/§14.2 still say Antigravity writes all code and route steps through "Claude Chat"; GLOBAL.md overrides both. Separate docs task.
- Codex's `task/mochi-ai-adoption` also edits `provider.ts`; expect a small conflict at the request body when the second PR rebases.
- Unverified until the live run: `temperature` (not sent by either path) and whether reasoning tokens bill as output.

## Operational note for the Render switch
On `gpt-6-luna`, `OPENAI_REASONING_EFFORT` must be `none`; set it together with `OPENAI_MODEL` in **one Render save**. A provider 400 (a bad effort value, or `none` missing so tool calls are refused) is mapped to `AROGYA_UNAVAILABLE` and returned as HTTP 503, and it still spends one of the user's 20 daily questions: `checkAndIncrementLimit` runs before the provider call in `routes/arogya.ts` (e.g. lines 151 and 213) and is not refunded on failure. (Checked in code by this session.)

## Anything beyond scope
The one helper file (`model-params.ts`) is the "small shared helper" the task allows. Beyond that, these went past a literal reading of the task, all in `scripts/eval-arogya.ts`, made at the planning session's request after the first live run failed on the first item:
- `liveEvaluation` changed from throw-on-first-failure to **collect-all-failures** (a `failures` array and `recordFailure` helper, per-item try/catch, around lines 55-61 and the final throw near line 157), so the new tool-call and plain-text checks run even when earlier items fail.
- Rejected model answers (the `workflowId`/`reply`/`steps` JSON) are printed to stderr on failure. Synthetic fixtures only; no patient data.
- The pass line wording changed from "... passed: N/M role-specific responses" to "... evaluation: N/M role-specific responses passed."

**Open developer decision: accept or revert the failure-collection rewrite.** Not reverted by this session. The numeric rule, fixtures and prompts were not changed.
