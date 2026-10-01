# Antigravity dispatch 77 — HOD Requirements layout: send-back (typecheck errors, PATCH body parity, HANDOFF accuracy)

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root (there is no
`.agents/CURRENT_TASK.md`; `AGENTS.md` is also at the repository root), dated 2026-10-01, base
commit `a5d0feb`, working branch `feat/hod-requirements-layout` (already checked out). This is a
follow-up to dispatch 76 (`.agents/runs/dispatch-76-hod-requirements-layout.md`). If this is not that
repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

This means you cannot run `pnpm typecheck`, `pnpm build`, `git grep` or `git diff`. Claude Code
re-runs typecheck, build and the parity checks after you finish. Write careful, type-correct code
by reading the types the file already uses.

## Read first
- `AGENTS.md` (repository root) — §3, §5, §7, §9, §14.5.
- `CURRENT_TASK.md` (repository root) — the confirmed scope (Agent steps 3 and 5 matter here).
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` — the file as dispatch 76 left it.
- `HANDOFF.md` (repository root) — what dispatch 76 reported.

## Build
Claude Code ran `pnpm --filter @workspace/mockup-sandbox run typecheck` after dispatch 76. It fails
with exactly these five errors, all in `DepartmentSettings.tsx`. The build (`vite build`) succeeds.

```
src/components/DepartmentSettings.tsx(190,34): error TS2345: Argument of type '{ id: number; name: string; group: string; required: number; }[] | CatalogItem[]' is not assignable to parameter of type '{ id: number; name: string; group: string; required: number; }[]'.
  Type 'CatalogItem[]' is not assignable to type '{ id: number; name: string; group: string; required: number; }[]'.
    Property 'group' is missing in type 'CatalogItem' but required in type '{ id: number; name: string; group: string; required: number; }'.
src/components/DepartmentSettings.tsx(494,57): error TS18047: 'deleteTarget' is possibly 'null'.
src/components/DepartmentSettings.tsx(496,26): error TS18047: 'deleteTarget' is possibly 'null'.
src/components/DepartmentSettings.tsx(496,55): error TS18047: 'deleteTarget' is possibly 'null'.
src/components/DepartmentSettings.tsx(496,140): error TS18047: 'deleteTarget' is possibly 'null'.
```

- [ ] **Fix 1 (line 190):** `useSearch(activeSection.items, searchQuery)` — the `useSearch` hook's parameter type only accepts the procedure-shaped item. Make the hook generic over the minimum shape it actually reads (view its body to see which fields it uses, most likely just `name`), e.g. `<T extends { name: string }>`, and make it return `T[]`. **Type-only change: the hook's runtime behaviour must not change.** Do not widen anything with `any` unless the file already does the same at that spot.
- [ ] **Fix 2 (lines 494 and 496):** `deleteTarget` is `... | null`. In the condition at line 494, check `deleteTarget` itself before reading `.count` (for example `deleteTarget && deleteTarget.count !== null && deleteTarget.count > 0`) so that TypeScript narrows it inside the branch. Same rendered output for every non-null case; every string stays verbatim (`Checking usage failed.`, `Checking usage...`, the usage-count sentence, `No student records currently use this option. Delete?`). Re-check lines 503 and 517-518 for the same pattern and make them type-safe the same way if needed.
- [ ] **Fix 3 (PATCH body parity, `patchItem`, around line 144):** the task requires every call body to stay byte-for-byte equivalent to the old code. The old catalog PATCH body was `{ required, period: item.period }`, always including the `period` key. The new code sends `...(kind !== 'procedure' && period ? { period } : {})`, which omits `period` whenever it is falsy (for example an empty string). Change it so a catalog item always sends the `period` key as before and a procedure sends only `{ required }`: for example `...(kind !== 'procedure' ? { period } : {})`. Do not change the URL, the `Number(...)` conversion, or the success toasts. Do not touch the POST bodies (they were checked and match).
- [ ] **Fix 4 (`HANDOFF.md`, rewrite the inaccurate parts):** dispatch 76's handoff has errors. Overwrite `HANDOFF.md` so that it is accurate, keeping everything that is still true:
  - Under "Expanded beyond scope" it says "None". That is wrong: a file `scratch/generate_settings.py` was created. It was not on the Build list, is outside the allowed paths, and is an unfinished generator draft. State this plainly under "Expanded beyond scope" with the path, say you cannot delete it (no shell), and say the developer must delete it by hand before commit. **Do not create, edit or overwrite any file under `scratch/`.**
  - Under "Unprompted observations" the bullet "Empty States Wording … was adjusted slightly" is vague. Replace it with a concrete statement: view the file and list, with line numbers, exactly where each "No … configured." empty-state string and each `No matches for` string is rendered, and say whether any of them differs from the wording listed in `CURRENT_TASK.md` Agent step 3-4 and step 5. If any differs, say which and how. If none differs, say so.
  - Add a section "Dispatch 77 (send-back)" listing Fixes 1-3 with the new file:line for each.
  - Keep the "Commands run" section as it is, and add "Antigravity dispatch 77: none (no shell access)".
  - State plainly that you ran no verification (no shell); Claude Code re-runs typecheck and build.

## Do NOT touch
- Every file other than `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` and `HANDOFF.md`.
- Specifically: `artifacts/mockup-sandbox/src/components/HODPortal.tsx`, `DemoDepartmentCustomizer.tsx`, `src/lib/*`, `src/components/ui/*`, anything under `artifacts/api-server/` or `lib/db/`, `.env`, `scratch/*`, `.agents/runs/*`, `CURRENT_TASK.md`, `AGENTS.md`.
- Inside `DepartmentSettings.tsx`: change only what Fixes 1-3 require. No layout, wording, state or structure changes, no tidying, no renaming (§9). In particular keep `isRadiology` exactly as it is.
- No new user-visible wording of any kind (§7), no `console.log` / `console.error`, no logging of patient text or leave reasons (§8).
- Any API call, endpoint or request body other than the one `patchItem` correction in Fix 3.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- If a fix seems to need a new or changed API call, endpoint or request body beyond Fix 3: stop (§3, §14.5).
- Any new department-name- or department-id-based branching (§5, §14.5).
- Any new wording beyond the fixed list in `CURRENT_TASK.md` `## Flags` §7.
- Any mock, placeholder or fallback number or list shown when a call fails (§7).
- Any change to a code path enforcing the §3 or §4 boundary, any migration, backfill, deploy, or other irreversible step.
- Any secret, credential or `.env` value (§10, §13).
- Anything that turns this into more than the four fixes (§9): noticed-but-unasked items go in `HANDOFF.md`, not the diff.
- Any value you would otherwise guess or invent.

## Report
Update `HANDOFF.md` at the repo root as described in Fix 4. A claim without file:line evidence is
recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)` — `Claude Sonnet 4.6 (Thinking)` is quota-blocked until about 2026-10-02 (dispatch 76's first attempt was refused with `RESOURCE_EXHAUSTED`).
