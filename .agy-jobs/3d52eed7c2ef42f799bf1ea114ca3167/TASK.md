# Antigravity dispatch 76 — HOD Requirements tab layout rebuild (DepartmentSettings.tsx)

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root (there is no
`.agents/CURRENT_TASK.md`; `AGENTS.md` is also at the repository root), dated 2026-10-01, base
commit `a5d0feb`, working branch `feat/hod-requirements-layout` (already cut and checked out by
Claude Code). If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

This means you cannot run `pnpm typecheck`, `pnpm build`, `git grep`, `git diff`, `git checkout`,
`git commit` or the AGENTS.md §1 pull sequence. Claude Code already ran the pull sequence and cut
the branch, and runs typecheck, build, endpoint-parity and grep checks after you finish. Write
careful, type-correct code by reading the types the file already uses.

## Read first
- `AGENTS.md` (repository root) — §3, §5, §7, §8, §9, §11, §14.5 are the rules this task can trip.
- `CURRENT_TASK.md` (repository root) — the confirmed scope. The Build list below is its `## Agent`
  bucket; the task file is authoritative if anything here looks shorter.
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` — the file you are rebuilding.
  Read all of it before changing anything.
- `artifacts/mockup-sandbox/src/components/ui/alert-dialog.tsx` — the primitive for the delete
  confirmation. Read-only; use it as it is.
- Read-only references: `artifacts/api-server/src/routes/admin.ts` around the `/department/procedures`,
  `/department/catalog` and `/department/procedure-groups` routes (to confirm `p.group` equals the
  procedure-group `id` and `name`; the line numbers have shifted slightly since scoping). Do not edit it.

## Build

Only `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx`, `HANDOFF.md` and the one
copy file in step 0 may be written. Sub-components stay **in the same file**; no new files other
than the step 0 copy.

### 0. Preserve the previous handoff
- [ ] Before anything else, copy the current root `HANDOFF.md` verbatim (it is the "Send HOD email" task's handoff, still needed for that task's review) to `.agents/runs/handoff-admin-send-hod-welcome-email.md`. No edits to its content. (View `HANDOFF.md`, then write the new file with exactly that text. Do this before you overwrite `HANDOFF.md` at the end.)

### 1. Page frame
- [ ] Replace the large dark gradient hero with a compact header: title `Training requirements`, subline `Department of {data.department.name}`.
- [ ] Keep the `totals` array exactly as computed today (same entries, same feature gating, same labels, same `clinicalTotal` sum, same "No minimum set yet" / "Residents can still log these…" / "Target total" wording). Render them as a compact row of stat chips under the header, not large gradient cards.
- [ ] Body layout: `grid gap-6 lg:grid-cols-[15rem_1fr]`: section nav on the left, the selected section on the right.

### 2. Section nav
- [ ] Sections and their gating, in this order:
  | Section | Shown when | Items |
  |---|---|---|
  | Procedures | `procedureTypesEnabled` | `data.procedures` (count), grouped by `procedureGroups` |
  | Clinical work | `features.clinicalWorks` | `data.clinicalWorkCategories` |
  | `isRadiology ? "Postings" : "Wards / postings"` | always | `data.postings` |
  | Academic activities | always | `data.academics` |
  | Case categories | `!features.hideCaseLogs` | `data.caseCategories ?? []` |
  | Competency levels | `!features.hideProcedureLogs` (**changed**, see Flags) | `data.competencyLevels ?? []` |
  | Conference levels | `features.conferenceLevels` | `data.conferenceLevels ?? []` |
  | Leave types | always | `data.leaveTypes ?? []` |
- [ ] Each nav entry shows the label plus an item-count badge. The active entry is highlighted teal and carries `aria-current="page"`. The nav is `lg:sticky lg:top-4`.
- [ ] Below `lg`, a labelled native `<select>` (label `Section`) replaces the list.
- [ ] Selected section lives in component state. It defaults to the first available section and falls back to it if the selected section disappears. No localStorage, no URL change.

### 3. Section pane: one shared shell
- [ ] Header row: section title, a one-line description (reuse the existing description text where one exists: the Procedures, Clinical work and Training catalog `CardHeader` sentences), and a `+ Add …` button (`+ Add procedure`, `+ Add category`, `+ Add posting`, `+ Add activity`, `+ Add case category`, `+ Add competency level`, `+ Add conference level`, `+ Add leave type`).
- [ ] The add panel toggles directly under the header with fields preset to that kind. It must POST **exactly** what the current single form posts for that kind:
  - procedure → `apiPost("/api/admin/department/procedures", { name, group: procedureGroup, required: Number(required) })`, then reset the group and `isAddingNewGroup`;
  - everything else → `apiPost("/api/admin/department/catalog", { kind, name, required: TARGET_KINDS.includes(kind) ? Number(required) : 0, period, value: name.trim() })`. Keep the same key set the current spread produces (`kind, name, required, period, value`, plus `parentValue` only for sub-types).
  - Required-count and Period fields appear only where they do today (`procedure` or `TARGET_KINDS`; Period only for `TARGET_KINDS`), with the same labels, limits (`min 0`, `max 100000`, `maxLength 160`) and options (`Overall` / `Per month`).
  - Same success toasts (`Procedure type added` / `Log option added`). Same `save()` wrapper (busy flag, `data.refresh()`, `fetchGroups()`, error toast). On success, clear the fields and close the panel. A `Cancel` button closes it.
- [ ] Search box when the section has more than `COLLAPSE_THRESHOLD` (5) items, keeping the existing `Search …` placeholder pattern, "Showing x of y" and "No matches for “…”." texts.
- [ ] One row component for every list: name on the left, with muted meta where relevant (procedure group, or a `per month` / `overall` badge); on the right a labelled number input, a `Save` button **disabled unless the draft differs from the stored value** (and while `busy`), and an icon-only delete button with `aria-label="Delete {name}"`. Full-width rows separated by dividers. No grey box per row and no inner `max-h-80` scroll area; the page scrolls.
- [ ] Input labels: `Minimum` for every count, and `Days` for leave types (`max={365}`). Keep the existing `aria-label`s on the inputs.
- [ ] Replace the five target maps (`targets`, `academicTargets`, `conferenceTargets`, `leaveTargets`, `clinicalTargets`) with one drafts map keyed `` `${kind}:${id}` ``. This also ends the current sharing of `academicTargets` between academic activities and case categories.
- [ ] PATCH calls unchanged: procedures → `apiPatch(\`/api/admin/department/procedures/${id}\`, { required })`; catalog items → `apiPatch(\`/api/admin/department/catalog/${id}\`, { required, period: item.period })`. Same success toast per section as today (`Procedure target updated`, `Clinical work minimum updated`, `Academic target updated`, `Case target updated`, `Conference level target updated`, `Leave allowance updated`).
- [ ] Empty states keep the existing wording (`No procedure types configured.`, `No clinical work categories configured.`, `No postings configured.`, etc.).

### 4. Per-section specifics
- [ ] **Procedures:** procedure types nested under their group. `p.group` equals the procedure-group `id` and `name` (`admin.ts:920-921`). Each group is a collapsible block showing the group name, the type count and a delete-group button (`confirmDelete(g.id, "procedure_group", g.name)`). Search filters types across all groups and expands every group with a match. Types whose group has no entry in `procedureGroups` still render under a block named by `p.group`.
- [ ] **Procedure groups load failure (§7):** `fetchGroups` currently does `.catch(console.error)`, so a failed call shows "No procedure groups." Replace this with a visible error line `Could not load procedure groups.` and a `Retry` button that calls `fetchGroups` again. No fallback list.
- [ ] **Clinical work:** each category is a collapsible row with name, minimum, period meta, Save and delete. Expanded, it lists its sub-types (`data.clinicalWorkSubtypes` where `parentValue === category.value`), each with a delete button (`"clinical_work_subtype"`), and an inline `Add sub-type` field. That field posts `apiPost("/api/admin/department/catalog", { kind: "clinical_work_subtype", name, required: 0, period: "total", value: name.trim(), parentValue: category.value })`, the same payload the current form produces for a sub-type. Keep `No sub-types yet` when a category has none.
- [ ] **Postings, Competency levels:** name + delete only (no number input), as today.
- [ ] **Academic, Case categories, Conference levels:** number + period meta + Save + delete.

### 5. Delete confirmation
- [ ] Move the delete confirmation from the top-of-page card into `AlertDialog` (`components/ui/alert-dialog.tsx`), opened by `confirmDelete`. Keep `confirmDelete`, `handleDelete` and their endpoints unchanged, and keep every string verbatim: `Delete {name}?`, `Checking usage...`, `Checking usage failed.`, the usage-count sentence, `No student records currently use this option. Delete?`, `Cancel`, `Try again`, `Deleting...`, `Delete`, `{name} deleted successfully`, and the refresh-warning toast.

### 6. Handoff
- [ ] Write `HANDOFF.md` at the repository root (overwrite it, after step 0) per AGENTS.md §12: commit hash worked from, every file changed, every command run, anything noticed that was not asked about, anything that contradicts the task file. Claude Code, not you, commits and does close-out; **you run no git command and open no pull request**.

## Do NOT touch
- `artifacts/mockup-sandbox/src/components/HODPortal.tsx`
- `artifacts/mockup-sandbox/src/components/DemoDepartmentCustomizer.tsx`
- `artifacts/mockup-sandbox/src/lib/department-context.tsx`, `artifacts/mockup-sandbox/src/lib/apiClient.ts`
- `artifacts/mockup-sandbox/src/components/ui/*` (use the primitives as they are)
- Anything under `artifacts/api-server/` or `lib/db/` (§6: no schema change, no migration)
- `.env`, and every stash (§1, §10). Never apply, pop or drop a stash.
- No reformatting, renaming or tidying outside `DepartmentSettings.tsx` (§9). Inside it, change only what the Build list requires.
- Any API, route, validation or server change. Every call and body stays byte-for-byte equivalent.
- `isRadiology` matching on department **name** (`DepartmentSettings.tsx:87`), a §5 smell. Keep it exactly as it is; it is recorded as a follow-up, not part of this task.
- The `DemoDepartmentCustomizer` block rendered above the settings (`HODPortal.tsx:732`).
- Every other HOD tab.
- The open "Send HOD email" task (branch `feat/admin-send-hod-welcome-email`). Do not check it out, rebase it or touch it.
- Any `console.log` / `console.error`, or any logging of patient text or leave reasons (§8). Add none; remove the existing `fetchGroups` `console.error`.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- If the rebuild seems to need a new or changed API call, endpoint or request body: stop. That would touch server-side ownership (§3, §14.5).
- Any new department-name- or department-id-based branching (§5, §14.5). The existing `isRadiology` stays as is, and only as it is.
- Any new user-visible wording beyond the fixed list: `Training requirements`, `Section`, the `+ Add …` labels in step 3, `Minimum`, `Days`, `Add sub-type`, `Could not load procedure groups.`, `Retry`. Every other string must be an existing one, kept verbatim (§7).
- Any mock, placeholder or fallback number or list shown when a call fails (§7). A failed call shows a visible error state.
- Any change to a code path enforcing the §3 or §4 boundary, any migration, backfill, deploy, or other irreversible step.
- Any secret, credential or `.env` value (§10, §13).
- Anything that turns this into more than one feature (§9): noticed-but-unasked items go in `HANDOFF.md`, not the diff.
- Any value you would otherwise guess or invent.

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per file, and why
- Anything you skipped, and why (including any step you could not do because it would have
  required a shell command)
- Anything you expanded beyond the Build list, and why
- Anything you noticed that was not asked about (do not act on it)
- Anything that contradicts `CURRENT_TASK.md` or `AGENTS.md`
- For the `## Verification` items: state plainly that you ran none, because you have no shell; Claude Code runs them.
- A `Commands run` section. Copy this in verbatim for the part Claude Code did before dispatch, then add "Antigravity: none (no shell access)":
  - `git status --short` (clean apart from the expected untracked files: `.agents/runs/dispatch-71..75`, `.agy-jobs/`, `CURRENT_TASK.md`, `HANDOFF.md`)
  - `git stash list` (six stashes present, none touched)
  - `git checkout main`
  - `git pull origin main` (fast-forward `50357dd` → `a5d0feb`; `DepartmentSettings.tsx` unchanged by those commits)
  - `git log --oneline -5` (head: `a5d0feb Merge pull request #109 from Gotham28/codex/faculty-system-password`)
  - `git checkout -b feat/hod-requirements-layout`

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.

## Model
`Claude Sonnet 4.6 (Thinking)`


## Files you may touch
- artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx
- .agents/runs/handoff-admin-send-hod-welcome-email.md
- HANDOFF.md