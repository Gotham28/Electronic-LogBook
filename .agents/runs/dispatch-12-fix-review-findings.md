# Antigravity dispatch 12 — Admin dashboard frontend: fix Critical review findings

## Guard
This prompt is for the project at `Electronic-LogBook` (Arogya Electronic LogBook), task file
`CURRENT_TASK.md` at the repo root. If this is not that repo, stop, say which repo this is,
and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Context — why this dispatch exists
A formal 4-lens code review found two Critical bugs in the admin dashboard frontend built by
the previous two dispatches. This dispatch fixes exactly those two bugs. It is not a
re-scope; do not change anything else.

## Read first
- `artifacts/mockup-sandbox/src/App.tsx` — the file you will restructure.
- `artifacts/mockup-sandbox/src/lib/department-context.tsx` — read-only, to understand why
  the current structure breaks (see Critical #1 below). Do NOT modify this file.
- `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx` — the file you will revert.
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` — the file you will edit for
  both fixes.

## Critical #1 — the admin console is currently unreachable

`App.tsx` wraps every role, including Admin, in `<DepartmentProvider departmentId={...}>`.
Admin accounts are provisioned with `departmentId: null` by design (confirmed in
`artifacts/api-server/src/provision-admin.ts` and `artifacts/api-server/src/routes/auth.ts`).
`DepartmentProvider` (`department-context.tsx`) never resolves and never renders `children`
when `departmentId` is falsy — it shows a permanent "Your account has no department" screen
instead. `AppLayout` also unconditionally calls `useDepartment()` internally, which throws
outside a resolved `DepartmentProvider`. Widening `DepartmentProvider`/`useDepartment()` to
tolerate a null department was considered and rejected — `useDepartment()` is called from 6
other files across the app (including `HODPortal.tsx`, which this task forbids editing), so
that fix has real regression risk to other roles. The approved fix instead gives Admin its
own standalone rendering path that never touches `DepartmentProvider` or `AppLayout` at all.

### Fix, in `App.tsx`:
1. Add a new early-return branch for the admin case, placed alongside the existing early
   returns (the unauthenticated-user branch, and the `/print` branch) — i.e. BEFORE the
   `<DepartmentProvider>` return block, not inside it. Base it directly on
   `currentUser?.role === "admin"` (not on the `activeRole`/`RoleType` derivation — Admin
   should not go through that system at all after this fix).
2. That branch renders `<AdminPortal onSignOut={...} />` plus a `<Toaster position="top-right"
   richColors />` — mounting a `Toaster` here is required: normally `AppLayout` provides one
   internally (see `AppLayout.tsx`, its own `<Toaster/>` render), but Admin no longer renders
   `AppLayout`, so every `toast.*` call already inside `AdminPortal.tsx` would otherwise
   silently do nothing.
3. Build the `onSignOut` handler using the exact same logic the existing `AppLayout` call site
   already uses a few lines below (in the `<AppLayout onSignOut={...}>` prop): call
   `POST /api/auth/logout` via `apiPost` (already imported in this file), swallow its error,
   then `clearSession()`, then `setIsAuthenticated(false)`.
4. Remove the now-dead `if (currentUser?.role === "admin") return "Admin";` line from the
   `activeRole` derivation (Admin never reaches that code anymore) and remove the
   `{activeRole === "Admin" && (<AdminPortal />)}` block from inside `AppLayout`'s children
   (also now dead and unreachable).
5. Keep the `import { AdminPortal } from "@/components/AdminPortal";` import — it's still used
   by the new standalone branch.

### Fix, in `AppLayout.tsx`:
Revert this file's three admin-specific changes back to their original state — Admin no
longer renders through this component at all, so these are now dead code:
1. Revert `export type RoleType` back to `"Student" | "Faculty" | "HOD"` (remove `"Admin"`).
2. Remove the `if (role === "Admin") { return [...] }` branch you added to
   `navigationForRole()`.
3. Revert both `activeRole === "Admin" ? "College Administration" : ...` /
   `activeRole === "Admin" ? "Admin Console" : ...` ternaries back to their original
   unconditional form (`Department of {department.name}` and `Resident Training Record`
   respectively) in both the app header and the print header.

### Fix, in `AdminPortal.tsx`:
Add an `onSignOut: () => void` prop to the `AdminPortal` component's signature, and render a
small "Sign out" button in its existing topbar (next to the "+ New department" button is a
natural spot) that calls it.

## Critical #2 — fake zero counts on a failed roster fetch

In `AdminPortal.tsx`'s `fetchDepartments()`, the `Promise.all` over each department's roster
fetch currently does:
```js
try {
   return { id: d.id, roster: await getAdminDepartmentRoster(d.id) };
} catch (e) {
   return { id: d.id, roster: [] };
}
```
An empty roster on failure is indistinguishable from a genuinely empty department — every
count derived from it (the summary tiles, the per-department faculty/resident counts in the
list) silently shows `0`, with no error trace at all. `AGENTS.md` §7 forbids this pattern by
name: "a dashboard that quietly shows 0 when the fetch threw is worse than a dashboard that
shows nothing."

### Fix:
Track which departments' roster fetch actually failed (e.g. a `Set<number>` or a `failed:
boolean` field per entry, alongside the existing `deptCounts` map — your judgement on the
exact shape). Wherever a count for a department is displayed and that department's fetch
failed, show a distinct visible indicator instead of a bare `0` — e.g. a small warning icon
or "—" with a tooltip/title like "Couldn't load this department's counts", not a number that
could be mistaken for a real zero. This applies both to the per-department rows in the
department list (`facultyCount`/`residentCount` display) and, if a failure affects the
aggregate summary tiles' totals, those totals should also not silently present as fully
accurate — your judgement on the clearest way to convey partial-failure at the tile level
(e.g. the tile could show the partial total with a small "partial data" note, or you may
decide the cleanest approach is different — the requirement is only that a failure is never
indistinguishable from a real zero anywhere on this page). Do not make one department's fetch
failure crash or block the rest of the page from rendering — every department that succeeded
should still show its real counts.

## Do NOT touch
- `artifacts/api-server/**` — the entire backend.
- `HODPortal.tsx`, `ProfessorPortal.tsx`, `DepartmentSettings.tsx`, `Dashboard.tsx`,
  `LoginPage.tsx` — do not touch.
- `artifacts/mockup-sandbox/src/lib/department-context.tsx` — read-only, do not modify. This
  is exactly the file whose wider blast radius this fix is designed to avoid touching.
- `artifacts/mockup-sandbox/src/lib/apiClient.ts` — no changes needed for either fix.
- `.env` / `.env.example`.
- Anything about layout, visual design, or behavior not named above.
- Any shell command whatsoever.

## Hard stops — stop and report, do not decide
- Any change to `artifacts/api-server/**` or `department-context.tsx`.
- Any value you would otherwise guess or invent.

## Report
Overwrite `HANDOFF.md` at the repo root (title it "Dispatch 12 — Admin dashboard frontend:
fix Critical review findings"):
- What changed, per file, and why — confirm explicitly that Admin no longer renders through
  `DepartmentProvider`/`AppLayout`, and that `AppLayout.tsx`'s three admin-specific changes
  were fully reverted.
- Anything you skipped, and why.
- Anything you expanded beyond this Build list, and why.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.
