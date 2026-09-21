import * as React from "react";
import { toast } from "sonner";
import { apiPost, apiPatch, apiGet, apiDelete } from "@/lib/apiClient";
import { Trash2, AlertTriangle, ChevronDown, Search, SlidersHorizontal, ClipboardList, LibraryBig } from "lucide-react";
import { useDepartment } from "@/lib/department-context";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const computedRequirementsFields = [
  ["requiredCases", "Required clinical cases (computed)"],
  ["requiredProcedures", "Required procedures (computed)"],
  ["requiredAcademic", "Required academic activities (computed)"],
] as const;

// Lists longer than this start collapsed and get a search box when expanded.
const COLLAPSE_THRESHOLD = 5;

function SearchableSection<T extends { id: number; name: string }>({
  title, items, emptyText, renderItem,
}: {
  title: string;
  items: T[];
  emptyText: string;
  renderItem: (item: T) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(() => items.length <= COLLAPSE_THRESHOLD);
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items;
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm shadow-slate-200/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <span className="flex items-center gap-2 font-semibold">
          <span className="text-sm tracking-tight text-slate-800">{title}</span>
          {items.length > 0 && (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
              {items.length}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {!items.length && <p className="mt-2 px-3 text-sm text-slate-500">{emptyText}</p>}
      {open && items.length > 0 && (
        <div className="mt-2 space-y-2 px-3">
          {items.length > COLLAPSE_THRESHOLD && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${title.toLowerCase()}...`}
                aria-label={`Search ${title}`}
                className="pl-9"
              />
            </div>
          )}
          {visible.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">No matches for &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <>
              {q && (
                <p className="text-xs text-slate-500">
                  Showing {visible.length} of {items.length}
                </p>
              )}
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1 text-sm">
                {visible.map((item) => <li key={item.id}>{renderItem(item)}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function DepartmentSettings() {
  const data = useDepartment();
  const [procedure, setProcedure] = React.useState({ name: "", group: "", required: "" });
  const [entry, setEntry] = React.useState({ kind: "posting", name: "", required: "", period: "total" });
  const [busy, setBusy] = React.useState(false);
  const [targets, setTargets] = React.useState<Record<number, string>>({});
  const [academicTargets, setAcademicTargets] = React.useState<Record<number, string>>({});
  const [leaveTargets, setLeaveTargets] = React.useState<Record<number, string>>({});

  const [deleteTarget, setDeleteTarget] = React.useState<{id: number, type: "procedure" | "posting" | "academic" | "case_category" | "competency_level" | "leave_type", name: string, count: number | null} | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const confirmDelete = async (id: number, type: "procedure" | "posting" | "academic" | "case_category" | "competency_level" | "leave_type", name: string) => {
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
        toast.warning("Deleted, but the list may be out of date — refresh the page");
      }
      setDeleteTarget(null);
    } catch (err: any) {
      if (err?.message?.includes("cannot be removed")) {
        setDeleteError(err.message);
      } else {
        setDeleteError(err.message || "Failed to delete");
      }
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
    <div className="relative overflow-hidden rounded-3xl border border-teal-100 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 px-6 py-7 text-white shadow-lg shadow-slate-200/60 sm:px-8">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-400/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-300"><SlidersHorizontal className="h-4 w-4" /> Department setup</div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Training references</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Keep {data.department.name} requirements, procedures, and catalog options in one clear place.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
          <LibraryBig className="h-5 w-5 text-teal-300" />
          <div><p className="text-[11px] uppercase tracking-wider text-slate-400">Active department</p><p className="text-sm font-semibold">{data.department.name}</p></div>
        </div>
      </div>
    </div>

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

    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <Card className="border-slate-200/80 shadow-sm shadow-slate-200/50"><CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-4"><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-teal-600" /> Department requirements</CardTitle><p className="text-xs text-slate-500">Computed from your active configuration</p></CardHeader><CardContent className="p-5">
        <div className="space-y-3">
          {computedRequirementsFields.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="text-sm font-medium text-slate-800">{data.config?.[key] == null ? <span className="text-slate-400 italic">Not tracked</span> : data.config[key]}</span>
          </div>)}
        </div>
      </CardContent></Card>

      <Card className="border-slate-200/80 shadow-sm shadow-slate-200/50"><CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-4"><CardTitle className="text-base">Add procedure type</CardTitle><p className="text-xs text-slate-500">Set the target once, then update it inline below.</p></CardHeader><CardContent className="p-5">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(async () => {
          await apiPost("/api/admin/department/procedures", { ...procedure, required: Number(procedure.required) });
          setProcedure({ name: "", group: "", required: "" });
        }, "Procedure type added"); }}>
          <div className="space-y-2"><Label htmlFor="procedure-name">Procedure name</Label><Input id="procedure-name" required maxLength={160} value={procedure.name} onChange={(e) => setProcedure({ ...procedure, name: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="procedure-group">Group</Label><Input id="procedure-group" required maxLength={160} value={procedure.group} onChange={(e) => setProcedure({ ...procedure, group: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="procedure-required">Required count</Label><Input id="procedure-required" type="number" required min={0} max={100000} value={procedure.required} onChange={(e) => setProcedure({ ...procedure, required: e.target.value })} /></div>
          <Button disabled={busy} type="submit">Add procedure type</Button>
        </form>
        <div className="mt-6 border-t pt-4">
          <SearchableSection
            title="Configured procedure types"
            items={data.procedures}
            emptyText="No procedure types configured."
            renderItem={(p) => <form className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/procedures/${p.id}`, { required: Number(targets[p.id] ?? p.required) }), "Procedure target updated"); }}>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.group}</p></div>
              <Input aria-label={`Required count for ${p.name}`} className="w-24" type="number" min={0} max={100000} required value={targets[p.id] ?? p.required} onChange={(e) => setTargets({ ...targets, [p.id]: e.target.value })} />
              <Button variant="outline" size="sm" disabled={busy} type="submit">Save</Button>
              <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(p.id, "procedure", p.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
            </form>}
          />
        </div>
      </CardContent></Card>
    </div>
    <Card className="border-slate-200/80 shadow-sm shadow-slate-200/50"><CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-4"><CardTitle className="text-base">Training catalog</CardTitle><p className="text-xs text-slate-500">Manage the options residents select while logging their work.</p></CardHeader><CardContent className="space-y-6 p-5">
      <form className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 p-4 grid items-end gap-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void save(async () => {
        await apiPost("/api/admin/department/catalog", { ...entry, value: entry.name.trim(), required: entry.kind === "posting" ? 0 : Number(entry.required) });
        setEntry({ ...entry, name: "", required: "" });
      }, "Training option added"); }}>
        <div className="space-y-2"><Label htmlFor="catalog-kind">Category</Label><select id="catalog-kind" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}><option value="posting">Posting / rotation</option><option value="academic">Academic activity</option><option value="case_category">Case Category</option><option value="competency_level">Experience level</option><option value="leave_type">Leave type</option></select></div>
        <div className="space-y-2"><Label htmlFor="catalog-name">Name</Label><Input id="catalog-name" required maxLength={160} value={entry.name} onChange={(e) => setEntry({ ...entry, name: e.target.value })} /></div>
        {(entry.kind === "academic" || entry.kind === "case_category") && <><div className="space-y-2"><Label htmlFor="catalog-required">Required count</Label><Input id="catalog-required" type="number" min={0} max={100000} required value={entry.required} onChange={(e) => setEntry({ ...entry, required: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="catalog-period">Period</Label><select id="catalog-period" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={entry.period} onChange={(e) => setEntry({ ...entry, period: e.target.value })}><option value="total">Overall</option><option value="month">Per month</option></select></div></>}
        <Button disabled={busy} type="submit">Add training option</Button>
      </form>
      <div className="grid gap-6 md:grid-cols-2">
        <SearchableSection
          title="Postings / rotations"
          items={data.postings}
          emptyText="No postings configured."
          renderItem={(item) => <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
            <span className="flex-1">{item.name}</span>
            <Button variant="ghost" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "posting", item.name)} className="text-rose-700 hover:bg-rose-100 h-8 w-8 p-0"><Trash2 className="h-4 w-4" /></Button>
          </div>}
        />
        <SearchableSection
          title="Academic activities"
          items={data.academics}
          emptyText="No academic activities configured."
          renderItem={(item) => <form className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(academicTargets[item.id] ?? item.required), period: item.period }), "Academic target updated"); }}>
            <span className="flex-1 text-sm">{item.name} ({item.period === "month" ? "per month" : "overall"})</span><Input className="w-24" type="number" min={0} max={100000} required aria-label={`Required count for ${item.name}`} value={academicTargets[item.id] ?? item.required} onChange={(e) => setAcademicTargets({ ...academicTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "academic", item.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>}
        />
      </div>
      <div className="grid gap-6 md:grid-cols-2 mt-8 pt-8 border-t">
        <SearchableSection
          title="Case Categories"
          items={data.caseCategories ?? []}
          emptyText="No case categories configured."
          renderItem={(item) => <form className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(academicTargets[item.id] ?? item.required), period: item.period }), "Case target updated"); }}>
            <span className="flex-1 text-sm">{item.name}</span><Input className="w-16" type="number" min={0} max={100000} required aria-label={`Required count for ${item.name}`} value={academicTargets[item.id] ?? item.required} onChange={(e) => setAcademicTargets({ ...academicTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "case_category", item.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>}
        />
        <SearchableSection
          title="Experience levels"
          items={data.competencyLevels ?? []}
          emptyText="No experience levels configured."
          renderItem={(item) => <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
            <span className="flex-1">{item.name}</span>
            <Button variant="ghost" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "competency_level", item.name)} className="text-rose-700 hover:bg-rose-100 h-8 w-8 p-0"><Trash2 className="h-4 w-4" /></Button>
          </div>}
        />
      </div>
      <div className="grid gap-6 md:grid-cols-2 mt-8 pt-8 border-t">
        <SearchableSection
          title="Leave types"
          items={data.leaveTypes ?? []}
          emptyText="No leave types configured."
          renderItem={(item) => <form className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(leaveTargets[item.id] ?? item.required), period: item.period }), "Leave allowance updated"); }}>
            <span className="flex-1 text-sm">{item.name}</span><Input className="w-16" type="number" min={0} max={365} required aria-label={`Allowance for ${item.name}`} value={leaveTargets[item.id] ?? item.required} onChange={(e) => setLeaveTargets({ ...leaveTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "leave_type", item.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>}
        />
      </div>
    </CardContent></Card>
  </div>;
}
