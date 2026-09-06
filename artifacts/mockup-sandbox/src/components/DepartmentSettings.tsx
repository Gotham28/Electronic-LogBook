import * as React from "react";
import { toast } from "sonner";
import { apiPost, apiPatch } from "@/lib/apiClient";
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

  async function save(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await operation(); await data.refresh(); toast.success(message); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not save settings"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <p className="text-sm text-slate-500">Configure training for {data.department.name}. An empty optional allowance or duration means it has not been configured.</p>
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
          </form>)}
        </div>
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Postings and academic activities</CardTitle></CardHeader><CardContent className="space-y-6">
      <form className="grid items-end gap-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void save(async () => {
        await apiPost("/api/admin/department/catalog", { ...entry, value: entry.name.trim(), required: entry.kind === "posting" ? 0 : Number(entry.required) });
        setEntry({ ...entry, name: "", required: "" });
      }, "Training option added"); }}>
        <div className="space-y-2"><Label htmlFor="catalog-kind">Category</Label><select id="catalog-kind" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}><option value="posting">Posting / rotation</option><option value="academic">Academic activity</option></select></div>
        <div className="space-y-2"><Label htmlFor="catalog-name">Name</Label><Input id="catalog-name" required maxLength={160} value={entry.name} onChange={(e) => setEntry({ ...entry, name: e.target.value })} /></div>
        {entry.kind === "academic" && <><div className="space-y-2"><Label htmlFor="catalog-required">Required count</Label><Input id="catalog-required" type="number" min={0} max={100000} required value={entry.required} onChange={(e) => setEntry({ ...entry, required: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="catalog-period">Period</Label><select id="catalog-period" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={entry.period} onChange={(e) => setEntry({ ...entry, period: e.target.value })}><option value="total">Overall</option><option value="month">Per month</option></select></div></>}
        <Button disabled={busy} type="submit">Add training option</Button>
      </form>
      <div className="grid gap-6 md:grid-cols-2"><section><h3 className="font-semibold">Postings / rotations</h3>{!data.postings.length && <p className="mt-2 text-sm text-slate-500">No postings configured.</p>}
        <ul className="mt-2 space-y-2 text-sm">{data.postings.map((item) => <li key={item.id} className="rounded-xl bg-slate-50 p-3">{item.name}</li>)}</ul></section>
        <section><h3 className="font-semibold">Academic activities</h3>{!data.academics.length && <p className="mt-2 text-sm text-slate-500">No academic activities configured.</p>}
          {data.academics.map((item) => <form key={item.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(academicTargets[item.id] ?? item.required), period: item.period }), "Academic target updated"); }}>
            <span className="flex-1 text-sm">{item.name} ({item.period === "month" ? "per month" : "overall"})</span><Input className="w-24" type="number" min={0} max={100000} required aria-label={`Required count for ${item.name}`} value={academicTargets[item.id] ?? item.required} onChange={(e) => setAcademicTargets({ ...academicTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
          </form>)}
        </section></div>
    </CardContent></Card>
  </div>;
}
