# Current Task

## Feature
Per-department label overrides: each department stores its own display wording for a fixed set
of label keys. A HOD changes one label at a time on a settings screen, through a route Mochi can
call later. The code that picks wording by department name is replaced by these labels, and
every existing department keeps exactly the wording it sees today.

## Plan reference
Unplanned (AGENTS.md §14.7, no MASTER_PLAN.md). Why: departments keep phoning the developer for
wording changes, and history shows these were hardcoded by department name (`9342bef`,
`347487f`, `546ee34`, `98355ab`, `1c8b1c4`, `5de6de3`), which breaks §5.
- Programme: step 2 of 4, split under §9 into:
  - **2a (this file):** labels, plus the name checks that only change wording.
  - **2b (next):** the name checks that change behaviour, moved to on/off settings with a
    settings backfill.
- Step 1 (script removal) is drafted on `task/remove-one-off-fix-scripts`. Step 3 covers the
  other settings pieces, step 4 is Mochi making the edits.
- Planning snapshot: `origin/main` at `8fca46c` (PR #162). Task branch:
  `task/department-label-overrides`.
- STATUS.md at scoping time: no `docs/STATUS.md` exists in the repo.

## MASTER_PLAN.md update
- [ ] None. The repo has no MASTER_PLAN.md (§14.7); unplanned work is recorded here.

## Developer decisions recorded (2026-11-22 planning session; 2026-11-23 and 2026-11-24 entries below)
- Split as proposed: this task is labels plus wording-only name checks. Behaviour and mixed
  sites go to 2b.
- Done means all four of the following:
  - Existing departments look identical.
  - A HOD can rename one label and it shows on every page that uses it, with no redeploy.
  - No wording in the code depends on a department's name.
  - The one-label route is ready for Mochi.
- Verification: API tests plus the PGlite migration test, and per-department browser
  screenshots before and after. (The screenshots were replaced by a demo-mode text comparison on
  2026-11-23; see the decisions below and `## Verification required`.)
- `freeTextPostingUnit` and everything it controls stay untouched.
- `POST /api/admin/department/config` stays untouched (fixing its whole-object replace is
  step 3).
- **2026-11-23, given by the developer in review** (after the Opus review returned "accept with
  fixes"):
  - The literal-id 0034 backfill (numbered 0033 when decided; renumbered 2026-11-24, see below)
    (18; 15 and 38; 14, each with a name check; test copies inherit
    through their config source) is the developer's choice. It replaces the Design's
    match-by-name wording.
  - The `## Executor` relabel and the backticked paths are confirmed.
  - "Looks identical" is proved by a demo-mode text comparison against an unchanged "before".
- **2026-11-23, given by the developer in the coordinating chat** (relayed by the coordinating
  sessions; recorded in fix round 2):
  - The new "Wording" entry in the HOD settings section list is excluded from the "any difference
    is a failure" rule. It is this task's own feature.
  - The literal-id backfill also changes what the backfill test must check: the test checks the
    id-based selection, not name-matching.
  - The demo-mode text comparison replaces screenshots as the evidence method.
- **2026-11-24, given by the developer in chat:**
  - The migration is renumbered from 0033 to 0034 because the Mochi adoption task owns 0032 and
    0033. The scope was widened on the developer's own chat instruction, "Rename to 0034 now",
    to add `lib/db/migrations/0034_department_label_overrides.sql` and remove the 0033 file.
  - Mochi's 0032 and 0033 have since merged to `main` (`41c2131`, PR #164). 0034 is the next free
    number.
- **2026-11-24, developer accepted the final high-assurance review with "Fix in close-out"**
  (formal verdict: accept with fixes, documentation wording only). The documentation fixes were
  made at close-out, not in another fix round. The former "Task-file note" (about not merging this
  file over the unrun Mochi task) is retired: Mochi merged as PR #164. This file replaces the
  Mochi task file on this branch; the Mochi version stays in git history.

## Design (decided at scoping; deviations are a halt)
- **Storage: a new table `department_label_overrides`.** Not a jsonb column on
  `department_configs`, for three reasons:
  - Some departments have no config row: `department.ts:80-91` makes up a fake id-0 config.
  - One row per key gives a safe one-label-at-a-time write and a per-row `revision`.
  - It copies the proven `department_logbook_sections` pattern
    (`lib/db/src/schema/logbook_sections.ts`, `routes/logbook-sections.ts`).
- **Columns:**
  - `id` serial PK
  - `department_id` int, not null, FK to departments
  - `key` text, not null
  - `value` text, not null
  - `revision` int, not null, default 1
  - `updated_by` int, nullable, FK to `users.id` (a `usersTable.id`, §4)
  - `updated_at` timestamptz, not null, default now()
  - unique (`department_id`, `key`)
- **No row means the default.** Resetting a label deletes its row.
- **Registry (closed set):** `lib/api-zod/src/department-labels.ts`, shared by the API and the
  frontend. Each key has a default (today's generic string, copied verbatim), a HOD-facing
  description, a group, and `maxLength` 80. Values are trimmed, must not be empty, and must not
  contain newlines. They render as plain React text and are never treated as HTML.
- **Initial keys.** Defaults are the exact strings in the code today:

  | Key | Default | Used at |
  |---|---|---|
  | `postings.unitTitle` | `Ward / Posting Unit` | PostingsPage.tsx:45 (`postingLabelTitle`) |
  | `postings.unitPhrase` | `ward posting or rotation` | PostingsPage.tsx:46 (`postingLabelLower`) |
  | `postings.printColumn` | `Ward / Unit` | PrintableLogbook.tsx:409 |
  | `postings.settingsSection` | `Wards / postings` | DepartmentSettings.tsx:54 (section label) |
  | `postings.settingsNoun` | `Wards` | DepartmentSettings.tsx:54 (desc text) |
  | `nav.postings` | `Postings & Rotations` | AppLayout.tsx:216, 229 |
  | `milestones.pageTitle` | flag-derived, see below | MilestonesPage.tsx:32-34 |
  | `nav.milestones` | flag-derived, see below | AppLayout.tsx:213, 252 |
  | `caseLog.caseId` | `Case ID` | ProfessorPortal.tsx:567, 1058, 1193; Dashboard.tsx:295; PrintableLogbook.tsx:436, 466 |

- **How each label is resolved:**
  - The rule is: override if one exists, else the default.
  - `milestones.pageTitle` default: "Thesis and mandatory certifications" if
    `useThesisAndMandatoryCertificationsLabel` is on, else "Thesis & certifications".
  - `nav.milestones` default: the same, but the off-value is "Thesis & Certifications" (capital C,
    as today).
  - The page title and nav title are two keys because they differ today for Microbiology. One key
    would change what Microbiology sees.
  - Composite strings keep their shape:
    - "Case ID & Info" becomes `${caseId} & Info`.
    - "Case ID & Age" becomes `${caseId} & Age`.
    - `Case ID: {uhid}` becomes `${caseId}: {uhid}`.
- **Which department's labels apply:** the config-source department. The catalog resolves it with
  `resolveConfigDepartmentId(departmentId)` in `routes/department.ts:41`, the same way it does for
  `enabledFeatures`, so a mirror department shows its source's labels.
- **Read path:**
  - `GET /api/departments/:id/catalog` gains `labels: Record<string,string>`, holding overrides
    only. The route's existing auth and department-scope check stay as they are.
  - `department-context.tsx` exposes `labels` and a `useLabel(key)` / `label(key)` helper that
    applies the registry default and the flag-derived defaults above.
- **Write path:** a new route file `routes/department-labels.ts`, mounted at
  `/admin/department/labels` next to logbook-sections in `routes/index.ts`.
  - Middleware: `requireAuth, requireRole(["hod"]), requireDepartment`.
  - The department is always `req.user!.departmentId`. It is never taken from the URL, body or
    query.
  - A department that mirrors another department's config gets `403`, the same as
    logbook-sections.ts:32-33.
  - `GET /` returns every registry key with its default, current override (or null), revision, and
    group.
  - `PATCH /:key`, body `{ value: string, revision?: number }`:
    - unknown key returns `404`
    - an invalid value returns `400`
    - a revision that doesn't match returns `409`
    - otherwise it upserts one row inside a transaction with a row lock
  - `DELETE /:key`, body `{ revision?: number }`: deletes the override (reset to default).
    - Unknown key returns `404`. A stale revision returns `409`.
    - A valid key with no override returns `200` with `{reset: false}`.
  - Responses return the key, resolved value, override, and revision. They never return other
    departments' rows.
- **HOD screen:** a new "Wording" section in `components/DepartmentSettings.tsx`.
  - Labels are grouped by registry group. Each row shows the current value with the default as
    hint text, and has its own Save and "Reset to default".
  - A row saves on its own, sending the revision it read.
  - After a save it calls the department context's `refresh()`, so pages update without a reload
    or redeploy.
  - A failed save shows a visible error state (§7). Defaults are never shown as if they were
    saved values.
- **Migration:** a new file, `lib/db/migrations/0034_department_label_overrides.sql`.
  - `0032` and `0033` belong to the Mochi adoption task's migrations, which have merged to `main`
    (`41c2131`, PR #164). 0034 is the next free number (renumbered from 0033 on 2026-11-24).
  - It contains:
    1. the table DDL
    2. the label backfill
    3. the Microbiology name-capitalisation fix
  - Register it in `lib/db/src/migrations.ts` with `files.push(...)`, and bump the row count in
    `tests/migrations.test.ts:16`.
  - Drafted only, never run against any database (§6). The developer applies it.
- **Label backfill:** idempotent (`ON CONFLICT (department_id, key) DO NOTHING`). It runs on every
  department row, including test and mirror rows, and copies today's JS checks exactly:
  - `name` lowercased containing `radiology`:
    - `postings.unitTitle` = `Posting`
    - `postings.unitPhrase` = `posting`
    - `postings.printColumn` = `Posting`
    - `postings.settingsSection` = `Postings`
    - `postings.settingsNoun` = `Postings`
  - `name` lowercased containing `dermatology`, and not `radiology` (radiology wins in
    PostingsPage.tsx:45):
    - `postings.unitTitle` = `Posting unit`
    - `postings.unitPhrase` = `posting unit`
    - `postings.settingsSection` = `Postings`
    - `postings.settingsNoun` = `Postings`
    - Dermatology's print column stays the default `Ward / Unit`, as today.
  - Microbiology, meaning `lower(code) = 'microbiology'` or `lower(name)` containing
    `microbiology` (MilestonesPage.tsx:31):
    - `milestones.pageTitle` = `Thesis and mandatory certifications`
    - No `nav.milestones` row: the nav uses only the flag today.
- **Name-capitalisation fix:**
  - The SQL is
    `UPDATE departments SET name = regexp_replace(name, 'microbiology', 'Microbiology', 'i') WHERE name ~* 'microbiology' AND name !~ 'Microbiology';`
  - It replaces only the first match, the same as the JS `replace` without `g`.
  - Every display-time `replace(/microbiology/i, "Microbiology")` is then removed.

## Files/areas in scope
- `lib/db/src/schema/department_label_overrides.ts` (new), plus a re-export from the schema
  index, `lib/db/src/schema/index.ts`. This is the table definition.
- `lib/db/migrations/0034_department_label_overrides.sql` (new). Same file renamed from 0033,
  because the Mochi adoption task owns 0032 and 0033. The developer approved adding this path
  in chat on 2026-11-24. The SQL content is unchanged; the 0033 file is removed by the rename.
- `lib/db/src/migrations.ts`: register the new file.
- `lib/api-zod/src/department-labels.ts` (new), plus export from the package index,
  `lib/api-zod/src/index.ts`. This holds
  the registry, defaults, resolver and PATCH/DELETE body schemas.
- `artifacts/api-server/src/routes/department-labels.ts` (new): GET/PATCH/DELETE as designed.
- `artifacts/api-server/src/routes/index.ts`: mount the new router.
- `artifacts/api-server/src/routes/department.ts`:
  - The catalog returns `labels`.
  - Remove only the capitalisation replace at lines 24 and 59.
  - Lines 61-126 (the micro defaults, made-up config and catalog overrides) are 2b and stay.
- `artifacts/api-server/src/routes/superadmin.ts:214, 217`: remove the capitalisation replace.
- `artifacts/api-server/tests/department-labels.test.ts` (new): the route and backfill tests
  listed under Verification.
- `artifacts/api-server/tests/migrations.test.ts`: bump the expected migration count only.
- `artifacts/mockup-sandbox/src/lib/department-context.tsx`:
  - Add `labels` to `DepartmentData` and add the `useLabel`/`label` helper.
  - Remove only the capitalisation replace at lines 36-37.
  - The micro defaults at 39-83 are 2b and stay.
- `artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx`:
  - Lines 42-43 (`isRadiology`, `isDermatology`) and 45-46 are replaced by labels.
  - `isMicrobiology` (line 44) and everything it controls (61, 168, 221-233) stay untouched.
- `artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx`:
  - `isRadiology` (178) and its use at 409 become `postings.printColumn`.
  - "Case ID" at 436 and 466 becomes `caseLog.caseId`.
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx`:
  - `isRadiology` (46) and the label and desc at 54 become labels.
  - Add the new "Wording" section.
- `artifacts/mockup-sandbox/src/components/pages/MilestonesPage.tsx`: lines 31-34 become
  `milestones.pageTitle`. The `|| isMicrobiology` is removed; the backfill keeps Microbiology's
  title.
- `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx`:
  - The nav titles at 213, 216, 229 and 252 use `nav.postings` / `nav.milestones`.
  - The page-description map (around 105-125) is re-keyed by route, so a renamed title still
    finds its description. The existing route-to-key map at 272-274 shows the pattern.
  - Remove the capitalisation replace at 730 and 826.
  - The Microbiology attendance and leave sites at 138-164 and 255 are 2b and stay.
- `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx`: the "Case ID" strings at 567,
  1058 and 1193 only.
- `artifacts/mockup-sandbox/src/components/Dashboard.tsx:295`: "Case ID" only.
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx:137-138`,
  `components/RegistrationPage.tsx:52`, `components/HODPortal.tsx:346`: remove the capitalisation
  replace only. HODPortal is limited to this one line; scrutinise it under §7.
- `artifacts/mockup-sandbox/src/lib/demoDepartments.ts`: add `labels` to the demo Radiology,
  Dermatology and Microbiology profiles, matching the backfill, so demo mode looks identical.
  Line 681 is 2b and stays.

## Explicitly out of scope
- **Every BEHAVIOUR or MIXED name-check site goes to 2b.** The scoping inventory (2026-11-22)
  listed these:
  - `lib/department-features.ts:13-27`
  - `routes/department.ts:61-126`
  - `lib/academic-logbook.ts:10-13` (Physiology profile lookup) and `physiology-logbook.test.ts`
  - PostingsPage 61, 168, 221-233
  - CaseLogsPage 121-122
  - ProcedureLogsPage 65, 68, 74, 405, 511, 590, 671 ("Details" column), 686
  - ProfessorPortal 148-171, 494-496, 591-594, 791, 846-857, 887-893, 942-944, 1100, 1249, 1653
  - AppLayout 138-164, 255
  - AttendancePage 383-384
  - ConferencesPage 39-44
  - department-context.tsx 39-83
  - demoDepartments.ts:681
- AssessmentsPage.tsx:31, 83 subtitle: it is wording, but it names assessment types that are
  still picked by department name (ProfessorPortal 791, 846). Move it with that behaviour in 2b.
- "Competency level" / "Role level" wording: it collides with the dynamic procedure-field labels
  (`roleField?.label`, ProcedureLogsPage.tsx:671) and the `recordDetailsEnabled` switch at 540.
  It is a separate decision.
- Folding the existing boolean wording flags (`useCaseTypeLabel`, `useThesisAndPublicationsLabel`,
  `useThesisAndMandatoryCertificationsLabel`) into labels. Follow-up. They keep working and feed
  the flag-derived defaults above.
- Sidebar or page titles other than Postings and Milestones: they are not department-specific
  today. More keys can be added later as registry entries.
- `POST /api/admin/department/config` whole-object replace: step 3.
- Mochi tools that call the label route: step 4.

## Do NOT touch
- `freeTextPostingUnit`, every place it is read, and everything it controls:
  - `student.ts` 491-556, 2084-2113
  - PostingsPage.tsx 61, 91, 97, 142, 168, 221-233
- `artifacts/api-server/src/routes/student.ts`, `routes/admin.ts` (including the config POST at
  500-537), `routes/professor.ts`, `routes/arogya.ts`.
- `lib/department-features.ts`, `lib/academic-logbook.ts`,
  `lib/api-zod/src/logbook-profiles/physiology.ts`.
- `lib/db/src/schema/department_configs.ts` and the `enabled_features` column.
- Existing migration files `0001`-`0031`, and `lib/db/src/migrate.ts`.
- Existing tests, except the count bump in `migrations.test.ts`.
- `AGENTS.md`, `.env`, any Mochi-task file or migration, and the `task/mochi-ai-adoption` and
  `task/remove-one-off-fix-scripts` branches.
- Any code not named under Files/areas in scope. Report anything noticed; do not fix it (§9).

## Execution route
- B: agent loop.
- Why: route C test point 2 fails. A §15 Opus trigger fires (schema change, migration, backfill,
  data update). Points 1 and 3 also fail.
- Close-out: route B, never route C. Project permissions and approvals apply. No PR before the
  developer accepts the review.

## Manual (developer does)
- [ ] Before the backfill is final, run this read-only query yourself (the agent must not) and
      paste the output. It contains department metadata only, no personal data:
      `SELECT d.id, d.name, d.code, d.is_test, d.config_source_department_id FROM departments d WHERE d.name ~* '(radiology|dermatology|microbiology)' OR d.code ~* 'microbiology' ORDER BY d.id;`
      Adjust the column names if they differ. The query confirms which rows the backfill hits,
      and whether any mirror's own name matches while its config source doesn't. Such a mirror
      would change view, because labels follow the config source.
- [ ] Review and apply the drafted migration with the project's own `src/migrate.ts`, before
      deploying the code that reads `labels`. Migration first, then code.
- [ ] Accept or send back the code review. Merge after close-out.

## Agent (does on its own, once scope is confirmed)
- [ ] Run AGENTS.md §1 pull and report.
  - The task branch already exists; update it from `origin/main` and report the hash.
  - A dirty tree stops the task. List stashes; never apply, pop or drop them.
- [ ] Write the registry, schema, migration (drafted only), route, catalog `labels`, context
      helper, HOD "Wording" section, demo labels, and the call-site swaps listed in scope.
- [ ] Write `tests/department-labels.test.ts` and bump the migration count.
- [ ] Run the verification below and write `HANDOFF.md` at the repo root, with pasted output from
      this run.
- [ ] Write `.agents/runs/<date>-department-label-overrides.md` (append-only run log).

## Blocked on developer input
- [x] ANSWERED 2026-11-23 (developer's query output, relayed): ids 14 MicroBiology, 15 and 38 Dermatology, 18 Radiology; test copies 19, 24, 26, 39 follow their source. Backfill written by literal id.
- [ ] (was) Backfill row set. Waiting on: the pasted output of the read-only query above.
  - The executor may write everything else first.
  - It finalises the backfill only after the output is pasted. If a mirror's own name matches
    while its source does not, it halts.
- [x] ANSWERED 2026-11-23: demo mode + API tests (no DATABASE_URL).
- [ ] (was) Local browser run against a backend. Waiting on: either a test-only `DATABASE_URL`
      (§6.1: the agent prints and checks the host before every connecting command, and runs only
      `src/migrate.ts`), or the developer's OK to use demo-mode screenshots for the "looks
      identical" check plus API tests for the HOD rename round trip.

## Order
### Steps inside this task
1. Ask for the two Blocked items. Continue with work that doesn't depend on them.
2. Pull and report (§1).
3. Registry, schema, and the migration DDL, registered.
4. Route plus tests: the §11 four cases first, then 400/409/reset.
5. Catalog `labels`, context helper, demo labels.
6. Take "before" screenshots of every department, before swapping any call site.
7. Call-site swaps and capitalisation removals.
8. HOD "Wording" section.
9. Finalise the backfill and name fix once the query output is in, plus the backfill test.
10. Full verification run, then `HANDOFF.md`.

### Where this task sits
- Before this:
  - Nothing blocks starting.
  - Migration numbering: this task's migration is 0034, after Mochi's 0032 and 0033, which have
    merged to `main` (`41c2131`, PR #164).
  - Step 1 (`task/remove-one-off-fix-scripts`) is independent.
- After this:
  - 2b: the behaviour name checks, using the inventory above.
  - Step 3: the settings pieces.
  - Step 4: Mochi calling `PATCH /api/admin/department/labels/:key` after a preview and the HOD's
    confirmation.

## Verification required before this is considered done
- [ ] `pnpm test` in `artifacts/api-server`: full output pasted.
  - Every test passes.
  - `migrations.test.ts` applies the new migration on PGlite with the bumped count.
- [ ] §11 evidence for `PATCH /api/admin/department/labels/:key`. Each case is shown on its own,
      with request and response:
  - unauthenticated: `401`
  - authenticated wrong owner: `403`. This covers a student, a professor, and a HOD of a
    mirrored department. It also shows that a HOD of department A cannot change department B's
    rows (B's rows are unchanged after A's call).
  - correct HOD: `200`, and the row is written for `req.user.departmentId` only
  - nonexistent key: `404`
  - The same four cases for `DELETE`.
  - Separately: `409` for a stale revision, and `400` for an empty, too-long (81 chars) or
    multi-line value.
- [ ] Backfill test on PGlite:
  - Seed these departments: `Radiology`, `Dermatology`, `Department of microbiology` (code
    `microbiology`), `Pediatrics`, and one named with both radiology and dermatology.
  - Run the migration's backfill and name-fix SQL.
  - Assert the exact label rows per department and the fixed name, and that `Pediatrics` gets no
    rows.
  - Re-run and assert nothing changes.
  - If the migrator cannot apply a prefix, running the backfill SQL text from the migration file
    after seeding is acceptable. Do not change `migrate.ts`.
- [ ] `pnpm run typecheck` at the repo root exits 0; output pasted.
- [ ] Grep evidence, pasted. Each search returns no matches outside the 2b out-of-scope list:
  - `rg -n 'includes\("(radiology|dermatology)"\)' artifacts lib`
  - `rg -n 'replace\(/microbiology/i' artifacts lib`
  - `rg -n 'isRadiology|isDermatology' artifacts lib`
  - List every remaining `microbiology` match, each tagged with its 2b line from the out-of-scope
    list.
- [ ] Looks identical: a demo-mode text comparison, before (an unchanged `git archive` of
      `origin/main`) against after, at desktop and mobile widths, for Radiology, Dermatology,
      Microbiology and one generic department (Pediatrics). This replaces screenshots (developer
      decision, 2026-11-23). Pages:
  - Postings page
  - printable logbook (postings table and case-log Case ID column)
  - Department settings section list
  - Milestones page title
  - sidebar
  - department header (capitalised "Microbiology")

  The text must be identical before and after. Any difference is a failure, not a note. The one
  exception is the new "Wording" entry in the Department settings section list, which is this
  task's own feature and is excluded from this rule (developer decision, 2026-11-23).
- [ ] HOD rename round trip (demo mode and API tests, developer decision 2026-11-23; no
      screenshots):
  - Change `postings.unitTitle` on the Wording screen. The Postings page shows the new text after
    the context refresh, with no redeploy.
  - Press Reset to default and the original text returns.
  - A failed save shows a visible error.
  - Evidence is API test output for PATCH and DELETE, plus the text-based browser checks.
- [ ] `HANDOFF.md` lists every file touched, every command run, and states that no command
      connected to a database (or shows the §6.1 host check for each one).

## Flags (AGENTS.md rule triggers)
- §6 (schema change, migration, backfill, data update): HALT.
  - New table, label backfill, and `UPDATE departments SET name`.
  - Drafted only, never run. The developer applies it.
  - The name update is irreversible in practice and changes the stored name shown everywhere
    (emails, exports, registration list). Review it as data, not code.
- §5 (no hardcoded department behaviour): the purpose of the task.
  - The backfill SQL matches department names once, at migration time. That is the one place a
    name match remains, and it is reviewed and one-off.
  - Runtime code must have no wording branch on name or code afterwards.
  - Registry defaults must be the generic strings, never Pediatrics-specific.
- §3 and §14.5 (ownership, and behaviour hidden inside wording): HALT.
  - `freeTextPostingUnit` controls faculty visibility, auto-verification and edit rights
    (`student.ts` 494, 534-556, 2084-2113). It must not move into labels or be touched.
  - Any variable being removed (`isRadiology`, `isDermatology`, `isMicrobiology`) that turns out
    to also drive behaviour in that file must be left in place, and the site reported for 2b.
  - Any site that looks like wording but changes fields, validation, visibility or data written
    is also a halt.
- §4 (two ID systems): the label route uses `req.user.departmentId` only, and `updated_by`
  stores `usersTable.id`. No `studentId` is involved. Check it anyway.
- §7 (no fabricated content): label defaults are copied verbatim from today's code. No new
  wording is invented. A failed label load or save shows an error, never made-up text or values.
  HODPortal.tsx is touched at one line only.
- §8 (logging): label values are not patient text. The route still logs only the key, department
  id and status, never values.
- §9 (one feature): already split; this is 2a. Anything that turns out to need behaviour change
  is a halt and goes to 2b.
- §10 / §13: none expected. A test `DATABASE_URL`, if supplied, is never echoed.
- Migration numbering: this task's migration is 0034, after Mochi's 0032 and 0033, which have
  merged to `main` (`41c2131`, PR #164). A clash is a halt.
- Mirror departments: labels follow the config source. The developer's query output decides
  whether any mirror changes view. If one does, halt.

## Suggested review tier (set at scoping time)
- High assurance (legacy label: Opus), high effort.
- §15.2 triggers: schema, migration and backfill (§6), and the data update to `departments.name`.
- The route resolves department ownership server-side, which is also an ownership-adjacent check.
- Never lowered.

## Executor
- Sonnet direct (relabelled from "Direct" at execution, developer decision 2026-11-23: the guard hook only recognises the legacy label; same executor).
- Why: Antigravity test point 1 fails, because the changes are surgical edits across about 15
  files and the spec is about as long as the code. Point 2 fails too: the work needs iteration
  against tests and typecheck, plus before and after screenshots.
- Antigravity model: n/a.
- Execution session: a fresh agent session. Sonnet per the global rules, never Opus.

## Approval
- Status: APPROVED 2026-11-22 — planning session. Execute in a fresh agent session (model per the global rules for your tool).
- Open at approval: both `## Blocked on developer input` items. The pasted SELECT output and
  the test-DB vs demo-mode choice are still outstanding. The execution session asks for them
  first and halts on the backfill step until the SELECT output is in.
- Review accepted by the developer 2026-11-24 ("Fix in close-out"). Closed out in a close-task
  session on `task/department-label-overrides`; commits and PR are recorded in `HANDOFF.md`
  ("Close-out").
