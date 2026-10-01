# Antigravity dispatch 79 — HOD Requirements layout: code-review send-back fixes

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root (there is no
`.agents/CURRENT_TASK.md`; `AGENTS.md` is also at the repository root), dated 2026-10-01, working
branch `feat/hod-requirements-layout` at commit `0bbc910` (already checked out). Follow-up to
dispatches 76, 77 and 78 (`.agents/runs/`). If this is not that repo, stop, say which repo this is,
and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

This means you cannot run `pnpm typecheck` or `pnpm build`. Claude Code re-runs them after you
finish and will check your claim, so be exact. Write TypeScript that type-checks under the existing
strict settings: no new `any` beyond what the file already uses, no unused variables or imports.

## Read first
- `AGENTS.md` (repository root) — §7 (no fabricated content, visible error states), §9 (one feature per diff).
- `CURRENT_TASK.md` (repository root) — the original scope (Agent steps 1-5) and the section "Review send-back — 2026-10-01".
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` — the whole file (761 lines). Every line number below is a line in this file at `0bbc910`.
- `HANDOFF.md` (repository root).

## Build
Ten fixes, all in `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` except Fix 10 (`HANDOFF.md`). Every request body, endpoint and success toast stays exactly as it is, except where a fix below says otherwise. Work through them in order.

- [ ] **Fix 1 — restore validation on every Save, and let Enter save.** Today each row's Save is a bare `onClick` button, so the `required` / `min` / `max` attributes on the number input never run, and `Number("")` sends `required: 0`. In all three places, turn the existing `<div className="flex items-center gap-2">` that wraps the row's `Label` + number `Input` + `Save` button (generic rows `:417-452`, procedure rows `:628-644`, clinical-work rows `:698-714`) into a `<form>` with the same `className`, and:
  - `onSubmit={(e) => { e.preventDefault(); patchItem(<exactly the same five arguments the Save button's onClick passes today>); }}` — same item id, same kind, same stored value, same period argument, same success message per section.
  - Make the Save button `type="submit"` and remove its `onClick`. Its `disabled` becomes `busy || !isDraftDifferent(<same args>) || getDraft(<same args>).trim() === ""`.
  - Keep the `Label`, the input's `id`, `type`, `min`, `max` (leave days stay `max={365}`), `required`, `className` and `aria-label` exactly as they are. Do not nest one `<form>` inside another: none of these rows is inside a form today, and the sub-type `<form>` (`:746`) and the add-panel `<form>` (`:272`) must stay separate from the new ones.
  - Do not touch `patchItem`'s body or the `isDraftDifferent` guard inside it (apart from Fix 4's signature change).
- [ ] **Fix 2 — procedure-groups load failure must not hide the procedures (§7).** In `ProceduresList` (`:537-547`), the early `return` on `groupsError` replaces the whole list with the error line. Remove that early return. Instead render `Could not load procedure groups.` and the `Retry` button (same markup, classes and `onClick={fetchGroups}` / `disabled={busy}`; `Retry` stays `type="button"`) at the top of the list container, ABOVE the procedure blocks, and still render every procedure beneath it. With the groups list empty or stale, blocks are built exactly as today (a block named by `p.group` for any type whose group is not in `procedureGroups`). If there are no procedures and no groups, the existing `No procedure types configured.` line renders under the error line. Also, in the Add-procedure panel, show the same pair — `Could not load procedure groups.` plus a `Retry` button with `type="button"` that calls `fetchGroups` — directly under the Group select inside the Group field's `<div>` (`:279-292`, which currently has no error indication), only when `groupsError` is true. Keep `+ Add new group` selectable. No fallback list of groups, no placeholder data (§7).
- [ ] **Fix 3 — Procedures search must show the same counters as the other panes.** In `ProceduresList` (`:564-587`), when the query is non-empty: render `Showing {shown} of {total}` using the same markup as the other panes (`<p className="text-xs text-slate-500">` above the blocks), where `total` is `procedures.length` and `shown` is the sum of `types.length` across the blocks that actually render (after the existing group-name / type-name matching, so it matches what the user sees); and when no block renders, render `No matches for &ldquo;{query.trim()}&rdquo;.` using `<p className="py-2 text-sm text-slate-500">` instead of an empty container. Compute the list of blocks to render once, then derive both from it; do not change the existing matching rules (type name or group name, case-insensitive) or `forceExpand`.
- [ ] **Fix 4 — revert wording that was not approved, and remove a fallback toast.**
  - Sub-type add button (`:755`): change the visible text `Add` back to `Add log option`. Keep the label `Add sub-type` (`:748`).
  - Sub-type name input (`:751`): remove the `placeholder="Sub-type name"` attribute entirely.
  - Group count (`:605`): change `types)` back so the text reads `({n} procedure types)` — keep the existing `group.isOfficial ? group.count : types.length` expression, change only the word after it.
  - `patchItem` (`:142-148`): delete the fallback `|| "Target updated"` and make the success message a required `string` parameter. TypeScript does not allow a required parameter after an optional one, so type the fourth parameter as `period: string | undefined` (no `?`) and the fifth as `successMsg: string`. Every existing call site already passes both (procedure rows pass `undefined` for period explicitly); confirm that for all call sites in the file. `Wards / postings` (`:39`) stays.
- [ ] **Fix 5 — section descriptions.** In the `sections` array (`:37-44`), only three sections may carry a description, and each must be an existing sentence from the old page: Procedures keeps `Procedure groups and types, with the required count for each.`, Clinical work keeps its current sentence, and **Wards / postings only** keeps the `{isRadiology ? "Postings" : "Wards"}, academic activities and the other lists residents choose from.` sentence. Remove `desc` from Academic activities, Case categories, Competency levels, Conference levels and Leave types, make the `desc` field optional in the section objects, and render the `<p className="text-sm text-slate-500">{activeSection.desc}</p>` (`:267`) only when a description exists. Do not write new description text. Do not touch `isRadiology` (`:31`) — it stays exactly as it is.
- [ ] **Fix 6 — meta label only for target kinds.** In the generic row (`:411-413`), show the `per month` / `overall` text only when `TARGET_KINDS.includes(activeSection.kind)` as well as a period existing. Postings, competency levels and leave types must show no period meta.
- [ ] **Fix 7 — the add panel resets fully on Cancel and on success.** Both the Cancel button (`:315`) and the success path in `handleAddSubmit` (`:168-188`) must reset all of: `entryName`, `entryRequired`, `entryPeriod` (back to `"total"`), `procedureGroup` (to `""`), `isAddingNewGroup` (to `false`), and close the panel (`setIsAdding(false)`). Put the reset in one small helper function declared next to those states and call it from both places; do not change the POST bodies, the `save()` call or the success toasts. Leave the `+ Add …` header button's toggle and the `[activeSectionId]` reset effect as they are.
- [ ] **Fix 8 — delete dialog polish.** (a) Disable the Cancel button (`:514`) while `deleting` is true. (b) The dialog currently renders `Delete ?` and the wrong body text during its close animation, because `deleteTarget` becomes `null` before the animation ends. Keep the last non-null target: add a `React.useRef` that is updated in a `React.useEffect` whenever `deleteTarget` is non-null, and inside the dialog define `const shownTarget = deleteTarget ?? lastDeleteTarget.current`. Render the title, the description branches and the footer-button branches (`:485-528`) from `shownTarget` instead of `deleteTarget`. Keep `disabled={deleting || !deleteTarget || deleteTarget.count === null}` and the `confirmDelete(...)` / `handleDelete` call semantics based on the live `deleteTarget`, so a closed dialog can never trigger a delete. Do not change `confirmDelete`, `handleDelete`, their endpoints or any dialog string.
- [ ] **Fix 9 — expand/collapse state for assistive tech.** Add `aria-expanded={isExpanded}` to the procedure-group toggle button (`:597`) and `aria-expanded={expanded}` to the clinical-work toggle button (`:686`).
- [ ] **Fix 10 — `HANDOFF.md`.** After finishing Fixes 1-9, re-read `DepartmentSettings.tsx` and update `HANDOFF.md`:
  - Fix the "Fix 3" bullet under "Dispatch 77 and 78 (send-back)": it says `patchItem` "always send[s] the `period` key". It does not: the body spreads `{ period }` for every non-procedure kind, `period` being the value the call site passes (`item.period`, the same value the old code sent); an `undefined` period is dropped by JSON serialisation exactly as before. Describe it that way.
  - Re-derive every line citation in `HANDOFF.md` from the final file (view the file; do not carry numbers over). The "Empty States Wording" list and the `isRadiology` cite (`:87` is stale; it is at `:31`) are known to be out of date.
  - Add a section "Dispatch 79 (code-review send-back)" listing each of Fixes 1-9 with the final file:line of the change, and add "Antigravity dispatch 79: none (no shell access)" and "Claude Code pre-dispatch for 79: `git status --short`, `git stash list`, `git branch --show-current`, `git log --oneline -3`, `git diff --stat main...HEAD`; no stash touched" to "Commands run".
  - Add a section "New user-facing strings in `DepartmentSettings.tsx`" listing every user-visible string in the final file (labels, buttons, placeholders, `aria-label`s, toasts, empty states, dialog text), each with file:line, classified as exactly one of: (a) *approved new* — only these: `Training requirements`, `Section`, the `+ Add …` button labels (`+ Add procedure`, `+ Add category`, `+ Add posting`, `+ Add activity`, `+ Add case category`, `+ Add competency level`, `+ Add conference level`, `+ Add leave type`), `Minimum`, `Days`, `Add sub-type`, `Could not load procedure groups.`, `Retry`, `Wards / postings`; (b) *carried from the old page* — only if the exact text is quoted in `CURRENT_TASK.md` as existing wording (for example the empty states, `Showing x of y`, `No matches for “…”.`, `Add log option`, `No sub-types yet`, `Target total`, `No minimum set yet`, the delete-dialog strings, the toast messages, `Procedure type added` / `Log option added`); (c) *UNVERIFIED — origin unknown* for anything else. Do not guess; `code-review` will check (c) against `main`.
  - State plainly that you ran no verification (no shell access), and keep everything else in `HANDOFF.md` that is still true.

## Do NOT touch
- Every file other than `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` and `HANDOFF.md`. Never anything under `scratch/` (leave `scratch/generate_settings.py` alone; the developer deletes it), `.agents/runs/`, `artifacts/api-server/`, `lib/db/`, `src/lib/*` (including `department-context.tsx` and `apiClient.ts`), `src/components/ui/*`, `HODPortal.tsx`, `DemoDepartmentCustomizer.tsx`, `.env`, `CURRENT_TASK.md`, `AGENTS.md`.
- Any API call, endpoint, request body or validation; the set of `apiGet` / `apiPost` / `apiPatch` / `apiDelete` calls and their bodies must be byte-for-byte what `0bbc910` has. No server, route, schema or migration change (§3, §6).
- `isRadiology` matching on the department name (`:31`): it stays exactly as it is (§5). No new department-name- or department-id-based branching anywhere.
- The `totals` array, stat chips, section order and section gating, the nav, the select below `lg`, the section pane header and `+ Add …` button behaviour, the Search box rules, the drafts map, `handleDelete`, `confirmDelete`. No restyling, tidying, renaming or reformatting outside the lines a fix requires (§9).
- No new user-visible wording beyond the fixes above (§7), no `console.log` / `console.error` / `console.warn`, and no logging of patient text or leave reasons (§8).
- The "Not fixed, recorded as follow-ups" items in `CURRENT_TASK.md`: stale drafts never cleared, the usage-count race, `handleDelete` not refetching groups, `save()` showing an error toast when `refresh()` fails after a good write, the delete-group button only on `isOfficial` groups, stat chips being card-sized, and `totals` showing "No minimum set yet" when config fails to load. Do not fix any of them.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- If any fix seems to need a new or changed API call, request body, endpoint or ownership logic: stop (§3, §14.5).
- Any new department-name- or department-id-based branching (§5, §14.5).
- Anything that would put patient text or leave reasons near a log or error (§8).
- Any migration, backfill, deploy or other irreversible step.
- Any fix that cannot be done as described without changing something on the Do NOT touch list: stop and say which.
- Any value or wording you would otherwise guess or invent.

## Report
Write the `HANDOFF.md` updates described in Fix 10. For each fix, say what you changed, with file:line from the final file. A claim without file:line evidence is recorded as unverified. List anything you skipped or expanded beyond the Build list, and why. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)` — `Claude Sonnet 4.6 (Thinking)` was quota-blocked on dispatch 78 until about 2026-10-02, so this goes to Gemini directly (standing rule: re-dispatch on Gemini when a Claude model is quota-blocked).
