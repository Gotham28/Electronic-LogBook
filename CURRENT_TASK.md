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
  targets. No OpenAI call.
- Professor: `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx` review queue —
  deterministic per-log flags (required fields empty, dates out of posting range, duplicate
  UHID+date). No OpenAI call; no log text leaves the server.
- HOD: `artifacts/mockup-sandbox/src/components/HODPortal.tsx` — "This week" digest card,
  generated lazily on first HOD view per department per ISO week via the existing
  `department-report` path, cached server-side (in the Part 1 table or a cache row — executor
  proposes, halts for approval if it needs a second table). Aggregate counts only.

Part 3 — discoverability
- Error states on pages already calling `publishArogyaContext` (CaseLogsPage, ProcedureLogsPage,
  AcademicLogsPage, ClinicalWorksPage, ConferencesPage, QuarterlyAppraisalSection,
  ProfessorPortal) — "Ask Mochi about this" button calling `openArogya`.
- `artifacts/mockup-sandbox/src/components/arogya/AssistantAnswer.tsx` — "Based on your N logs"
  / "Based on department data" grounding label, N taken from the facts pack the server already
  builds (return it in the response; no new query).
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
- [ ] Confirm the HOD digest's actual OpenAI cost after one week against the ₹500 ceiling.
- [ ] Run a 15-minute Mochi demo at a Pediatrics department meeting; pick 1–2 professor champions.
- [ ] Idea 4 groundwork (parked): ask the college what approval is needed to send de-identified
      clinical text to an AI provider, and ask OpenAI for its data processing terms.
- [ ] Decide what to do with local `main`: it holds 2 unpushed commits (`a6eacd7` "docs: approve
      Cloudflare feasibility prototype", and merge `c0dad8f`) and has diverged from origin.

## Agent (does on its own, once scope is confirmed)
- [ ] Part 0 — replace AGENTS.md §9 body with:
      "A task may bundle related features when the developer approves it at scoping. Each
      feature is a numbered Part in CURRENT_TASK.md with its own files, its own commit, and its
      own verification evidence; the review report covers each Part separately. Work not listed
      as a Part is still flagged, not done. Do not silently restructure, rename, reformat, tidy
      or improve code outside the listed Parts." Update §14.5 halt bullet to "Work appearing
      that is not a listed Part (§9)." Separate commit.
- [ ] Part 1 — table + drafted migration + migrations.ts entry + event recording + usage read
      endpoint + tests. Event row: id, userId (usersTable.id), role, departmentId, feature, event
      type, httpStatus, tokenCount, createdAt. **No question text, no answer text.** Separate commit.
- [ ] Part 2 — resident card, professor flags, HOD weekly card + tests. Separate commit per role.
- [ ] Part 3 — error-state buttons + grounding label + tests. Separate commit.

## Blocked on developer input
- [ ] Exact `OPENAI_MODEL` name in production (the model name, not the key) — waiting on:
      developer, so the ₹500 ceiling can be checked with real per-token prices before Part 2's
      HOD card ships. Parts 0, 1, 3 may proceed without it.

## Order
### Steps inside this task
1. Work on branch `task/mochi-ai-adoption` (already pushed with this file). Pull it first.
2. Part 0 (rule change).
3. Part 1 (measurement) — HALT after drafting migration; developer reviews schema.
4. Part 3 (discoverability).
5. Part 2 (nudges) — HALT before any change touching clinical-table queries; HALT before the HOD
   card if `OPENAI_MODEL` is still unknown.
6. `code-review`, then `close-task`.

### Where this task sits
- Before this: nothing.
- After this: re-check usage numbers after 2–4 weeks of pilot use; idea 4 once college approval exists.

## Verification required before this is considered done
- [ ] `pnpm test` in `artifacts/api-server` — full pass pasted, including
      `tests/migrations.test.ts` applying 0032 on PGlite.
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
