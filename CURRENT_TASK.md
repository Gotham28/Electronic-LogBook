# Current Task

## Feature
Make the Mochi assistant (backend module still named `arogya`) visible and used: amend the
one-feature rule, then ship usage measurement, in-workflow nudges for all three roles, and
discoverability hooks — as one bundled task with separately committed, separately verified parts.

## Plan reference
Unplanned (AGENTS.md §14.7 — no MASTER_PLAN.md). Why: developer decided on 2026-11-22 that AI
adoption is the product's competitive edge and current assistant usage is low.
Planning snapshot: `origin/main` at `75c5d6f` (PR #160, Mochi rebrand). Task branch:
`task/mochi-ai-adoption`.
STATUS.md state at time of scoping: no `docs/STATUS.md` exists in the repo.

## MASTER_PLAN.md update
- [ ] None — repo has no MASTER_PLAN.md (AGENTS.md §14.7); unplanned work recorded here.

## Developer decisions recorded (2026-11-22, planning session)
- Do all parts in one task; change the one-feature-per-task rule (developer's words: "do all,
  also change the 1 feature per task rule too").
- Usage store: new DB table (schema change — drafted migration, developer applies).
- Added AI spend ceiling: under ₹500/month total OpenAI cost.
- Patient-text → structured case log (idea 4): PARKED. Not started with college/provider.
  Nothing in this task may send patient text to OpenAI.

## Files/areas in scope
Part 0 — rule change
- `AGENTS.md` §9 — replace text with the wording in `## Agent` Part 0; update the §14.5 halt
  bullet "The task turning out to be more than one feature (§9)" to match.

Part 1 — usage measurement
- `lib/db/src/schema/` — new `assistant_usage_events.ts` + export from `index.ts`.
- `lib/db/migrations/0032_assistant_usage_events.sql` — new, drafted only (0029–0031 are taken).
- `lib/db/src/migrations.ts` — append the new file to the ordered `files` list.
- `artifacts/api-server/src/routes/arogya.ts` — record an event per call (augment the existing
  `console.log` usage lines); new `POST /api/arogya/usage` for client-side
  `panel_open` / `quick_action_click` / `nudge_click` events.
- `artifacts/api-server/src/routes/` — read endpoint for usage counts: platform admin sees all;
  HOD sees own department only. Departments now belong to colleges (migration 0030) — any
  college-scoped admin must be limited to its college; fail closed if scope is missing (§3).
- `artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx` — fire `panel_open`.

Part 2 — in-workflow nudges (rule-based first; AI only where noted)
- Resident: `artifacts/mockup-sandbox/src/components/Dashboard.tsx` — "behind target" card,
  computed deterministically from existing progress facts (`buildProgressFacts` in
  `artifacts/api-server/src/lib/arogya.ts`) against `department_configs` / `procedure_types`
  targets through `artifacts/api-server/src/routes/arogya.ts`. No OpenAI call.
- Professor: `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx` review queue —
  deterministic per-log flags from `artifacts/api-server/src/routes/professor.ts` (required
  fields empty, dates out of assigned verified postings, duplicate UHID+date among assigned
  pending logs of the same resident and log type). New metadata contains only flag codes.
- HOD: `artifacts/mockup-sandbox/src/components/HODPortal.tsx` — "This week" digest card,
  generated lazily on first HOD view per department per ISO week via the existing
  `department-report` path. Backend: `artifacts/api-server/src/routes/arogya.ts` and
  `artifacts/api-server/src/lib/arogya/weekly-digest.ts`, using the existing model timeout in
  `artifacts/api-server/src/lib/arogya.ts`. Cache: approved `lib/db/migrations/0033_assistant_department_weekly_digests.sql`,
  matching `lib/db/src/schema/assistant_department_weekly_digests.ts`, schema export, and
  migration registry. Aggregate counts only.

Part 3 — discoverability
- Error states on pages already calling `publishArogyaContext` (CaseLogsPage, ProcedureLogsPage,
  AcademicLogsPage, ClinicalWorksPage, ConferencesPage, QuarterlyAppraisalSection,
  ProfessorPortal) — "Ask Mochi about this" button calling `openArogya`.
- `artifacts/mockup-sandbox/src/components/arogya/AssistantAnswer.tsx` — "Based on your N logs"
  / "Based on department data" grounding label, N taken from the facts pack the server already
  builds. Return optional metadata from `artifacts/api-server/src/lib/arogya/provider.ts` and
  declare it in `artifacts/mockup-sandbox/src/lib/apiClient.ts`. No new query.
- User-facing name is **Mochi** everywhere (see `arogya/assistantCopy.ts`); do not reintroduce
  "Arogya" in UI copy. Internal identifiers stay `arogya`.

Tests
- `artifacts/api-server/tests/` — tests for each new route/branch (PGlite migration test must
  pass with 0032).

## Explicitly out of scope
- Idea 4: AI turning patient notes into case logs — parked, blocked on developer/college.
- Any AI-generated summary of an individual case/procedure log — sends patient text to OpenAI;
  same blocker as idea 4.
- Email or push delivery of the HOD digest — Render free tier has no reliable scheduler and
  would need a new secret; in-app card only.
- Raising `DAILY_LIMIT` or `max_tokens`.
- Renaming internal `arogya` identifiers/routes to `mochi`.
- Live demo / champion programme at Pediatrics — developer's own action (Manual).

## Do NOT touch
- `artifacts/api-server/src/lib/arogya/input-privacy.ts` blocking behaviour.
- Existing auth/ownership checks on any clinical route (§3, §4) — read-only reuse only.
- `SupportWidget.tsx` and support-ticket code.
- `.env`, `.env.example` values.
- Existing migrations 0001–0031.
- Hook files under `~/.claude/hooks/`.

## Execution route
- B — Agent loop.
- Why: route-C test fails on point 2 (Opus-tier triggers: schema change, clinical-table reads)
  and point 3 (migration).
- Close-out: route B — never route C; plain push + PR permitted, force-push forbidden.

## Manual (developer does)
- [ ] Review and apply migration `0032_assistant_usage_events.sql` yourself (no agent DB access, §6).
- [ ] Apply approved migration `0033_assistant_department_weekly_digests.sql` at rollout (§6).
- [ ] Confirm the HOD digest's actual OpenAI cost after one week against the ₹500 ceiling.
- [ ] Run a 15-minute Mochi demo at a Pediatrics department meeting; pick 1–2 professor champions.
- [ ] Idea 4 groundwork (parked): ask the college what approval is needed to send de-identified
      clinical text to an AI provider, and ask OpenAI for its data processing terms.
- [ ] Decide what to do with local `main`: it holds 2 unpushed commits (`a6eacd7` "docs: approve
      Cloudflare feasibility prototype", and merge `c0dad8f`) and has diverged from origin.

## Agent (does on its own, once scope is confirmed)
- [x] Part 0 — replace AGENTS.md §9 body with:
      "A task may bundle related features when the developer approves it at scoping. Each
      feature is a numbered Part in CURRENT_TASK.md with its own files, its own commit, and its
      own verification evidence; the review report covers each Part separately. Work not listed
      as a Part is still flagged, not done. Do not silently restructure, rename, reformat, tidy
      or improve code outside the listed Parts." Update §14.5 halt bullet to "Work appearing
      that is not a listed Part (§9)." Separate commit.
- [x] Part 1 — table + drafted migration + migrations.ts entry + event recording + usage read
      endpoint + tests. Event row: id, userId (usersTable.id), role, departmentId, feature, event
      type, httpStatus, tokenCount, createdAt. **No question text, no answer text.** Separate commit.
- [x] Part 2 — resident card, professor flags, HOD weekly card + tests. Separate commit per role.
- [x] Part 3 — error-state buttons + grounding label + tests. Separate commit.

## Blocked on developer input
- [x] Render showed `OPENAI_MODEL=gpt-4o-mini` for `elogbook-api` on 2026-11-23. Use that
      model's published token prices to check the ₹500 ceiling before the Part 2 HOD card ships.
- [x] Developer approved `lib/db/migrations/0032_assistant_usage_events.sql` and its matching
      Drizzle schema in chat on 2026-11-23. User and department references use
      `ON DELETE SET NULL` so aggregate history survives deletion. Resume Part 1.
- [x] Developer approved the remaining Part 1 changes under AGENTS.md §14.5 in chat.
      Add metadata-only usage recording to existing Mochi routes. Reuse their authorization
      checks. Expose aggregate counts across departments to platform admins and only the
      assigned department to each HOD. A college-scoped role requires an authoritative college
      assignment, with missing scope denied.
- [x] Developer authorized proceeding with the Part 3 grounding metadata and Part 2
      clinical-record reads under AGENTS.md §14.5. Grounding uses already-authorized facts.
      Resident tips use the resident's own progress and configured targets. Professor flags
      are for assigned logs. The HOD digest uses aggregate counts from the HOD's department.
- [x] Developer approved the dedicated HOD digest cache described below. Part 1 usage tracking
      continues to store metadata only.
- [x] Developer approved the review fixes on 2026-11-24. Complete the professor flags, HOD
      week rollover, and digest recommendation within Part 2. Keep the review tier unchanged.
- [x] Developer approved handling the 18 matching baseline failures separately. Track those
      failures as a follow-up and verify the fix round introduces no additional failures.

## Release verification pending
- Confirm the total OpenAI cost before release using the eligible live department count,
  including eligible test mirrors, and the project's other OpenAI spend. This check can follow
  the fix round. No billing data was accessed during implementation.

## HOD weekly digest cache proposal
- Proposed table `assistant_department_weekly_digests`, migration `0033` if still available.
  Use a composite primary key of `department_id` (department foreign key with cascade)
  and `week_start` (date for ISO Monday in Asia/Kolkata).
- Store `status` (`pending`, `ready`, or `failed`), `attempted_at`, optional `generated_at`,
  and optional completed `summary` based on department aggregate counts. Keep this separate
  from request telemetry. The vendor input uses the aggregate department data only.
- Claim the department and week before generation with an atomic insert that ignores a
  duplicate key. The winning request may make one model call. A concurrent or later request
  reads the existing claim or cached summary. An interrupted or failed attempt surfaces an
  unavailable state for the week so a restart cannot charge for a second generation.
- Verify the ₹500 total monthly OpenAI ceiling before release. The digest-only upper bound is
  six ISO weeks in a month × eligible departments × the per-request input/output token
  cost in INR. A projected total also needs the rest of the project's OpenAI spend.

## Execution checkpoint (2026-11-23)
- Base: `origin/main` at `5b5e16e`. Active branch: `task/mochi-ai-adoption` at `a4b8067`.
- Part 0: Antigravity job `27d71d04438d46f0aa4a711cb2a75e20` applied the two approved rule
  edits. The bridge omitted its structured report. Read back `AGENTS.md` and verified the
  §9 body and §14.5 halt bullet against the approved text. The separate commit is pending review.
- Part 1: 0032 drafted, registered after 0031, and matched in the Drizzle schema. The PGlite
  migration test checks the exact column list and records 32 migrations after a rerun.
- Targeted verification: `pnpm --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json
  --test --test-concurrency=1 tests/migrations.test.ts` reported `tests 3`, `pass 3`, `fail 0`.
- Type verification: `pnpm run typecheck:libs` rebuilt stale local declarations and exited 0.
  `pnpm --dir artifacts/api-server run typecheck` then exited 0.
- `pnpm --dir artifacts/api-server test` with loopback access reported `tests 389`,
  `pass 371`, `fail 18`. Running the four affected test files on clean `5b5e16e` reported
  `tests 56`, `pass 38`, `fail 18`, with the same 18 failing test names. The files are
  `clinical-works.test.ts`, `department-template.test.ts`, `physiology-logbook.test.ts`,
  and `surgery-procedure-fields.test.ts`.
- Part 1 write path: `POST /api/arogya/usage` accepts `panel_open`, `quick_action_click`, and
  `nudge_click`. It derives the actor and department from the authenticated request and rejects
  extra fields. Antigravity job `0f7e658374394e768a46e219db75993a` wired `panel_open` to the
  visible panel's open transition outside demo mode. Read back that patch.
- Targeted verification with loopback access: `pnpm --dir artifacts/api-server exec tsx
  --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/arogya-usage.test.ts
  tests/migrations.test.ts` reported `tests 7`, `pass 7`, `fail 0`.
  `pnpm --dir artifacts/api-server run typecheck` and
  `pnpm --dir artifacts/mockup-sandbox run typecheck` both exited 0.
- Part 1 after approval: the existing Mochi routes record metadata for completed responses.
  `GET /api/arogya/usage` returns grouped counts. HOD scope comes from the account's assigned
  department. Admin accounts with an assigned department derive their college from that
  department. The platform admin role without a department assignment can see all counts.
- `pnpm --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test
  --test-concurrency=1 tests/arogya-usage.test.ts tests/migrations.test.ts
  tests/arogya-ask.test.ts tests/arogya-progress.test.ts tests/arogya-department-report.test.ts`
  reported `tests 20`, `pass 20`, `fail 0`. The read tests recorded the four required cases
  below using PGlite fixtures:
  - `GET /api/arogya/usage` (unauthenticated) -> `401 {"message":"No token found in cookies or authorization header"}`
  - `GET /api/arogya/usage?departmentId=3` (HOD of another department) -> `403 {"error":"You cannot view Mochi usage for this department."}`
  - `GET /api/arogya/usage` (HOD of own department) -> `200 {"departmentId":1,"counts":[{"feature":"mochi","eventType":"panel_open","count":1}]}`
  - `GET /api/arogya/usage?departmentId=2147483647` (platform admin, nonexistent department) -> `404 {"error":"Department not found."}`
- `pnpm --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test
  --test-concurrency=1 tests/arogya-evidence.test.ts tests/arogya-department-diagnostics.test.ts`
  reported `tests 6`, `pass 6`, `fail 0`. API and frontend `run typecheck` both exited 0.
- Part 3 error actions: Antigravity job `91788e51eef642379acd935a73beb09a` added the scoped
  buttons in seven files. Verified the case-log error opened Mochi on click at 1365×900 and
  after Tab and Enter at 390×844 with a mocked API. Screenshots: `tmp/mochi-error-action-desktop.png`
  and `tmp/mochi-error-action-mobile.png`. Test-only Vite server stopped after verification.
- Existing Cases page behavior observed during the browser test: the error panel is visible
  and the underlying page still says `0 cases logged` after a failed fetch. The error-button
  subtask preserves that existing rendering.
- Grounding and resident/professor work after approval: Mochi V2 includes optional grounding
  from its existing authorized facts. The resident progress-gaps endpoint provides only
  progress counts and configured targets. Professor review flags use the existing authorized
  pending queue and assigned verified postings. The flag metadata contains only codes.
- `pnpm --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test
  --test-concurrency=1 tests/arogya-adoption.test.ts tests/arogya-department-diagnostics.test.ts
  tests/case-review-details.test.ts tests/enumeration-collapse.test.ts` reported `tests 10`,
  `pass 10`, `fail 0`. New resident endpoint evidence with synthetic fixtures:
  - `GET /api/arogya/progress-gaps` (unauthenticated) -> `401 {"message":"No token found in cookies or authorization header"}`
  - Same request (professor) -> `403 {"message":"Forbidden: Insufficient role permissions"}`
  - Same request (resident with own profile) -> `200 {"gaps":[{"label":"Cases","verified":0,"target":7},{"label":"Procedures","verified":0,"target":11},{"label":"Test group 0: Test procedure 0","verified":0,"target":2},{"label":"Test training: Fixture procedure","verified":0,"target":2},{"label":"Academic activities","verified":0,"target":3}]}`
  - Same request (resident account without profile) -> `404 {"error":"Resident profile not found."}`
- The existing professor queue still passes SEC-35. An unauthenticated request returns `401`,
  an authorized HOD viewing their faculty queue gets `200`, and a different-department or
  nonexistent faculty ID returns the same `403` by the route's existing anti-enumeration contract.
- Antigravity jobs `5c7bd0be832d4814aedb00454929ebf9` and `97b5481cc21a4fcda1e4b5740fcbbf0a`
  added the answer label and professor flag displays. The flag filter was tightened after the
  first typecheck. The final `pnpm --dir artifacts/api-server run typecheck` and
  `pnpm --dir artifacts/mockup-sandbox run typecheck` both exited 0.
- Local mocked browser checks on the resident dashboard verified configured counts, keyboard
  activation of the Mochi nudge, the singular grounding label, and a visible mobile fetch error.
  The professor queue showed the three recognized flags, omitted unknown codes, and opened Mochi
  with a metadata-only nudge event. Screenshots in `tmp/`: `mochi-resident-targets-desktop.png`,
  `mochi-resident-targets-error-mobile.png`, and `mochi-professor-review-flags.png`.

## HOD digest verification (2026-11-24)
- Drafted migration `0033_assistant_department_weekly_digests.sql` with a unique claim per
  department and Asia/Kolkata ISO week. The vendor gets four department counts. The cache
  stores a count-based summary with one of two server-defined next steps.
- `pnpm run typecheck:libs` and `pnpm --dir artifacts/api-server run typecheck` exited 0.
- `pnpm --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test
  --test-concurrency=1 tests/arogya-weekly-digest.test.ts tests/migrations.test.ts` reported
  `tests 8`, `pass 8`, `fail 0`. The tests confirm one provider call for concurrent requests,
  cache reuse, week boundaries, and no repeat generation after a failed or stale claim.
- Estimated digest spend with deployed `gpt-4o-mini`: six weeks × (1,000 input tokens ×
  $0.15/million + 400 output tokens × $0.60/million) × ₹92.7968 per USD ≈ ₹0.22 per
  eligible department in a six-week month, before taxes. The measured message text plus
  roles occupies 813 UTF-8 bytes at maximum safe-integer counts. The estimate allows
  1,000 input tokens including message framing. Model prices from the OpenAI model page.
  Exchange rate from RBI's 23 November 2026 FBIL reference.
- The ₹500 monthly release check includes all OpenAI use. We still need the eligible
  production department count and the rest of the project's monthly OpenAI spend.
- Antigravity wrote the card before timing out. Direct execution corrected a nullable
  department ID and tightened response validation. Frontend typecheck exited 0 after the fix.
- A synthetic browser run checked 202 pending, 200 ready, 503 error, and retry recovery.
  Desktop keyboard activation and the mobile error state passed. Screenshots are in `tmp/`.
- The final API suite reported `tests 402`, `pass 384`, `fail 18`. Comparing the unique
  failed test names with clean `5b5e16e` returned zero differences. See `HANDOFF.md`.

## Order
### Steps inside this task
1. Work on branch `task/mochi-ai-adoption` (already pushed with this file). Pull it first.
2. Part 0 (rule change).
3. Part 1 (measurement) — HALT after drafting migration; developer reviews schema.
4. Part 3 (discoverability).
5. Part 2 (nudges) — HALT before any change touching clinical-table queries; HALT before the HOD
   card if `OPENAI_MODEL` is still unknown.
6. `code-review`, then `close-task`.

## Fix-round checkpoint (2026-11-24)
- The approved fixes cover professor record flags, HOD rollover, and the digest recommendation.
  Professor tests include legacy and free-text procedures, configured academic and Clinical
  Work details, conference participation, and a foreign verified procedure for resident isolation.
- The HOD digest refreshes when visible, derives the current week on route reentry, and
  cancels superseded requests. The API client's session guard is limited to cancellation-aware
  requests. Only the HOD digest uses that option in this app.
- Antigravity dispatch 07 made the mechanical copy change. Both typechecks exited 0 and the
  final focused API run reported 19 tests, 19 passing, zero failing. See HANDOFF.md.
- The final full API suite reported 404 tests, 386 passing, 18 failing. The failing names
  matched clean 5b5e16e exactly. Independent re-review verdict is accept. See HANDOFF.md.
- Developer accepted the final re-review and approved committing and opening the PR
  on 2026-11-24. Release budget and manual migrations remain open. Luna follows adoption.

### Where this task sits
- Before this: nothing.
- After this:
  - Separate `gpt-6-luna` migration for `elogbook-api`. Change both Chat Completions request
    builders (`artifacts/api-server/src/lib/arogya.ts` and `lib/arogya/provider.ts` under
    `artifacts/api-server/src/`). Use `max_completion_tokens` at the existing 400/800 limits.
    Use `reasoning_effort: "none"` for Luna tool calls. Verify regular answers, structured JSON,
    tool calls, and failure behavior with synthetic requests in the approved OpenAI test project.
    Record cost and latency before changing the Render setting. The current deploy target is
    `gpt-4o-mini`, and the separate execution plan should include a rollback check.
  - Re-check usage numbers after 2–4 weeks of pilot use.
  - Revisit idea 4 once college approval exists.
  - Address the 18 matching baseline failures separately.
  - The existing Clinical Work creation error handler logs the raw database error and cause.
    Review the handler separately under §8.
  - Duplicate procedure catalog group/name pairs have no authoritative tie-break. Resolve
    that configuration behavior separately before expecting deterministic flags for duplicates.

## Verification required before this is considered done
- [ ] `pnpm test` in `artifacts/api-server` — paste results and compare failing test names to
      clean base. Verify 0032 and 0033 on PGlite and zero additional failures.
- [ ] Usage read endpoint: §11 four cases pasted (401 unauth, 403 HOD of other department,
      200 own department, 404 nonexistent department).
- [ ] Each new endpoint reading clinical tables: §11 four cases pasted.
- [ ] Grep proof that no new code logs or stores question/answer/patient text
      (`input-privacy` unchanged; usage table has no text columns).
- [ ] Failed fetch on each new card renders a visible error state, not 0 (§7) — screenshot or
      test per card, HODPortal.tsx especially.
- [ ] No `departmentId === <n>` or Pediatrics-specific branch added (§5) — grep pasted.
- [ ] No new user-facing "Arogya" string — grep pasted.
- [ ] Cost arithmetic: HOD card calls/month × tokens/call × model price ≤ ₹500, shown.

## Flags (AGENTS.md rule triggers)
- §9 — rule itself being amended at developer's request; Part 0 must land first.
- §6 — new table + migration 0032: drafted only, developer applies. Halt.
- §3 / §4 — Part 1 read endpoint and Part 2 cards read clinical/progress data; ownership,
  college/department scope, and studentsTable.id vs usersTable.id resolved server-side. Halt.
- §8 — usage events sit next to AI calls; must store no question/answer/patient text.
- §7 — new dashboard cards; HODPortal.tsx has regressed on fallback numbers twice.
- §5 — targets from `department_configs` / `procedure_types` only.
- Cost — ₹500/month ceiling (developer decision); free-tier hosting constraint.

## Suggested review tier (set at scoping time)
- High assurance (Opus), high effort — §15.2 triggers: schema/migration (§6), clinical tables
  and ownership (§3), two ID systems (§4). Never lowered.

## Executor
- Direct.
- At the developer's request in chat, Antigravity handles mechanical edits within scope.
  Direct execution handles changes requiring judgment and runs independent verification.
- Why: Antigravity test fails — needs in-loop test runs and judgement on Opus-trigger paths.
- Antigravity model: n/a.
- Execution session: a fresh session (Sonnet in Claude Code; current suitable model in Codex).

## Approval
- Status: APPROVED 2026-11-22 — planning session. Execute in a fresh agent session (model per the global rules for your tool).
- Re-grounded the same day against `origin/main` `75c5d6f` after approval: migration renumbered
  0029→0032, migrations.ts entry added, Mochi naming, college scope, SupportWidget untouched.
  Scope and decisions unchanged.
- Open at approval: `OPENAI_MODEL` name not supplied. Parts 0, 1, 3 may proceed; halt before
  Part 2's HOD weekly card until the developer gives the model name.
