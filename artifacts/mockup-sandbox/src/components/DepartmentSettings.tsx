import * as React from "react";
import { toast } from "sonner";
import { apiPost, apiPatch, apiGet, apiDelete } from "@/lib/apiClient";
import { Trash2, AlertTriangle } from "lucide-react";
import { useDepartment } from "@/lib/department-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const configFields = [
  ["requiredCases", "Required clinical cases", false], ["requiredProcedures", "Required procedures", false],
  ["requiredAcademic", "Required academic activities", false], ["programDurationMonths", "Program duration (months)", true],
  ["casualLeaveAllowance", "Casual leave allowance (days)", true], ["academicLeaveAllowance", "Academic leave allowance (days)", true],
] as const;

export function DepartmentSettings() {
  const data = useDepartment();
  const [config, setConfig] = React.useState<Record<string, string>>(() => Object.fromEntries(configFields.map(([key]) => [key, data.config?.[key]?.toString() ?? ""])));
  const [procedure, setProcedure] = React.useState({ name: "", group: "", required: "" });
  const [entry, setEntry] = React.useState({ kind: "posting", name: "", required: "", period: "total" });
  const [busy, setBusy] = React.useState(false);
  const [targets, setTargets] = React.useState<Record<number, string>>({});
  const [academicTargets, setAcademicTargets] = React.useState<Record<number, string>>({});

  const [deleteTarget, setDeleteTarget] = React.useState<{id: number, type: "procedure" | "posting" | "academic" | "case_category" | "competency_level", name: string, count: number | null} | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const confirmDelete = async (id: number, type: "procedure" | "posting" | "academic" | "case_category" | "competency_level", name: string) => {
    setDeleteTarget({ id, type, name, count: null });
    setDeleteError(null);
    try {
      const endpoint = type === "procedure" ? `/api/admin/department/procedures/${id}/usage-count` : `/api/admin/department/catalog/${id}/usage-count`;
      const res = await apiGet<{ count: number }>(endpoint);
      setDeleteTarget({ id, type, name, count: res.count });
    } catch (err: any) {
      setDeleteError(err.message || "Failed to get usage count");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const endpoint = deleteTarget.type === "procedure" ? `/api/admin/department/procedures/${deleteTarget.id}` : `/api/admin/department/catalog/${deleteTarget.id}`;
      await apiDelete(endpoint);
      toast.success(`${deleteTarget.name} deleted successfully`);
      try {
        await data.refresh();
      } catch (err: any) {
        toast.warning("Deleted, but the list may be out of date \u2014 refresh the page");
      }
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  async function save(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await operation(); await data.refresh(); toast.success(message); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not save settings"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <p className="text-sm text-slate-500">Configure training for {data.department.name}. An empty optional allowance or duration means it has not been configured.</p>
    
    {deleteTarget && (
      <Card className="border-rose-200 bg-rose-50/30 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100">
              <AlertTriangle className="h-4 w-4 text-rose-700" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h4 className="font-semibold text-rose-900">Delete {deleteTarget.name}?</h4>
                {deleteTarget.count === null ? (
                  deleteError ? (
                    <p className="text-sm text-rose-800 mt-1 leading-relaxed">Checking usage failed.</p>
                  ) : (
                    <p className="text-sm text-rose-800 mt-1 leading-relaxed animate-pulse">Checking usage...</p>
                  )
                ) : deleteTarget.count > 0 ? (
                  <p className="text-sm text-rose-800 mt-1 leading-relaxed">
                    {deleteTarget.count} student {deleteTarget.count === 1 ? 'record currently uses' : 'records currently use'} '{deleteTarget.name}'. Deleting it will not affect those existing records, but it will be removed from the dropdown for future entries. Delete anyway?
                  </p>
                ) : (
                  <p className="text-sm text-rose-800 mt-1 leading-relaxed">
                    No student records currently use this option. Delete?
                  </p>
                )}
              </div>
              {deleteError && (
                <div className="p-3 bg-rose-100 border border-rose-300 rounded-md text-sm text-rose-900 font-medium">
                  {deleteError}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
                  Cancel
                </Button>
                {deleteTarget.count === null && deleteError ? (
                  <Button type="button" onClick={() => confirmDelete(deleteTarget.id, deleteTarget.type, deleteTarget.name)} className="bg-rose-600 hover:bg-rose-700 text-white">
                    Try again
                  </Button>
                ) : (
                  <Button
                    onClick={handleDelete}
                    disabled={deleting || deleteTarget.count === null}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )}

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Department requirements</CardTitle></CardHeader><CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(() => apiPost("/api/admin/department/config",
          Object.fromEntries(configFields.map(([key, _label, optional]) => [key, optional && config[key] === "" ? null : Number(config[key])]))), "Department requirements saved"); }}>
          {configFields.map(([key, label, optional]) => <div className="space-y-2" key={key}><Label htmlFor={`config-${key}`}>{label}</Label>
            <Input id={`config-${key}`} type="number" step="1" min={key === "programDurationMonths" ? 1 : 0} max={key === "programDurationMonths" ? 240 : 100000}
              required={!optional} value={config[key]} onChange={(e) => setConfig({ ...config, [key]: e.target.value })} /></div>)}
          <Button disabled={busy} type="submit">Save requirements</Button>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Add procedure type</CardTitle></CardHeader><CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(async () => {
          await apiPost("/api/admin/department/procedures", { ...procedure, required: Number(procedure.required) });
          setProcedure({ name: "", group: "", required: "" });
        }, "Procedure type added"); }}>
          <div className="space-y-2"><Label htmlFor="procedure-name">Procedure name</Label><Input id="procedure-name" required maxLength={160} value={procedure.name} onChange={(e) => setProcedure({ ...procedure, name: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="procedure-group">Group</Label><Input id="procedure-group" required maxLength={160} value={procedure.group} onChange={(e) => setProcedure({ ...procedure, group: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="procedure-required">Required count</Label><Input id="procedure-required" type="number" required min={0} max={100000} value={procedure.required} onChange={(e) => setProcedure({ ...procedure, required: e.target.value })} /></div>
          <Button disabled={busy} type="submit">Add procedure type</Button>
        </form>
        <div className="mt-6 space-y-3">{!data.procedures.length && <p className="text-sm text-slate-500">No procedure types configured.</p>}
          {data.procedures.map((p) => <form key={p.id} className="flex flex-wrap items-end gap-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/procedures/${p.id}`, { required: Number(targets[p.id] ?? p.required) }), "Procedure target updated"); }}>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.group}</p></div>
            <Input aria-label={`Required count for ${p.name}`} className="w-24" type="number" min={0} max={100000} required value={targets[p.id] ?? p.required} onChange={(e) => setTargets({ ...targets, [p.id]: e.target.value })} />
            <Button variant="outline" size="sm" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(p.id, "procedure", p.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>)}
        </div>
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Training Catalog</CardTitle></CardHeader><CardContent className="space-y-6">
      <form className="grid items-end gap-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void save(async () => {
        await apiPost("/api/admin/department/catalog", { ...entry, value: entry.name.trim(), required: entry.kind === "posting" ? 0 : Number(entry.required) });
        setEntry({ ...entry, name: "", required: "" });
      }, "Training option added"); }}>
        <div className="space-y-2"><Label htmlFor="catalog-kind">Category</Label><select id="catalog-kind" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}><option value="posting">Posting / rotation</option><option value="academic">Academic activity</option><option value="case_category">Case Category</option><option value="competency_level">Experience level</option></select></div>
        <div className="space-y-2"><Label htmlFor="catalog-name">Name</Label><Input id="catalog-name" required maxLength={160} value={entry.name} onChange={(e) => setEntry({ ...entry, name: e.target.value })} /></div>
        {(entry.kind === "academic" || entry.kind === "case_category") && <><div className="space-y-2"><Label htmlFor="catalog-required">Required count</Label><Input id="catalog-required" type="number" min={0} max={100000} required value={entry.required} onChange={(e) => setEntry({ ...entry, required: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="catalog-period">Period</Label><select id="catalog-period" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={entry.period} onChange={(e) => setEntry({ ...entry, period: e.target.value })}><option value="total">Overall</option><option value="month">Per month</option></select></div></>}
        <Button disabled={busy} type="submit">Add training option</Button>
      </form>
      <div className="grid gap-6 md:grid-cols-2"><section><h3 className="font-semibold">Postings / rotations</h3>{!data.postings.length && <p className="mt-2 text-sm text-slate-500">No postings configured.</p>}
        <ul className="mt-2 space-y-2 text-sm">{data.postings.map((item) => <li key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><span className="flex-1">{item.name}</span><Button variant="ghost" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "posting", item.name)} className="text-rose-700 hover:bg-rose-100 h-8 w-8 p-0"><Trash2 className="h-4 w-4" /></Button></li>)}</ul></section>
        <section><h3 className="font-semibold">Academic activities</h3>{!data.academics.length && <p className="mt-2 text-sm text-slate-500">No academic activities configured.</p>}
          {data.academics.map((item) => <form key={item.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(academicTargets[item.id] ?? item.required), period: item.period }), "Academic target updated"); }}>
            <span className="flex-1 text-sm">{item.name} ({item.period === "month" ? "per month" : "overall"})</span><Input className="w-24" type="number" min={0} max={100000} required aria-label={`Required count for ${item.name}`} value={academicTargets[item.id] ?? item.required} onChange={(e) => setAcademicTargets({ ...academicTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "academic", item.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>)}
        </section></div>
      <div className="grid gap-6 md:grid-cols-2 mt-8 pt-8 border-t">
        <section><h3 className="font-semibold">Case Categories</h3>{!data.caseCategories?.length && <p className="mt-2 text-sm text-slate-500">No case categories configured.</p>}
          {data.caseCategories?.map((item) => <form key={item.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(academicTargets[item.id] ?? item.required), period: item.period }), "Case target updated"); }}>
            <span className="flex-1 text-sm">{item.name}</span><Input className="w-16" type="number" min={0} max={100000} required aria-label={`Required count for ${item.name}`} value={academicTargets[item.id] ?? item.required} onChange={(e) => setAcademicTargets({ ...academicTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "case_category", item.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>)}
        </section>
        <section><h3 className="font-semibold">Experience levels</h3>{!data.competencyLevels.length && <p className="mt-2 text-sm text-slate-500">No experience levels configured.</p>}
          <ul className="mt-2 space-y-2 text-sm">{data.competencyLevels.map((item) => <li key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><span className="flex-1">{item.name}</span><Button variant="ghost" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "competency_level", item.name)} className="text-rose-700 hover:bg-rose-100 h-8 w-8 p-0"><Trash2 className="h-4 w-4" /></Button></li>)}</ul></section>
      </div>
    </CardContent></Card>
  </div>;
}
