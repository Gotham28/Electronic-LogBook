# HANDOFF — Dispatch 49: Department Requirements card fully view-only

## File changed
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx`

---

## Exact diff

```diff
--- a/artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx
+++ b/artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx
@@ -11,16 +11,13 @@
-const computedFields = [
+const allRequirementsFields = [
   ["requiredCases", "Required clinical cases (computed)"],
   ["requiredProcedures", "Required procedures (computed)"],
   ["requiredAcademic", "Required academic activities (computed)"],
-] as const;
-
-const editableFields = [
-  ["programDurationMonths", "Program duration (months)", true],
-  ["casualLeaveAllowance", "Casual leave allowance (days)", true],
-  ["academicLeaveAllowance", "Academic leave allowance (days)", true],
+  ["programDurationMonths", "Program duration (months)"],
+  ["casualLeaveAllowance", "Casual leave allowance (days)"],
+  ["academicLeaveAllowance", "Academic leave allowance (days)"],
 ] as const;

@@ -92,7 +89,6 @@
 export function DepartmentSettings() {
   const data = useDepartment();
-  const [config, setConfig] = React.useState<Record<string, string>>(() => Object.fromEntries(editableFields.map(([key]) => [key, data.config?.[key]?.toString() ?? ""])));
   const [procedure, setProcedure] = React.useState({ name: "", group: "", required: "" });

@@ -203,17 +198,10 @@
     <div className="grid gap-6 lg:grid-cols-2">
       <Card><CardHeader><CardTitle>Department requirements</CardTitle></CardHeader><CardContent>
-        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(() => apiPost("/api/admin/department/config",
-          Object.fromEntries(editableFields.map(([key, _label, optional]) => [key, optional && config[key] === "" ? null : Number(config[key])]))), "Department requirements saved"); }}>
-          {computedFields.map(([key, label]) => <div className="space-y-2" key={key}><Label>{label}</Label>
+        <div className="space-y-4">
+          {allRequirementsFields.map(([key, label]) => <div className="space-y-2" key={key}><Label>{label}</Label>
             <p className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">{data.config?.[key] ?? 0}</p></div>)}
-          {editableFields.map(([key, label, optional]) => <div className="space-y-2" key={key}><Label htmlFor={`config-${key}`}>{label}</Label>
-            <Input id={`config-${key}`} type="number" step="1" min={key === "programDurationMonths" ? 1 : 0} max={key === "programDurationMonths" ? 240 : 100000}
-              required={!optional} value={config[key]} onChange={(e) => setConfig({ ...config, [key]: e.target.value })} /></div>)}
-          <Button disabled={busy} type="submit">Save requirements</Button>
-        </form>
+        </div>
       </CardContent></Card>
```

---

## `apiPost` import status

**Present and used.** Line 3 of the file still imports `apiPost`:

```ts
import { apiPost, apiPatch, apiGet, apiDelete } from "@/lib/apiClient";
```

`apiPost` is called in two remaining places:
1. **"Add procedure type" form** (~line 211): `apiPost("/api/admin/department/procedures", ...)`
2. **"Training Catalog" form** (~line 236): `apiPost("/api/admin/department/catalog", ...)`

The import was not touched. No other imports were changed.

---

## What was done

| Step | Action |
|---|---|
| Arrays | Merged `computedFields` (3 entries) and `editableFields` (3 entries) into `allRequirementsFields` (6 entries). The `(computed)` suffix is kept only on `requiredCases`, `requiredProcedures`, `requiredAcademic`. The three previously editable fields keep their plain labels: "Program duration (months)", "Casual leave allowance (days)", "Academic leave allowance (days)". |
| State | Removed `config`/`setConfig` React state (was only used by the deleted form). |
| Card | Replaced the `<form>` (with `<Input>` fields and "Save requirements" `<Button>`) with a plain `<div className="space-y-4">` that maps `allRequirementsFields` using the exact read-only pattern (`<Label>` + `<p className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">`). |

---

## What was NOT touched

- Backend routes (`admin.ts`, `validation.ts`, `department-requirements.ts`) — untouched.
- "Add procedure type" card — untouched.
- "Training Catalog" card — untouched.
- `apiPost` import — retained.
- No other files were modified.
