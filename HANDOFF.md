# HANDOFF — Per-department label overrides (step 2a), fix round 3 (documentation round, on top of fix round 2)

Branch `task/department-label-overrides`, based on `origin/main` `5b5e16e` (PR #163). Executor: Sonnet direct. The text below is the execution session's report (rounds 1 to 3); it was uncommitted when written. **Committed, pushed and opened as a PR at close-out on 2026-11-24: see "Close-out" at the end of this file** (the wording "nothing committed" in the round sections describes the state at that time). Review tier: high assurance (legacy Opus), unratcheted, since no independent Antigravity tier exists (AGENTS.md §15.4).

**No command connected to a database.** `DATABASE_URL` was never set or used (`unset DATABASE_URL` before every test/typecheck command). Tests ran on in-process PGlite only. The migration is drafted, never run (§6).

## RELEASE GATE
**Migration `0034_department_label_overrides.sql` must be applied (by the developer, with `src/migrate.ts`) before this PR is merged and deployed.** The catalog (`GET /api/departments/:id/catalog`) reads `department_label_overrides`. Until the table exists, every catalog call returns `500`, which means no one can load the app. Migration first, then code.

## Migration renumbered 0033 → 0034
The Mochi adoption task owns `0032_assistant_usage_events.sql` and `0033_assistant_department_weekly_digests.sql`; both have merged to `main` (`41c2131`, PR #164). This task's migration is `0034_department_label_overrides.sql`. The developer decided the rename in chat on 2026-11-24 ("Rename to 0034 now") and widened the scope to add the 0034 path.
- **Done:** `lib/db/migrations/0034_department_label_overrides.sql` has byte-identical content to the old 0033 file (`cmp` said identical; sha256 `0711471b1164cce8…` for both). `lib/db/src/migrations.ts:20` registers `0034_department_label_overrides.sql`. `tests/department-labels.test.ts` lines 304 and 310 point at the 0034 file. The SQL text contains no migration number, so it did not change.
- **The old `lib/db/migrations/0033_department_label_overrides.sql` was deleted by the coordinator session, with the developer's approval, on 2026-11-24.** It was untracked, so no git history is affected, and it was byte-identical to the 0034 file at the time. Nothing references it; `ls lib/db/migrations` at close-out shows only `0034_department_label_overrides.sql` after `0031`. (Earlier versions of this file said it was still present, or could not be deleted by the executor; both are superseded. The execution session could not delete it itself, because the guard blocked `rm` and `mv`.)
- **Migration count:** `lib/db/src/migrations.ts` lists 32 files on this branch, and `tests/migrations.test.ts` expects 32 (`tests/migrations.test.ts` was changed 31 → 32 only). After merging onto `main` `41c2131`, which already holds Mochi's 0032 and 0033, the count becomes 34 (close-out resolves the `migrations.ts` and `migrations.test.ts` conflicts; not done in this round).
- **Stale 0033 text in `CURRENT_TASK.md`:** the real stale lines were 48, 143/144, 181/182, 332 and 419 (an earlier version of this note gave wrong line numbers). All are updated in fix round 3. The earlier entries of `.agents/runs/2026-11-23-department-label-overrides.md` still say 0033 (append-only).

## Fix round 3 (documentation round, 2026-11-24)
Touched only: `CURRENT_TASK.md`, `HANDOFF.md`, `.agents/runs/2026-11-23-department-label-overrides.md` (a "Fix round 3" section appended) and `artifacts/api-server/tests/department-labels.test.ts`. No code under `src/`.
- `CURRENT_TASK.md`: heading date fixed; a 2026-11-24 decision entry added (renumber 0033 → 0034, on the developer's chat instruction "Rename to 0034 now", because Mochi owns 0032 and 0033); the stale 0033 scope bullet removed; the 0034 text now stands at `CURRENT_TASK.md:42`, `:56-59` (the decision), `:149-151` (the Migration design bullet), `:187-189` (scope), `:336` and `:428`, each saying that Mochi's 0032 and 0033 merged to `main` (`41c2131`, PR #164). (These are the line numbers of the committed file, after the close-out edits; the numbers in the round-3 session were different.)
- `HANDOFF.md`: the 0033 text above, the refresh-caller list, the PATCH evidence, the label-test section claim and the M3 note corrected (below).
- `department-labels.test.ts`: the rename loop for ids 15, 38 and 14 now asserts that every non-renamed department's rows are exactly its expected rows (key and value), not only which ids have rows (see "Fix round 2", item 4).
- Test output from this run: see "Label and migration tests" under Verification.

## Fix round 2: what each finding became
1. **C1 (Critical), printable logbook never compared: fixed, now compared.** Cause confirmed: `ready()` in `2a-capture-fix.cjs:35` returned true for any text over 100 characters, so all 16 `*__printable.txt` captures were copies of the Postings page. New capture script waits for printable-only markers (below), and proves each printable capture differs from the Postings capture by hash. Result: no wording difference on the printable page (section "Looks identical"). `HANDOFF` lines 174 and 177 of the previous version are corrected there.
2. **M3, success toast after a failed refresh: fixed**, verified in a browser (below). Files: `lib/department-context.tsx`, `components/DepartmentSettings.tsx` only.
3. **M4, evidence format: done.** The request and response for each DELETE ownership case, the label-test and migration-test result lines (not a complete copy of the log: the `{"case":…}` JSON lines are left out, see "Label-test and migration-test sections"), the summary and the failing-test list, all from the round-2 logs (below). The failing-test comparison against an unchanged `origin/main` was re-run this round (below).
4. **m3, literal-id name-guard test: added** (`tests/department-labels.test.ts`): ids 15, 38 and 14 each renamed to a different name get no rows, and the other three ids still get exactly their rows (key and value; the round-2 version only compared which ids had rows, and the exact-rows assertion was added in fix round 3).
5. **Settings views "drop one blank line": not reproduced; reported, not accepted** (see "Looks identical", settings).
6. **CURRENT_TASK.md:** the three developer decisions (Wording excluded from the difference rule; id-based backfill test; text comparison replaces screenshots) were recorded under `## Developer decisions recorded`, on request of the coordinating sessions. Nothing else in the file was touched.
7. **Migration renumber 0033 → 0034:** done in round 2. The old untracked 0033 file could not be deleted by the execution session (guard); the coordinator session deleted it, with the developer's approval, on 2026-11-24 (see "Migration renumbered 0033 → 0034"). Tests, full suite and typecheck were re-run after the renumber in round 2 (below).

No finding was otherwise pushed back, except item 5.

### M3 in detail
`DepartmentProvider.refresh()` catches its own errors (`department-context.tsx`), so the `await department.refresh()` in `DepartmentSettings.tsx` never threw and `toast.success("Wording saved")` fired even when the catalog reload failed. Fix:
- `department-context.tsx`: `refresh` now returns `Promise<boolean>`: `true` after a good load, `false` on failure (and on the no-department case). The context type is `refresh: () => Promise<boolean>`. Existing callers that ignore the result (`void refresh()`, `onClick={refresh}`, `await data.refresh()` in `DepartmentSettings.tsx:255, 275`, `LogbookSectionSettings.tsx:83`, `ProcedureFieldRequirements.tsx:631, 810`, `void departmentData.refresh()` in `DemoDepartmentCustomizer.tsx:103, 110`) compile and behave as before. Those other callers keep their old behaviour; not changed (§9).
- `DepartmentSettings.tsx`: `run()` reads the result. On `false` it shows `toast.warning("Wording saved, but the pages could not reload it. Reload this page to see it everywhere.")` instead of the success toast, and the Wording section shows a persistent `role="alert"` banner ("Your change was saved, but the pages could not reload it. Reload this page to see the new wording everywhere."). The banner lives in the section, not in the row, because a saved row remounts (its key includes the revision) and would lose a row-local message. A later successful change clears it.
- Verified in a real (non-demo) HOD session in headless Chromium, with the API served by Playwright route interception (the Vite dev server of this worktree, port 5192). Scenario A (catalog reload succeeds), scenario B (catalog GET forced to `500` after the save). Output of this run:
```
--- A (catalog refresh succeeds) ---
server calls: ["GET /api/departments/1/catalog -> 200","PATCH /api/admin/department/labels/postings.unitTitle {\"value\":\"Clinical unit (M3 check)\",\"revision\":0}","GET /api/departments/1/catalog -> 200"]
toasts: ["Wording saved"]
role=alert elements: []
--- B (catalog refresh FAILS) ---
server calls: ["GET /api/departments/1/catalog -> 200","PATCH /api/admin/department/labels/postings.unitTitle {\"value\":\"Clinical unit (M3 check)\",\"revision\":0}","GET /api/departments/1/catalog -> 500 (forced)"]
toasts: ["Wording saved, but the pages could not reload it. Reload this page to see it everywhere."]
role=alert elements: ["Catalog unavailable","Your change was saved, but the pages could not reload it. Reload this page to see the new wording everywhere."]
```
In B no "Wording saved" success toast appears. ("Catalog unavailable" is the provider's own existing banner.) The label route itself was mocked here; the real route is covered by the API tests below.

**This output was not saved to a log file.** The `verify-m3.cjs` script printed it to the terminal and it exists only as pasted above; it cannot be re-checked from a file. The script itself is in the session scratchpad of that earlier round.

## Guard-driven edits to `CURRENT_TASK.md`
1. Earlier rounds (unchanged): `## Executor` relabelled `Sonnet direct`; the two `## Files/areas in scope` paths in backticks; round-1 decisions recorded.
2. Round 2: one block added under `## Developer decisions recorded`, headed "2026-11-23, given by the developer in the coordinating chat": (a) the new "Wording" settings entry is excluded from the "any difference is a failure" rule; (b) the id-based backfill means the backfill test checks the id-based selection, not name-matching; (c) the demo-mode text comparison replaces screenshots. Relayed by two coordinating sessions; recorded as asked, edit limited to that section.
3. The hook was not edited. Two shell/Write attempts were blocked in round 2 (the `mv` and the `0034` file write); both reported above.
4. Close-out (2026-11-24): the retired "Task-file note", the screenshot wording in `## Verification required` and the Approval line were reconciled with the developer's recorded decisions; see "Close-out" at the end of this file.

## Backfill (finalised against the developer's SELECT output, 2026-11-23)
Developer's query returned 8 rows: 14 MicroBiology MIC; 15 Dermatology DERM; 18 Radiology RED; 19 Radiology (Test) →18; 24 MicroBiology (Test) →14; 26 Dermatology (Test) →15; 38 Dermatology DERM; 39 Dermatology (Test) →38. The `0034` (was `0033`) backfill names departments **by literal id**, each insert also checking the name: Radiology id 18 (5 rows), Dermatology ids 15 and 38 (4 rows each), Microbiology id 14 (`milestones.pageTitle` only). 14 rows total. Test copies 19, 24, 26, 39 get no rows of their own and follow their config source at read time. Name fix: ids 14 and 24 (`MicroBiology` → `Microbiology`); the `UPDATE` still matches by name. Developer's choice, recorded in `CURRENT_TASK.md`. The backfill test checks this id-based selection (developer decision, 2026-11-23).

## Files touched
New:
- `lib/api-zod/src/department-labels.ts` — registry (9 keys), `defaultDepartmentLabel`, `resolveDepartmentLabel`, value/PATCH/DELETE schemas
- `lib/db/src/schema/department_label_overrides.ts` — table
- `lib/db/migrations/0034_department_label_overrides.sql` — DDL, backfill, name fix (DRAFT; renamed from 0033 in fix round 2; the old untracked 0033 file was deleted by the coordinator session)
- `artifacts/api-server/src/routes/department-labels.ts` — GET / PATCH /:key / DELETE /:key
- `artifacts/api-server/tests/department-labels.test.ts`
- `.agents/runs/2026-11-23-department-label-overrides.md` — run log (a "Fix round 2" and a "Fix round 3" section appended). It is git-ignored (`*.md` rule) and is **not** part of the close-out commits.
Modified:
- `lib/api-zod/src/index.ts`, `lib/db/src/schema/index.ts` — one export line each
- `lib/db/src/migrations.ts` — registers 0034; `artifacts/api-server/tests/migrations.test.ts` — count 31 → 32 only
- `artifacts/api-server/src/routes/index.ts`, `routes/department.ts`, `routes/superadmin.ts`
- `artifacts/mockup-sandbox/src/lib/department-context.tsx` — `labels`, `label()`, `useLabel()`, registry re-exports; **round 2: `refresh` returns `Promise<boolean>` (M3)**
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` — Wording section; **round 2: failed-refresh handling (M3)**
- `artifacts/mockup-sandbox/src/lib/demoDepartments.ts`; `components/pages/PostingsPage.tsx`, `PrintableLogbook.tsx`, `MilestonesPage.tsx`; `layout/AppLayout.tsx`; `ProfessorPortal.tsx`, `Dashboard.tsx` ("Case ID" only), `AdminPortal.tsx`, `RegistrationPage.tsx`, `HODPortal.tsx` (one line)
- `CURRENT_TASK.md` — decisions recorded (above)
- `artifacts/api-server/tests/department-labels.test.ts` — round 2: m3 test added; round 3: exact-rows assertion in the rename loop
Side effect, not mine to commit: the dev server regenerated `artifacts/mockup-sandbox/src/.generated/mockup-components.ts` (line endings only). Not staged. `artifacts/*/.tsbuildinfo` files are build output from the typecheck.

## Commands run

### Fix round 2
- `git status`, `git rev-parse`, `git archive 5b5e16e… | tar -x -C <scratch>/before-main` and again into `<scratch>/before-main2` (unchanged `origin/main`, outside the repo); `pnpm install --frozen-lockfile --offline` in each scratch copy.
- `pnpm exec vite dev --port 5191` (scratch `before-main`) and `--port 5192` (this worktree's `artifacts/mockup-sandbox`), from Bash, `--host 127.0.0.1`; stopped with `taskkill` on their PIDs (ports 5191 and 5192 refuse connections at the end).
- Playwright (`/d/elogbook-motion/node_modules/playwright`, read-only use, headless Chromium) scripts in the session scratchpad: `capture-printable.cjs`, `compare-printable2.cjs`, `capture-settings.cjs`, `verify-m3.cjs`. `curl` against `127.0.0.1:5191/5192` only. `netstat`, `taskkill` on my own dev-server PIDs only.
- `pnpm exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/department-labels.test.ts tests/migrations.test.ts` (api-server).
- `pnpm test` (api-server), run twice this round: before the renumber (`…/scratchpad/full-test.log`) and **after the renumber** (`…/scratchpad/full-test-r3.log`, the run reported below). Same tests, same results.
- After the renumber: `pnpm exec tsx … tests/department-labels.test.ts tests/migrations.test.ts` (log `labels-mig-r3.log`), `pnpm run typecheck` (log `typecheck-r3.log`), `cmp` and `sha256sum` of the 0033 and 0034 files (read-only), `rg`/`grep` for remaining 0033 references.
- Baseline on unchanged `origin/main` (`before-main2`): `node <before-main2>/artifacts/api-server/node_modules/tsx/dist/cli.mjs --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/clinical-works.test.ts tests/department-template.test.ts tests/physiology-logbook.test.ts tests/surgery-procedure-fields.test.ts`. (A first attempt with `pnpm exec tsx` in the older scratch copy made pnpm re-install there, which left that scratch copy unusable; it is scratch only and was not used. Discarded, not part of any result.)
- `pnpm run typecheck` (repo root).
- Blocked by the guard, not retried another way: `mv` of the migration file (twice, once as `rm`), and, before the scope line was widened, `Write` of the `0034` path. After the widening the 0034 file was written with `Write`; the execution session could not delete the old 0033 file (no delete tool; `rm` blocked). The coordinator session deleted it, with the developer's approval, on 2026-11-24.
- No command connected to a database. No `psql`, `drizzle-kit`, `migrate.ts`, `DATABASE_URL`.

### Fix round 3 (documentation round, 2026-11-24)
- Read and Edit of `CURRENT_TASK.md`, `HANDOFF.md`, `.agents/runs/2026-11-23-department-label-overrides.md` (appended) and `artifacts/api-server/tests/department-labels.test.ts` (one assertion block).
- `env -u DATABASE_URL pnpm exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/department-labels.test.ts tests/migrations.test.ts` in `artifacts/api-server` (log `labels-mig-r4.log`, exit 0; result lines under Verification).
- The full `pnpm test` and the root typecheck were not re-run in round 3 (no source change).
- No command connected to a database.

## Verification (output from this run)

### Label and migration tests, fix round 3 (this run; `DATABASE_URL` removed from the environment with `env -u`; log `labels-mig-r4.log` in the session scratchpad, exit 0)
Command, run in `artifacts/api-server`: `pnpm exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/department-labels.test.ts tests/migrations.test.ts`. This is the run that includes the new exact-rows assertion in the rename loop (ids 15, 38, 14). Result lines (the `{"case":…}` JSON lines the tests print are left out here; they are in the log):
```
▶ PATCH /admin/department/labels/:key (AGENTS.md §11)
  ✔ unauthenticated 401, wrong owner 403, correct HOD 200, nonexistent key 404 (324.0141ms)
  ✔ the written value is what is stored and what the catalog and the wording list return (42.8894ms)
  ✔ a department named in the body is rejected, and one named in the query is ignored; department B is unchanged (34.3151ms)
  ✔ a HOD of department A cannot change department B's rows, whatever they send (25.6169ms)
  ✔ stale revision is 409; empty, 81-character and multi-line values are 400; revision increments (57.9688ms)
  ✔ a value is stored as plain text and returned unchanged (9.0095ms)
✔ PATCH /admin/department/labels/:key (AGENTS.md §11) (14560.8819ms)
▶ DELETE /admin/department/labels/:key (AGENTS.md §11)
  ✔ unauthenticated 401, wrong owner 403, correct HOD 200, nonexistent key 404 (72.5496ms)
  ✔ a DELETE aimed at department B (query or body) never touches B's rows (66.4557ms)
  ✔ stale revision is 409; a valid key with no override is 200 with reset false (39.9563ms)
✔ DELETE /admin/department/labels/:key (AGENTS.md §11) (179.3337ms)
▶ reading wording
  ✔ GET lists every registry key with its default, override and revision, for HODs only (23.2184ms)
  ✔ the catalog returns overrides only, following the config source, and never another department's rows (43.1193ms)
✔ reading wording (66.6644ms)
▶ the milestone defaults follow the same effective wording flag the catalog computes
  ✔ flag off: the two milestone labels keep their generic defaults (11.0153ms)
  ✔ flag set in the stored config: value and default are the mandatory-certifications wording (40.4325ms)
  ✔ a department with no stored flag that the catalog treats as mandatory-certifications gets the same defaults (33.037ms)
✔ the milestone defaults follow the same effective wording flag the catalog computes (84.8048ms)
▶ migration backfill (PGlite, test data only)
  ✔ writes the exact label rows per department, fixes the name, leaves other departments alone, and is idempotent (1366.8236ms)
  ✔ a department's id is not enough on its own: an id that holds some other department gets no rows (3062.5418ms)
  ✔ the same name guard holds for the Dermatology ids 15 and 38 and the Microbiology id 14: a matching id holding a different name gets no rows (6551.2972ms)
  ✔ does not overwrite an override that already exists, and fixes only the first match (1232.4139ms)
✔ migration backfill (PGlite, test data only) (12213.4864ms)
✔ fresh installation and rerunning migrations are safe and checksum-tracked (3607.9094ms)
✔ legacy migration preserves users, requirements and logs and backfills catalog from actual records (2491.3494ms)
✔ ambiguous legacy memberships and duplicate HODs abort the entire migration without deleting records (2474.1268ms)
ℹ tests 21
ℹ suites 5
ℹ pass 21
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 62521.227
```
The full `pnpm test` and the root typecheck were **not** re-run in round 3 (documentation plus one test assertion only; no source file changed). The `pnpm test` (407 / 389 / 18) and typecheck (exit 0) output below is from fix round 2 and still describes the same source code; the label test file has one more assertion since.

### `pnpm test` (artifacts/api-server), summary — full run, round 2
```
ℹ tests 407
ℹ suites 15
ℹ pass 389
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
# HANDOFF — Task 3a: change one department setting at a time (after fix round 1)

Branch `claude/department-config-single-setting-fddc7f`, worked from `5b5e16e` (PR #163). Nothing committed, no PR, no push. Executor: Sonnet direct (this session wrote the code). No database was connected to: tests run on in-process PGlite only. No migration, no schema edit (0035 unused). No secret value appears in this file.

Suggested review model: Opus / high effort (AGENTS.md §15.2: ownership and department boundary §3, two ID systems §4). Unratcheted: no independent Antigravity tier exists for this task (§15.4).

## What changed (whole task, after fix round 1)

| File | Change |
|---|---|
| `lib/api-zod/src/department-settings.ts` (new) | `DEPARTMENT_SETTING_TIERS` (27 keys, 4 `mochi`, 23 `hod_only`), `departmentSettingKeySchema` (`z.enum`), `DEPARTMENT_SETTING_VALUE_TYPES`, per-key value schemas (all `z.boolean()`), `departmentSettingUpdateSchema` (`{ value, expectedValue: boolean \| null }`, `.strict()`). |
| `lib/api-zod/src/index.ts` | One line, directly under `export * from "./procedure-log-fields.js";`. |
| `artifacts/api-server/src/lib/department-settings.ts` (new) | `getDepartmentSettings(departmentId)` and `setDepartmentSetting({ departmentId, userId, key, value, expectedValue, actor })`. Order inside the setter: key allowlist (400) → tier check (403 for `actor !== "hod"` on any key whose tier is not `mochi`, before any DB access; fails closed, see Fix round 1) → value type (400) → department lookup and mirror check (403) → `db.transaction`: `SELECT … FOR UPDATE` on the config row, compare stored value with `expectedValue` (409), no-op returns without audit, otherwise write plus one `audit` row in the same transaction. Missing row: insert `{ [key]: value }` only with `onConflictDoNothing()`; an empty result (concurrent insert won the unique `department_id`) returns 409. Reads the raw stored value, never `getDepartmentFeatures` (comment at the read site). |
| `artifacts/api-server/src/routes/department-config-settings.ts` (new) | `router.use(requireAuth, requireRole(["hod"]), requireDepartment)`, `GET /` and `PATCH /:key` (`validate(departmentSettingUpdateSchema)`). Actor is hard-coded `"hod"`. Department comes only from `req.user.departmentId`; `userId` is `req.user.id` (`usersTable.id`). Logs department id and status code only. |
| `artifacts/api-server/src/routes/index.ts` | Exactly two lines: the import directly under `import logbookSectionsRouter …`, the mount directly under the logbook-sections mount and before `router.use("/admin", adminRouter)`. |
| `artifacts/api-server/tests/department-config-settings.test.ts` (new) | 9 tests, PGlite pattern of `logbook-sections.test.ts`. Prints each request/response as JSON. |

## Fix round 1 (review verdict: accept with fixes; developer said "Yes, send back" on 2026-11-23)

Only these three files were edited this round: `artifacts/api-server/tests/department-config-settings.test.ts`, `artifacts/api-server/src/lib/department-settings.ts` (one line), and this `HANDOFF.md`. Each finding was checked against the code first; all were valid and implemented.

1. **Other-department isolation test.** Before: HOD B wrote `academicsFirstInNav: true`, the value department A already held, and only that one key on A was checked, so a write that leaked into A could not be seen. Now: A holds `true`; HOD B (its own correct `expectedValue: null`) writes `false`. The test deep-equals A's entire `enabledFeatures` row before and after HOD B's call (`assert.deepEqual(await features(departmentIds[0]), departmentABefore)`), asserts B's response is `before: null, after: false`, and asserts B's row is `{ awards: true, academicsFirstInNav: false }`. The later assertion in the "rejects a body departmentId…" test was updated from `academicsFirstInNav: true` to `false` to match.
2. **Audit `performedById` test.** hod0's `users.id` is 1 and so is the first `students.id`, so the old check could not catch an ID mix-up. Now the audit test creates a department of its own (with a seeded config row, so the action is still `UPDATE`) and a HOD for it, created late (users.id 19 in this run). It asserts that this id is greater than every `students.id` and is not in the list of student ids (setup guard), then asserts `row.performedById === lateHod.id`, `!== accounts.hod0.id`, and not a `students.id`. **Deviation from the suggested wording:** I did not add a second HOD to department A, because the database allows one approved HOD per department (`users_one_approved_hod_per_department`; my first attempt failed with that constraint, nothing else changed). The no-op PATCH in that test also runs as the late HOD. Not mutation-tested: I did not temporarily change the route to record a `studentsTable.id` to watch this test fail; the guarantee is by construction (late id is above every student id).
3. **Tier gate** (`department-settings.ts:66`). `actor !== "hod" && DEPARTMENT_SETTING_TIERS[key] === "hod_only"` is now `actor !== "hod" && DEPARTMENT_SETTING_TIERS[key] !== "mochi"`. A key with a missing or new tier now blocks a non-HOD actor instead of letting it through. The 23-key `hod_only` loop test still passes; the `mochi`-tier key still works for `actor: "mochi"`.
4. **This file.** Per-file failure count fixed (11 `clinical-works`, not 10); the hand-annotated diff stat replaced with raw output below; the verification item 12 statement and the line-77 claim corrected; all pasted output below is from this round's runs.

### Verification item 12 ("only six paths") is not literally met

The six in-scope paths are the four new files (`lib/api-zod/src/department-settings.ts`, `lib/department-settings.ts`, `routes/department-config-settings.ts`, the test file) and the two edited index files (`routes/index.ts`, `lib/api-zod/src/index.ts`). The working tree also changes `CURRENT_TASK.md` (the approved plan, edited by the planning session, not by me) and `HANDOFF.md` (required by the task). So the diff against `5b5e16e` touches eight paths, not six. Nothing else was edited.

## Deviations and things you should decide (not acted on)

1. **`hideQuarterlyAppraisal` IS read from `enabledFeatures`.** The plan says it is "a local variable in `ProfessorPortal.tsx:151`, not a key". It is a local variable, but `ProfessorPortal.tsx:152` initialises it from `config?.enabledFeatures?.hideQuarterlyAppraisal`, so a stored key of that name has an effect (hides the quarterly appraisal section). I left it off the allowlist as instructed, so it returns `400`. If it should be settable it would be `hod_only` (it hides a record section). I did not add it. Whether any department stores it, I could not check (no database access). Still a separate developer decision.
2. **Mochi-tier greps found no tier change needed.** The four `mochi` keys are used only for labels and nav order (`AppLayout.tsx:194,211,249,252`, `CaseLogsPage.tsx:337-339,485,560`, `MilestonesPage.tsx:32`, `ThesisPage.tsx:29`, `arogya/knowledge/index.ts:38`). None touches record creation, editing, verification or visibility. No key was reclassified.
3. **Stored vs effective value for `useThesisAndMandatoryCertificationsLabel`.** `department-features.ts:19`, `routes/department.ts:70` and `department-context.tsx:46` default it to `true` for microbiology when unset. The new GET reports the stored value (`null` = unset), so for such a department the GET shows `null` while the effective label is on. This follows the plan's stored-value decision. Task 2b/4 should show effective values to the HOD.
4. **Existing-failure baseline.** `pnpm test` fails 18 tests; the same 18 fail on a clean `5b5e16e` (details below). Not caused by this task, not touched.
5. **`HANDOFF.md` overwritten.** The repo's tracked `HANDOFF.md` was the previous task's (credential removal). I replaced it, as the task requires.
6. **`CURRENT_TASK.md` shows as modified.** That edit is the approved plan from the planning session, not mine.
7. **Local `origin/main` moved.** During this round `origin/main` advanced from `5b5e16e` to `41c2131` (PR #164, Mochi adoption). The branch is still on `5b5e16e`, so the literal `git diff --stat origin/main` now lists 33 files, including the reverse of PR #164. That is not caused by this task. The raw stat below is against `5b5e16e`, the baseline the task was planned on.
8. Extra, in my own test file only: HOD of department B also patches the same key (to show department scoping); not a scope change.

## Commands run in this round (in full)

- `git rev-parse --abbrev-ref HEAD`, `git status --short`, `git rev-parse --short HEAD` (confirm branch and uncommitted files), `git rev-parse HEAD origin/main`, `git log --oneline -3 origin/main`/`HEAD`, `git diff --stat …`, `wc -l`, `grep` on the pasted outputs
- `pnpm exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/department-config-settings.test.ts` (twice: the first run failed on the HOD-uniqueness constraint described in Fix round 1, item 2; the second passed, and the output below is from it)
- `pnpm test` (from `artifacts/api-server`): full suite
- `pnpm run typecheck` (repo root)
- `pnpm exec tsc -p tests/tsconfig.json --noEmit` in `artifacts/api-server`, filtered to my files: no match (the 54 other lines are pre-existing)
- `git archive origin/main | tar -x -C <scratchpad>/baseline` (at that time `origin/main` was still `5b5e16e`, confirmed because `src/lib/arogya/weekly-digest.ts` from PR #164 is absent in it), `pnpm install --frozen-lockfile --ignore-scripts` there, and the four failing test files run there
- A `sed -i` command was blocked by the guard hook (nothing written); I used Edit instead. No hook or settings file was edited. A second `git archive 5b5e16e` copy was started and stopped because the first baseline was already correct; it is in the scratchpad only.

No `git add`, `commit`, `push`, `reset`, `stash`, `checkout`, `pull`, `drizzle-kit`, `psql`, `src/migrate.ts` or any other database command. The index was not touched this round.

## Verification (pasted from this round's runs)

### New test file: `tests/department-config-settings.test.ts`

```
✔ PATCH §11 cases: 401, wrong role 403, HOD 200 with other keys and other department untouched, unknown key 400 (10754.9289ms)
✔ PATCH rejects a body departmentId, unknown fields and non-boolean values with 400 (159.0916ms)
✔ GET §11 cases: 401, wrong role 403, HOD 200 returns only the caller's department values (113.2419ms)
✔ a stale expectedValue returns 409 and leaves the stored value unchanged (104.1592ms)
✔ a change through the old whole-object POST makes a PATCH with the previous expectedValue return 409 (70.7253ms)
✔ a successful PATCH writes exactly one audit row, and a no-op PATCH writes none (42.7741ms)
✔ a mirrored test department returns 403 on PATCH and reads its source department's values on GET (93.3371ms)
✔ a missing config row is inserted with exactly { [key]: value } and audited as CREATE (143.479ms)
✔ the service rejects every hod_only key for actor mochi with 403 before any write (43.0879ms)
ℹ tests 9   ℹ pass 9   ℹ fail 0   (exit=0)
```

### §11 four cases on `PATCH /api/admin/department/config/settings/:key` (each request and response)

Setup: department A (HOD `hod0`) starts with `{ procedureExperience: true, hideCaseLogs: false }`; department B (HOD `hod1`) starts with `{ awards: true }`.

1. Unauthenticated → 401
```
{"case":"PATCH unauthenticated","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":true,"expectedValue":null}},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
```
2. Wrong role → 403 (professor, then student). The test also asserts department A's row was unchanged afterwards.
```
{"case":"PATCH professor (wrong role)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":true,"expectedValue":null}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"PATCH student (wrong role)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":true,"expectedValue":null}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
```
3. HOD of department A → 200 (the correct owner). The test asserts department A is now `{ procedureExperience: true, hideCaseLogs: false, academicsFirstInNav: true }` and department B's row is deep-equal to its value before the call.
```
{"case":"PATCH HOD of department A","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":true,"expectedValue":null}},"response":{"status":200,"body":{"key":"academicsFirstInNav","before":null,"after":true,"auditId":"fc45bf56-b7fe-4120-93df-b3acb097e9a0"}}}
```
   Department isolation (strengthened in fix round 1). HOD B writes `false` for the same key that department A holds as `true`, with B's own `expectedValue: null`:
```
{"case":"PATCH HOD of department B, same key, different value","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":false,"expectedValue":null}},"response":{"status":200,"body":{"key":"academicsFirstInNav","before":null,"after":false,"auditId":"eed5329e-dd89-4d0f-a281-e49f46bf0409"}}}
```
   What the test asserts after this call (this replaces the previous, weaker claim that only one key on A was checked): department A's **entire** `enabledFeatures` row is deep-equal to its value captured before HOD B's call (`{ procedureExperience: true, hideCaseLogs: false, academicsFirstInNav: true }`), and department B's row is `{ awards: true, academicsFirstInNav: false }`. The differing value (`false` vs A's `true`) means a write that leaked into A would change A's row and fail the deep-equal.
4. Nonexistent key → 400
```
{"case":"PATCH nonexistent key","request":{"method":"PATCH","path":"/api/admin/department/config/settings/notAKey","body":{"value":true,"expectedValue":null}},"response":{"status":400,"body":{"message":"Unknown setting"}}}
```
   (Nonexistent row: the PATCH route acts on the caller's own department only, so "nonexistent row" is covered by the unknown key above and by the missing config row case further down.)
5. Body `departmentId` and other malformed bodies → 400 (strict)
```
{"case":"body departmentId","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":null,"departmentId":2}},"response":{"status":400,"body":{"message":": Unrecognized key(s) in object: 'departmentId'"}}}
{"case":"unknown field","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":null,"extra":1}},"response":{"status":400,"body":{"message":": Unrecognized key(s) in object: 'extra'"}}}
{"case":"string value","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":"yes","expectedValue":null}},"response":{"status":400,"body":{"message":"value: Expected boolean, received string"}}}
{"case":"missing expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true}},"response":{"status":400,"body":{"message":"expectedValue: Required"}}}
{"case":"numeric expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":1}},"response":{"status":400,"body":{"message":"expectedValue: Expected boolean, received number"}}}
```

### `GET /api/admin/department/config/settings`: 401, 403, 200 and department scoping
```
{"case":"GET unauthenticated","request":{"method":"GET","path":"/api/admin/department/config/settings"},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"GET professor (wrong role)","request":{"method":"GET","path":"/api/admin/department/config/settings"},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"GET student (wrong role)","request":{"method":"GET","path":"/api/admin/department/config/settings"},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"GET HOD of department A (values that differ from B)","request":{"method":"GET","path":"/api/admin/department/config/settings"},"response":{"status":200,"body":[{"key":"academicsFirstInNav","tier":"mochi","valueType":"boolean","value":true},{"key":"procedureExperience","tier":"hod_only","valueType":"boolean","value":true},{"key":"hideCaseLogs","tier":"hod_only","valueType":"boolean","value":false}]}}
```
The 200 line above prints only the non-null rows. The test asserts the list has every allowlisted key in order, `hideCaseLogs` is `false` for A and `null` for B, `awards` is `null` for A and `true` for B, and `keepExistingFlag` is not listed.

### Stale `expectedValue` → 409, value unchanged
```
{"case":"PATCH stale expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/hideCaseLogs","body":{"value":true,"expectedValue":true}},"response":{"status":409,"body":{"message":"This setting changed since you loaded it. Reload and try again."}}}
{"case":"PATCH expectedValue null but a value is stored","request":{"method":"PATCH","path":"/api/admin/department/config/settings/hideCaseLogs","body":{"value":true,"expectedValue":null}},"response":{"status":409,"body":{"message":"This setting changed since you loaded it. Reload and try again."}}}
```
Test asserts the stored `hideCaseLogs` is still `false` after both.

### Old whole-object POST, then a PATCH with the previous `expectedValue` → 409
```
{"case":"old POST /admin/department/config","request":{"method":"POST","path":"/api/admin/department/config","body":{"enabledFeatures":{"hideCaseLogs":false,"academicsFirstInNav":true,"procedureExperience":true,"useCaseTypeLabel":true}}},"response":{"status":200,"body":{"id":1,"departmentId":1,"requiredCases":7,"requiredProcedures":11,"requiredAcademic":3,"enabledFeatures":{"hideCaseLogs":false,"useCaseTypeLabel":true,"academicsFirstInNav":true,"procedureExperience":true},"procedureLogFields":null,"createdAt":"2026-11-24T10:12:37.668Z"}}}
{"case":"PATCH carrying the previous expectedValue (null)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":false,"expectedValue":null}},"response":{"status":409,"body":{"message":"This setting changed since you loaded it. Reload and try again."}}}
{"case":"PATCH with the refreshed expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":false,"expectedValue":true}},"response":{"status":200,"body":{"key":"useCaseTypeLabel","before":true,"after":false,"auditId":"41025df4-cea2-42c6-99ac-307eeac801bb"}}}
```
Test asserts the rejected PATCH wrote no audit row.

### One audit row with the planned shape, and a no-op writes none (strengthened in fix round 1)
The caller is a HOD created late, for a department of its own (department id 4 here). Its `users.id` is 19, above every `students.id`, so a `studentsTable.id` mix-up could not produce 19.
```
{"case":"PATCH for audit check (late-created HOD, own department)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useThesisAndPublicationsLabel","body":{"value":true,"expectedValue":null}},"response":{"status":200,"body":{"key":"useThesisAndPublicationsLabel","before":null,"after":true,"auditId":"d18571cd-34a0-4b1a-9787-c097a2039b82"}}}
{"case":"audit row for the successful PATCH","row":{"id":"d18571cd-34a0-4b1a-9787-c097a2039b82","tableName":"department_configs","recordId":"4","action":"UPDATE","performedById":19,"beforeState":{"key":"useThesisAndPublicationsLabel","value":null,"eventType":"department_setting_change"},"afterState":{"key":"useThesisAndPublicationsLabel","actor":"hod","value":true,"eventType":"department_setting_change"},"timestamp":"<omitted>"}}
{"case":"PATCH no-op (value equals stored value)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useThesisAndPublicationsLabel","body":{"value":true,"expectedValue":true}},"response":{"status":200,"body":{"key":"useThesisAndPublicationsLabel","before":true,"after":true,"auditId":null}}}
```
Test asserts: the audit row count grew by exactly 1; `performedById === lateHod.id` (19), `!== accounts.hod0.id` (1), and is not in the list of `students.id`; the setup guard `lateHod.id > max(students.id)`; and the count is unchanged after the no-op.

### Mirrored test department → 403
```
{"case":"PATCH mirrored test department","request":{"method":"PATCH","path":"/api/admin/department/config/settings/awards","body":{"value":true,"expectedValue":null}},"response":{"status":403,"body":{"message":"Test departments cannot modify mirrored settings"}}}
```
Test asserts the source department's row, the mirror's (non-)row and the audit count are unchanged, and that GET for the mirror HOD reads the source department's values.

### Missing config row → `{ [key]: value }` only, audit `CREATE`
```
{"case":"PATCH missing row with a non-null expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":false}},"response":{"status":409,"body":{"message":"This setting changed since you loaded it. Reload and try again."}}}
{"case":"PATCH missing config row","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":null}},"response":{"status":200,"body":{"key":"useCaseTypeLabel","before":null,"after":true,"auditId":"6e83a3b9-8e69-4d9e-9680-c38797ffd65b"}}}
{"case":"PATCH the same row again","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":false,"expectedValue":true}},"response":{"status":200,"body":{"key":"useCaseTypeLabel","before":true,"after":false,"auditId":"73542d94-9052-494b-9985-4227ac33de77"}}}
```
Test asserts the stored row is deep-equal to `{ useCaseTypeLabel: true }` (no `procedureExperience`), the audit `action` is `CREATE` with the new HOD's `users.id`, and the next PATCH on that row audits as `UPDATE`.

Not tested: the concurrent-insert race (`onConflictDoNothing` returning no row → 409). It is a code path reviewed by reading, not exercised.

### Service with `actor: "mochi"` (tier gate now `!== "mochi"`)
```
{"case":"service actor=mochi on hod_only key freeTextPostingUnit","result":"DepartmentSettingError status 403"}
```
The test loops over all 23 `hod_only` keys (403 each), asserts department 3's stored features and audit count are unchanged, then shows a `mochi`-tier key works for `actor: "mochi"` and records `actor: "mochi"` in `afterState`. A key outside the allowlist (`keepExistingFlag`) returns 400 from the service.

### Typecheck (`pnpm run typecheck`, repo root)
```
$ pnpm run typecheck:libs && pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck
$ tsc --build
Scope: 3 of 8 workspace projects
artifacts/mockup-sandbox typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck$ tsc -p tsconfig.json --noEmit
artifacts/api-server typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck: Done
artifacts/api-server typecheck: Done
artifacts/mockup-sandbox typecheck: Done
exit=0
```
`pnpm exec tsc -p tests/tsconfig.json --noEmit` (55 lines of pre-existing output) has no line mentioning `department-config-settings` or `department-settings`.

### Full suite (`pnpm test`, from `artifacts/api-server`): FAILS, same 18 failures as clean `5b5e16e`
```
ℹ tests 398
ℹ pass 380
ℹ fail 18
exit=1
```
Failing tests by file: **11** in `clinical-works.test.ts`, **4** in `department-template.test.ts`, **2** in `physiology-logbook.test.ts`, **1** in `surgery-procedure-fields.test.ts` (11 + 4 + 2 + 1 = 18). I exported `5b5e16e` to a scratch folder and ran those four files there:
```
ℹ tests 56
ℹ pass 38
ℹ fail 18
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 630443.2937
```
This is the run **after the renumber to 0034** (`full-test-r3.log`, `EXIT 1`). The run before the renumber gave the same counts (407 / 389 / 18, `duration_ms 641600.1306`). Round 1 was 406 / 388 / 18; the +1 is the m3 test. The run exits 1 because of the 18 pre-existing failures below.

### Label-test and migration-test sections, from the `pnpm test` log
This block shows the `✔` result lines only. The `{"case":…}` request/response JSON lines that the label tests print between them are **left out** here (they are in `full-test.log`; the PATCH and DELETE cases that matter for §11 are pasted in the §11 sections below), so this is not a complete copy of the log.
```
▶ PATCH /admin/department/labels/:key (AGENTS.md §11)
  ✔ unauthenticated 401, wrong owner 403, correct HOD 200, nonexistent key 404 (829.4212ms)
  ✔ the written value is what is stored and what the catalog and the wording list return (289.3088ms)
  ✔ a department named in the body is rejected, and one named in the query is ignored; department B is unchanged (112.3445ms)
  ✔ a HOD of department A cannot change department B's rows, whatever they send (74.2743ms)
  ✔ stale revision is 409; empty, 81-character and multi-line values are 400; revision increments (283.3488ms)
  ✔ a value is stored as plain text and returned unchanged (30.3834ms)
✔ PATCH /admin/department/labels/:key (AGENTS.md §11) (9053.635ms)
▶ DELETE /admin/department/labels/:key (AGENTS.md §11)
  ✔ unauthenticated 401, wrong owner 403, correct HOD 200, nonexistent key 404 (161.6399ms)
  ✔ a DELETE aimed at department B (query or body) never touches B's rows (315.2809ms)
  ✔ stale revision is 409; a valid key with no override is 200 with reset false (512.3456ms)
✔ DELETE /admin/department/labels/:key (AGENTS.md §11) (991.0953ms)
▶ reading wording
  ✔ GET lists every registry key with its default, override and revision, for HODs only (263.5394ms)
  ✔ the catalog returns overrides only, following the config source, and never another department's rows (294.7338ms)
✔ reading wording (558.6469ms)
▶ the milestone defaults follow the same effective wording flag the catalog computes
  ✔ flag off: the two milestone labels keep their generic defaults (40.0737ms)
  ✔ flag set in the stored config: value and default are the mandatory-certifications wording (110.6191ms)
  ✔ a department with no stored flag that the catalog treats as mandatory-certifications gets the same defaults (79.8989ms)
✔ the milestone defaults follow the same effective wording flag the catalog computes (231.2455ms)
▶ migration backfill (PGlite, test data only)
  ✔ writes the exact label rows per department, fixes the name, leaves other departments alone, and is idempotent (4496.9923ms)
  ✔ a department's id is not enough on its own: an id that holds some other department gets no rows (4051.4854ms)
  ✔ the same name guard holds for the Dermatology ids 15 and 38 and the Microbiology id 14: a matching id holding a different name gets no rows (12095.9639ms)
  ✔ does not overwrite an override that already exists, and fixes only the first match (3837.0027ms)
✔ migration backfill (PGlite, test data only) (24482.296ms)
...
✔ fresh installation and rerunning migrations are safe and checksum-tracked (5691.6645ms)
✔ legacy migration preserves users, requirements and logs and backfills catalog from actual records (2468.7143ms)
✔ ambiguous legacy memberships and duplicate HODs abort the entire migration without deleting records (2440.5277ms)
```
The `...` is the other test files' output between the label file and `migrations.test.ts`. Within the two files, the `✔` result lines are shown, but the JSON request/response lines (label file) are not (see above). `fresh installation…` applies the migration, now 0034, on PGlite with the bumped count of 32. The section above is pasted from the pre-renumber full run (`full-test.log`); the post-renumber run (`full-test-r3.log`, same folder `C:\Users\aravi\AppData\Local\Temp\claude\e12b43fe9ed35482\253a77c5-3794-4bf1-bce8-eaa8d6ffa4f7\scratchpad\`) lists the same tests with the same results; its migration-backfill section reads:
```
▶ migration backfill (PGlite, test data only)
  ✔ writes the exact label rows per department, fixes the name, leaves other departments alone, and is idempotent (4111.0826ms)
  ✔ a department's id is not enough on its own: an id that holds some other department gets no rows (3192.0642ms)
  ✔ the same name guard holds for the Dermatology ids 15 and 38 and the Microbiology id 14: a matching id holding a different name gets no rows (10096.4652ms)
  ✔ does not overwrite an override that already exists, and fixes only the first match (3458.2842ms)
✔ migration backfill (PGlite, test data only) (20858.6477ms)
✔ fresh installation and rerunning migrations are safe and checksum-tracked (5666.1056ms)
✔ legacy migration preserves users, requirements and logs and backfills catalog from actual records (3425.2464ms)
✔ ambiguous legacy memberships and duplicate HODs abort the entire migration without deleting records (2558.0488ms)
```
The PATCH and DELETE evidence below is from the pre-renumber run; the renumber touches no route code, and the post-renumber log prints the same 10 DELETE request/response lines.

### Failing tests: the same 18 as an unchanged `origin/main` `5b5e16e`, from this run
The 4 files were run in a fresh `git archive` of `5b5e16e` outside the repo, this round: `ℹ tests 56 / pass 38 / fail 18`. Failing-test names (`✖` lines, timing stripped, `sort -u`) from this round's `pnpm test` logs (both the pre-renumber and the post-renumber run) and from this round's baseline log, compared with `diff`: **identical** (re-checked on the post-renumber log, `full-test-r3.log`) (`diff` printed nothing; 19 lines each, which is the 18 names plus the `failing tests:` header line).
```
DELETE clinical-works: 401 / 403 / 200 / 404, and a deleted row cannot be edited
HOD adds sub-types under a category; bad parents, wrong kinds and in-use categories are refused
HOD hard-delete of a student removes their clinical work logs
PATCH changing the category clears a stale sub-type and re-checks it
PATCH clinical-works: 401 / 403 / 200 / 404
POST clinical-works: 401 / 403 / 201 / nonexistent student
a dry run reports the changes and saves nothing
applying merges flags without dropping existing ones and loads the catalog and schedule
applying twice changes nothing more
category and sub-type rules
faculty review: only the named supervisor or the HOD can verify, and verified rows are locked
logbook read: owner and HOD see all entries, a professor sees only entries they supervise
rejected entries can be edited and go back to pending with remarks cleared
review queue lists pending clinical works with category names
the document's 15, 15 and 18 sections are available in the corresponding years
the radiology template matches the requested lists
the supplied SQL creates Surgery, its config and exactly the four requested role codes
validation covers participation, year, date ranges, attendance, appraisal ratings and discussion
```
By file: `clinical-works.test.ts` 11, `department-template.test.ts` 4, `physiology-logbook.test.ts` 2, `surgery-procedure-fields.test.ts` 1. Pre-existing, not touched, reported not fixed (§9).

### Root typecheck
`pnpm run typecheck` at the repo root, exit 0, run after the renumber (`typecheck-r3.log`; the earlier run after the M3 and m3 edits was also exit 0):
```
$ pnpm run typecheck:libs && pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck
$ tsc --build
Scope: 3 of 8 workspace projects
artifacts/api-server typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck$ tsc -p tsconfig.json --noEmit
artifacts/mockup-sandbox typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck: Done
artifacts/api-server typecheck: Done
artifacts/mockup-sandbox typecheck: Done
```

### §11 evidence, `DELETE /admin/department/labels/:key` — each request with its full response (printed by the tests in the round 2 log)
- **401 unauthenticated:** `DELETE /admin/department/labels/nav.postings` body `{}` →
  `{"status":401,"body":{"message":"No token found in cookies or authorization header"}}`
- **403 student:** same request →
  `{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}`
- **403 professor:** same request →
  `{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}`
- **403 HOD of a mirrored department:** same request →
  `{"status":403,"body":{"message":"Test departments cannot modify mirrored settings"}}`
- **404 nonexistent key:** `DELETE /admin/department/labels/nav.nonexistent` body `{}` →
  `{"status":404,"body":{"message":"Unknown wording key"}}`
- **200 correct HOD:** `DELETE /admin/department/labels/nav.postings` body `{}` →
  `{"status":200,"body":{"reset":true,"key":"nav.postings","value":"Postings & Rotations","default":"Postings & Rotations","override":null,"revision":0,"group":"Navigation"}}`
  (the test also asserts the row is gone and that department B's row for the same key deep-equals its snapshot; a rejected call deleted nothing).
- Aimed at department B, query: `DELETE /admin/department/labels/caseLog.caseId?departmentId=2` body `{}` (caller is HOD of department 1, who has no such override; B does) →
  `{"status":200,"body":{"reset":false,"key":"caseLog.caseId","value":"Case ID","default":"Case ID","override":null,"revision":0,"group":"Logbook"}}`; B's rows unchanged.
- Aimed at department B, body: `{"departmentId":2}` →
  `{"status":400,"body":{"message":"value: Unrecognized key(s) in object: 'departmentId'"}}`; `{"department_id":2}` → `{"status":400,"body":{"message":"value: Unrecognized key(s) in object: 'department_id'"}}`; B's rows unchanged.
- Stale revision: `DELETE /admin/department/labels/nav.postings` body `{"revision":4}` →
  `{"status":409,"body":{"message":"This wording changed in another session. Reload before saving."}}`; the row is still present.

### §11 evidence, `PATCH /admin/department/labels/:key` (round 2 log, `full-test.log`)
- The six ownership cases, verbatim from the test log (`full-test.log` lines 355-360; they print before the `▶ PATCH` header line). The test asserts the single row written for the caller's department and that department B and the mirror have no new rows.
```
{"case":"unauthenticated","request":{"method":"PATCH","path":"/admin/department/labels/postings.unitTitle","body":{"value":"Clinical unit"}},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"student","request":{"method":"PATCH","path":"/admin/department/labels/postings.unitTitle","body":{"value":"Clinical unit"}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"professor","request":{"method":"PATCH","path":"/admin/department/labels/postings.unitTitle","body":{"value":"Clinical unit"}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"HOD of a mirrored department","request":{"method":"PATCH","path":"/admin/department/labels/postings.unitTitle","body":{"value":"Clinical unit"}},"response":{"status":403,"body":{"message":"Test departments cannot modify mirrored settings"}}}
{"case":"correct HOD","request":{"method":"PATCH","path":"/admin/department/labels/postings.unitTitle","body":{"value":"Clinical unit"}},"response":{"status":200,"body":{"key":"postings.unitTitle","value":"Clinical unit","default":"Ward / Posting Unit","override":"Clinical unit","revision":1,"group":"Postings"}}}
{"case":"nonexistent key","request":{"method":"PATCH","path":"/admin/department/labels/postings.nonexistent","body":{"value":"Clinical unit"}},"response":{"status":404,"body":{"message":"Unknown wording key"}}}
```
- Written value: `PATCH {"value":"Clinical unit (written)"}` → `200 {"key":"postings.unitTitle","value":"Clinical unit (written)","default":"Ward / Posting Unit","override":"Clinical unit (written)","revision":2,"group":"Postings"}`.
- Another department named, body: `PATCH {"value":"Hijacked via body","departmentId":2}` → `400 {"message":"value: Unrecognized key(s) in object: 'departmentId'"}`; `department_id` → `400`. Query: `PATCH …?departmentId=2 {"value":"Hijacked"}` → `200 … "value":"Hijacked","revision":3` written for the caller's department only; B's rows deep-equal their snapshot.
- Stale revision `{"value":"Stale","revision":8}` → `409 {"message":"This wording changed in another session. Reload before saving."}`.
- Invalid values: `""` and `"   "` → `400 value: Wording cannot be empty`; 81 characters → `400 value: Wording must be at most 80 characters`; `"line one\nline two"` and `"line one\rline two"` → `400 value: Wording must be a single line`.

### Greps (after all edits; unchanged by this round's edits)
```
$ rg -n 'includes\("(radiology|dermatology)"\)' artifacts lib      -> no matches (exit 1)
$ rg -n 'replace\(/microbiology/i' artifacts lib                    -> no matches (exit 1)
$ rg -n 'isRadiology|isDermatology' artifacts lib                   -> no matches (exit 1)
```
The remaining `microbiology` matches and their 2b tags are as listed in round 1 (this round touched none of those lines); not re-listed.

### Looks identical: demo-mode text comparison, `origin/main` before vs this worktree after

#### Printable logbook (C1) — redone this round
What was wrong before: the previous captures called the page "ready" when it had more than 100 characters of text, so the `/print` route was captured while it showed (or before it replaced) the Postings page. All 16 old `*__printable.txt` captures equalled the matching `*__postings.txt`. **The previous claim that the printable views were compared and identical was false and is withdrawn.** The old rounds' printable results (previous HANDOFF lines 174 and 177, "all six areas … byte-identical" and "printable layout was compared at desktop width … at mobile that view reads the page it lands on") are replaced by this section.

Method (this round):
- Before = unchanged `git archive` of `origin/main` `5b5e16e`, extracted outside the repo, Vite on port 5191. After = this worktree, Vite on port 5192. Headless Chromium via Playwright, `reducedMotion: reduce`, `window.print` stubbed before page scripts (the page calls `window.print()` and then navigates away on `afterprint`; that is why the earlier mobile run saw `/print` redirect to `/`; with print stubbed, `/print` stays put at 375px, so **mobile was reached this time**).
- 4 demo departments (Pediatrics id 1, Radiology 2, Dermatology 15, Microbiology 18) × 2 widths (desktop 1280×900, mobile 375×812) × 3 captures = 24 views, each captured before and after (48 capture files):
  - `postings`: demo session, student `/postings` (the page the old captures actually held).
  - `printabledemo`: demo session, student `/print`.
  - `printable`: a **non-demo** session (user object with `isDemoMode:false`) whose API calls are answered by the demo data through Playwright route interception. Needed because `PrintableLogbook.tsx` sets `hideUhid = isDemoMode()` (line 175) and renders the "Case ID" header only when it is false (lines 435, 465), so the Case ID header **cannot appear in a pure demo-mode capture**.
- The capture text is the page `innerText` plus the DOM text of every `<th>` and every `data-label` attribute (at 375px the table headers become per-cell labels, which `innerText` can miss).
- A capture counts as ready only when the text was unchanged over 4 consecutive reads AND the printable-only markers were present: a postings-table column header (`Ward / Unit` or `Posting`), a case-log/clinical-work header (`Age / Gender` or `Age / Sex`), and, for the non-demo `printable` capture, a Case ID header (`Case ID`, or `Case No.` for Radiology). No capture finished without its markers (`not-ready=0`). Markers found, per department:
  - Pediatrics, Dermatology, Microbiology: `Ward / Unit`, `Age / Gender`, `Case ID` (twice: case-log and procedure tables), at both widths.
  - Radiology: `Posting`, `Age / Sex`, `Case No.`. **Radiology has no "Case ID" header on the printable page**: its case-log section is the clinical-work table, which uses the literal header `Case No.` (not label-driven, `PrintableLogbook.tsx:500`), and its procedure table is not shown. So `caseLog.caseId` is not exercised for Radiology; this was true before and after.
  - Dermatology prints `Ward / Unit` (default) and Radiology prints `Posting`, as the backfill intends; the departments really differ, so the captures are not generic copies.
- Proof that each printable capture is not a Postings capture, by sha256 (first 12 hex): **32 of 32** printable-vs-postings pairs differ (`printabledemo` and `printable` × before/after × 2 widths × 4 departments). The comparison script prints a `!!` line for any equal pair; none printed.

Result (`compare-printable2.cjs`, first two lines of output):
```
views=24 byte-identical=8 timestamp-only(Generated on ... at hh:mm)=16 WORDING-DIFF/FAIL=0
printable-vs-postings hash pairs that differ: 32 of 32 (2 printable kinds x 2 sides x 2 widths x 4 depts)
```
- **0 wording differences.** 8 views are byte-identical (the 8 `postings` views). 16 views (all `printabledemo` and `printable`) differ in exactly one line: `Generated on 23 November 2026 at 09:0x pm`. That line is the wall-clock time of the capture (before and after were captured minutes apart). The script checks that the differing lines are only those `Generated on …` lines and that the line count is equal, then normalises the clock time only (`at hh:mm am/pm` → `<TIME>`); after that all 24 views have equal hashes. This is a clock reading, not wording. It is a difference of the exact kind the rule forbids if read literally, so it is **reported here for the reviewer**, not explained away; it cannot be made byte-identical by capturing at different minutes.
- Hash table, after the clock normalisation (before = after in every row; first 12 hex of sha256; chars = capture length):
```
desktop pediatrics   postings      4faea242d84f SAME chars=762
desktop pediatrics   printabledemo dd225cdacf61 SAME chars=16812
desktop pediatrics   printable     3dca9dd36f60 SAME chars=16940
desktop radiology    postings      cd0d6f313d2b SAME chars=1272
desktop radiology    printabledemo 92e7bae9e799 SAME chars=11545
desktop radiology    printable     c6d3f270165f SAME chars=11274
desktop dermatology  postings      106a74b6c9be SAME chars=575
desktop dermatology  printabledemo 5fd6a38a1355 SAME chars=8769
desktop dermatology  printable     93b2c96e897c SAME chars=8657
desktop microbiology postings      1eb99bcd3ff4 SAME chars=685
desktop microbiology printabledemo 513664b1f3b9 SAME chars=10273
desktop microbiology printable     23aec3d9ce5d SAME chars=10161
mobile  pediatrics   postings      078de9c5399c SAME chars=673
mobile  pediatrics   printabledemo f6710217b107 SAME chars=16544
mobile  pediatrics   printable     0219347b15ad SAME chars=16665
mobile  radiology    postings      6c734cc1aa30 SAME chars=1195
mobile  radiology    printabledemo 3d073657b1b5 SAME chars=11223
mobile  radiology    printable     90b9c39bdcfb SAME chars=10952
mobile  dermatology  postings      236d490de7e8 SAME chars=518
mobile  dermatology  printabledemo 9deab4b1486a SAME chars=8539
mobile  dermatology  printable     526f3187c2aa SAME chars=8420
mobile  microbiology postings      10645d9574e5 SAME chars=603
mobile  microbiology printabledemo 4691c89f6aea SAME chars=10005
mobile  microbiology printable     3df87dd8bc9d SAME chars=9886
```
(The Postings hash of each department is a different value from its printable hashes in every row.)

#### Other areas (round 1, not re-run this round)
Round 1 compared six areas for 4 departments × 2 widths; the postings, milestones, sidebar, header and settings captures are from that run. This round I checked that none of those captures is a copy of another page: for every department/width/side the milestones, sidebar, header and settings captures have hashes distinct from each other and from the Postings capture (only the printable one equalled Postings). Round 1 result for them: byte-identical for postings, milestones, sidebar and header; the settings list differs only by the new "Wording" entry (below). I did not re-capture them with new markers this round (not asked); their original readiness check was the weak one (text over 100 characters), so for those areas the distinct-hash check is the evidence, not the markers.

#### Settings section list ("Wording" entry; the "drop one blank line" note)
- The 8 settings views (4 departments × 2 widths) differ from before only by the new "Wording" entry: desktop adds the lines `Wording` and `9` (9 = registry keys), mobile adds `Wording`. Per the developer decision recorded in `CURRENT_TASK.md` (2026-11-23), the "Wording" entry is this task's own feature and is excluded from the "any difference is a failure" rule. It is reported, not hidden.
- **"The settings views drop one blank line": I could not reproduce it, and I am not claiming it.** The round-1 capture script collapsed blank lines (`\n\s*\n+` → `\n`), so it could not show a blank-line change either way. This round I re-captured the 8 settings views (HOD `/requirements`, demo mode) with raw `innerText`, blank lines kept, before and after, and diffed them with `cat -A`:
```
== desktop pediatrics:  before lines 164, blank 51; after lines 166, blank 51    154a155,156 > Wording$ > 9$
== desktop radiology:   before lines 187, blank 49; after lines 189, blank 49    144a145,146 > Wording$ > 9$
== desktop dermatology: before lines 161, blank 51; after lines 163, blank 51    156a157,158 > Wording$ > 9$
== desktop microbiology: before lines 160, blank 51; after lines 162, blank 51   155a156,157 > Wording$ > 9$
== mobile pediatrics:   before lines 100, blank 25; after lines 101, blank 25    90a91   > Wording$
== mobile radiology:    before lines 126, blank 23; after lines 127, blank 23    83a84   > Wording$
== mobile dermatology:  before lines 95,  blank 25; after lines 96,  blank 25    90a91   > Wording$
== mobile microbiology: before lines 95,  blank 25; after lines 96,  blank 25    90a91   > Wording$
```
  Blank-line counts are equal before and after in all 8 views, and the only diff lines are the added `Wording` (and `9`) lines. I also checked the source diff of `DepartmentSettings.tsx` for a removed blank line: none (the removals are the `isRadiology` line, its two uses and the `import` line). If the reviewer saw a dropped blank line somewhere, please point to the file or capture; I could not find it, and I am not recording it as fixed or explained. Hand-written note for the record, as asked: I looked for it in the rendered settings text and in the source diff.

#### Coverage limits
- Real (non-demo) data, which depends on the migration being applied, is not covered.
- The Case ID header is covered for Pediatrics, Dermatology and Microbiology only; Radiology has no such header (above).
- The non-demo `printable` capture uses the demo data served through route interception, not a real backend.
- HOD or Faculty pages other than the settings page are not covered.

### HOD rename round trip
API test evidence (`PATCH` writes the value, `200`, revision increments; the catalog and the wording list return it; `DELETE` returns the default with `override:null`; a stale revision is `409`). In a browser, this round: the Wording screen's save and the failed-refresh behaviour (M3 scenarios A and B above, against a mocked label route). The per-row Reset and the failed-save message of the Wording screen have still never run against a real backend.

## Skipped / not done
- Nothing outstanding on the old `0033_department_label_overrides.sql`: it has been deleted (see the renumber section).
- No saved screenshots (text comparison is the developer's chosen method, recorded).
- The Wording screen was not exercised against a live backend.
- Review (`code-review`) was done by separate sessions (four high-assurance reviews; the last one, 2026-11-24, found code, tests and evidence clean with documentation wording left). Commit and PR are in "Close-out" below.

## Expanded beyond the Build list
Nothing intentionally. Judgement calls to check in review:
- M3 changes `refresh`'s return type in `department-context.tsx` (`Promise<void>` → `Promise<boolean>`). It is the smallest fix that stays inside the two named files, because `refresh()` swallows its own error. The other `refresh()` callers are unchanged.
- The refresh-failed banner is held in the Wording section (not the row) because a saved row remounts.
- Round-1 judgement calls still stand: `department-context.tsx` also re-exports `resolveDepartmentLabel`; `routes/department-labels.ts` imports `getDepartmentFeatures` from `lib/department-features.ts` (a "do not touch" file, imported not edited); description lookup by route for `/postings` and `/milestones`; the Wording section is an inline component; registry description wording and group names are mine, defaults are verbatim.

## Noticed, not asked about
- **Migration numbering:** 0032 and 0033 belong to the Mochi adoption task, now merged to `main` (`41c2131`, PR #164); this task's file is numbered 0034. Close-out resolves the `migrations.ts`, `migrations.test.ts` (count 34) and `Dashboard.tsx:34` (`label` destructure) merge conflicts.
- **Two real Dermatology departments** (ids 15 and 38, both code `DERM`, neither a test copy). Both get backfill rows. Presumably in different colleges; I could not check.
- Radiology's printable page uses the literal header `Case No.` for its clinical-work table, so it does not follow `caseLog.caseId`. Not in scope; a possible follow-up.
- Frontend `isMicrobiology` / `isMicro` checks test `code === "microbiology"` or the name. The real code is `MIC`, so only the name branch fires. These are 2b items.
- `MobileBottomNav.tsx:14-20` maps the title "Postings & Rotations" to the short label "Postings". A renamed `nav.postings` falls back to the full renamed title there. Default wording is unchanged. Not in scope.
- The DELETE `400` message for an unrecognised body field reads `value: Unrecognized key(s) in object: ...` (the schema-path prefix is "value" by fallback). Cosmetic.
- The other `department.refresh()` callers (`DepartmentSettings.tsx:255, 275`, `LogbookSectionSettings.tsx:83`, `ProcedureFieldRequirements.tsx:631, 810`; `DemoDepartmentCustomizer.tsx:103, 110` ignore the result with `void`) have the same "refresh never throws" blind spot: the ones that await it show success after a failed refresh. `LogbookSectionSettings.tsx:83` even has a `catch` that cannot fire. Not changed (outside this finding, §9).

## Noticed, not fixed
- 18 pre-existing failing tests on `origin/main` (above).
- `tsc -p tests/tsconfig.json` reports type errors in several existing test files and `src/migrate.ts` (not in `department-labels.test.ts`); not re-run this round.
- `AGENTS.md` still describes "Claude Chat" routing in places; not edited.

## Close-out (2026-11-24, `close-task`)
Developer decision: accepted the final high-assurance review with "Fix in close-out"; formal verdict "accept with fixes", documentation wording only. Code, tests and evidence were verified by the reviewer. This project has no `docs/STATUS.md` and no `MASTER_PLAN.md` (§14.7), so this section is the record.
- Branch: `task/department-label-overrides`
- PR: [#167](https://github.com/Gotham28/Electronic-LogBook/pull/167)
- Commits: `aa6ff66` (the 2a work and documentation fixes), `8e0608e` (merge of `origin/main` `41c2131`, Mochi PR #164), `31fdb20` (merge of `origin/main` `6a03354`, task 3a PR #165), plus one `docs: record PR number and commit hashes` commit for this edit.
- Conflicts resolved in the merges: `lib/db/src/migrations.ts` (0032, 0033, then 0034), `tests/migrations.test.ts` (count 34, Mochi's assertions kept), `routes/index.ts` (both mounts kept), `CURRENT_TASK.md` and `HANDOFF.md` (the 2a versions). `Dashboard.tsx` and `lib/api-zod/src/index.ts` merged cleanly.
- Verification on the merged tree (`DATABASE_URL` unset via `env -u`, PGlite only, no database connection): `pnpm run typecheck` exit 0; `pnpm exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/department-labels.test.ts tests/migrations.test.ts tests/department-config-settings.test.ts` gave tests 30, pass 30, fail 0; `pnpm test` gave tests 431, pass 413, fail 18, with the same 18 failing names as listed above (identical to the earlier merged run of 422 / 404 / 18, taken before 3a was merged).
- Release condition: apply migrations with `src/migrate.ts` before deploying (0034, and Mochi's 0032 and 0033 if production lacks them), or the catalog returns 500.
- Not committed: `artifacts/mockup-sandbox/src/.generated/mockup-components.ts` (line endings only, regenerated by the dev server) and `.agents/runs/2026-11-23-department-label-overrides.md` (git-ignored).
- Not merged by the closer. The developer merges.
