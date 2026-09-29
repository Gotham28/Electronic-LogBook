import * as React from "react";
import { toast } from "sonner";
import { apiPost, apiPatch, apiGet, apiDelete } from "@/lib/apiClient";
import { Trash2, AlertTriangle, ChevronDown, Search, SlidersHorizontal, ClipboardList, PlusCircle } from "lucide-react";
import { useDepartment } from "@/lib/department-context";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Option types that carry a required count (a minimum residents must log).
const TARGET_KINDS = ["academic", "case_category", "conference_level", "clinical_work_category"];

// Lists longer than this start collapsed and get a search box when expanded.
const COLLAPSE_THRESHOLD = 5;

function SearchableSection<T extends { id: number | string; name: string }>({
  title, items, emptyText, renderItem, defaultOpen
}: {
  title: string;
  items: T[];
  emptyText: string;
  renderItem: (item: T) => React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(() => defaultOpen ?? items.length <= COLLAPSE_THRESHOLD);
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
  const isRadiology = data.department?.name?.toLowerCase().includes("radiology");
  const features = data.config?.enabledFeatures ?? {};
  const procedureTypesEnabled = !features.freeTextProcedures && !features.hideProcedureLogs;
  // What the HOD can add. Every option follows the department's own settings, never its id.
  const addKinds: Array<[string, string]> = [
    ...(procedureTypesEnabled ? [["procedure", "Procedure type"] as [string, string]] : []),
    ["posting", isRadiology ? "Posting" : "Ward / posting"],
    ["academic", "Academic activity"],
    ...(features.clinicalWorks ? [["clinical_work_category", "Clinical work category"], ["clinical_work_subtype", "Clinical work sub-type"]] as Array<[string, string]> : []),
    ...(!features.hideCaseLogs ? [["case_category", "Case category"] as [string, string]] : []),
    ...(!features.hideProcedureLogs ? [["competency_level", "Experience level"] as [string, string]] : []),
    ...(features.conferenceLevels ? [["conference_level", "Conference level"] as [string, string]] : []),
    ["leave_type", "Leave type"],
  ];
  const [entry, setEntry] = React.useState({ kind: addKinds[0][0], name: "", required: "", period: "total", parentValue: "" });
  const [procedureGroup, setProcedureGroup] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [targets, setTargets] = React.useState<Record<number, string>>({});
  const [academicTargets, setAcademicTargets] = React.useState<Record<number, string>>({});
  const [conferenceTargets, setConferenceTargets] = React.useState<Record<number, string>>({});
  const [leaveTargets, setLeaveTargets] = React.useState<Record<number, string>>({});
  const [clinicalTargets, setClinicalTargets] = React.useState<Record<number, string>>({});
  // Clinical work has no stored total; it is the sum of per-category minimums, as the server
  // counts it for completion (clinical-work-progress.ts).
  const clinicalTotal = data.clinicalWorkCategories.filter((item) => item.period === "total").reduce((sum, item) => sum + item.required, 0);
  const totals = [
    ...(!features.hideCaseLogs ? [{ key: "cases", label: "Required clinical cases", value: data.config?.requiredCases }] : []),
    ...(!features.hideProcedureLogs ? [{ key: "procedures", label: "Required procedures", value: data.config?.requiredProcedures }] : []),
    ...(features.clinicalWorks ? [{ key: "clinical", label: "Required clinical work", value: clinicalTotal }] : []),
    { key: "academic", label: "Required academic activities", value: data.config?.requiredAcademic },
  ];
  const [procedureGroups, setProcedureGroups] = React.useState<{id: string, name: string, count: number}[]>([]);
  const [isAddingNewGroup, setIsAddingNewGroup] = React.useState(false);

  const fetchGroups = React.useCallback(() => {
    apiGet<{id: string, name: string, count: number}[]>("/api/admin/department/procedure-groups").then(setProcedureGroups).catch(console.error);
  }, []);

  React.useEffect(() => {
    fetchGroups();
  }, [fetchGroups, data.department.id]);

  const [deleteTarget, setDeleteTarget] = React.useState<{id: number | string, type: "procedure" | "posting" | "academic" | "case_category" | "competency_level" | "leave_type" | "procedure_group" | "conference_level" | "clinical_work_category" | "clinical_work_subtype", name: string, count: number | null} | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const confirmDelete = async (id: number | string, type: "procedure" | "posting" | "academic" | "case_category" | "competency_level" | "leave_type" | "procedure_group" | "conference_level" | "clinical_work_category" | "clinical_work_subtype", name: string) => {
    setDeleteTarget({ id, type, name, count: null });
    setDeleteError(null);
    try {
      const endpoint = type === "procedure" ? `/api/admin/department/procedures/${id}/usage-count` 
        : type === "procedure_group" ? `/api/admin/department/procedure-groups/${encodeURIComponent(id as string)}/usage-count` 
        : `/api/admin/department/catalog/${id}/usage-count`;
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
      const endpoint = deleteTarget.type === "procedure" ? `/api/admin/department/procedures/${deleteTarget.id}` 
        : deleteTarget.type === "procedure_group" ? `/api/admin/department/procedure-groups/${encodeURIComponent(deleteTarget.id as string)}` 
        : `/api/admin/department/catalog/${deleteTarget.id}`;
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
    try { await operation(); await data.refresh(); fetchGroups(); toast.success(message); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not save settings"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <div className="relative overflow-hidden rounded-3xl border border-teal-100 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 px-6 py-7 text-white shadow-lg shadow-slate-200/60 sm:px-8">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-400/15 blur-3xl" />
      <div className="relative">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-300"><SlidersHorizontal className="h-4 w-4" /> Department setup</div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Training references</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Department of {data.department.name}</p>
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

    <Card className="border-teal-200 shadow-sm shadow-teal-100/60">
      <CardHeader className="border-b border-teal-100 bg-teal-50/60 pb-4">
        <div className="flex items-center gap-2"><PlusCircle className="h-4 w-4 text-teal-700" /><CardTitle className="text-base">Add a new log option</CardTitle></div>
        <p className="text-xs text-slate-600">Add something residents can choose while logging. Where it applies, set the minimum they must complete; 0 means it is optional.</p>
      </CardHeader>
      <CardContent className="p-5">
        <form className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void save(async () => {
          if (entry.kind === "procedure") {
            await apiPost("/api/admin/department/procedures", { name: entry.name, group: procedureGroup, required: Number(entry.required) });
            setProcedureGroup("");
            setIsAddingNewGroup(false);
          } else {
            if (entry.kind === "clinical_work_subtype" && !entry.parentValue) throw new Error("Choose the category this sub-type belongs to");
            const { parentValue, ...fields } = entry;
            await apiPost("/api/admin/department/catalog", { ...fields, value: entry.name.trim(), required: TARGET_KINDS.includes(entry.kind) ? Number(entry.required) : 0,
              ...(entry.kind === "clinical_work_subtype" ? { parentValue } : {}) });
          }
          setEntry({ ...entry, name: "", required: "" });
        }, entry.kind === "procedure" ? "Procedure type added" : "Log option added"); }}>
          <div className="space-y-2"><Label htmlFor="catalog-kind">Type</Label><select id="catalog-kind" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value, required: "" })}>{addKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          {entry.kind === "clinical_work_subtype" && <div className="space-y-2"><Label htmlFor="catalog-parent">Belongs to</Label><select id="catalog-parent" required className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={entry.parentValue} onChange={(e) => setEntry({ ...entry, parentValue: e.target.value })}><option value="">Select a category</option>{data.clinicalWorkCategories.map((item) => <option key={item.value} value={item.value}>{item.name}</option>)}</select></div>}
          <div className="space-y-2"><Label htmlFor="catalog-name">Name</Label><Input id="catalog-name" required maxLength={160} value={entry.name} onChange={(e) => setEntry({ ...entry, name: e.target.value })} /></div>
          {entry.kind === "procedure" && <div className="space-y-2">
            <Label htmlFor="procedure-group">Group</Label>
            {isAddingNewGroup ? (
              <Input id="procedure-group" required maxLength={160} value={procedureGroup} onChange={(e) => setProcedureGroup(e.target.value)} placeholder="Enter new group name" />
            ) : (
              <Select value={procedureGroup} onValueChange={(v) => { if (v === "NEW_GROUP") { setIsAddingNewGroup(true); setProcedureGroup(""); } else { setProcedureGroup(v); } }}>
                <SelectTrigger id="procedure-group"><SelectValue placeholder="Select a group" /></SelectTrigger>
                <SelectContent>
                  {procedureGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  <SelectItem value="NEW_GROUP" className="font-semibold text-teal-700">+ Add new group</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>}
          {(entry.kind === "procedure" || TARGET_KINDS.includes(entry.kind)) && <div className="space-y-2"><Label htmlFor="catalog-required">{entry.kind === "clinical_work_category" ? "Minimum required (0 = optional)" : "Required count"}</Label><Input id="catalog-required" type="number" min={0} max={100000} required value={entry.required} onChange={(e) => setEntry({ ...entry, required: e.target.value })} /></div>}
          {TARGET_KINDS.includes(entry.kind) && <div className="space-y-2"><Label htmlFor="catalog-period">Period</Label><select id="catalog-period" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={entry.period} onChange={(e) => setEntry({ ...entry, period: e.target.value })}><option value="total">Overall</option><option value="month">Per month</option></select></div>}
          <Button disabled={busy} type="submit">Add log option</Button>
        </form>
      </CardContent>
    </Card>

    <section aria-labelledby="existing-heading" className="space-y-5">
      <div className="border-t border-slate-200 px-1 pt-6">
        <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-teal-600" /><h3 id="existing-heading" className="text-lg font-semibold text-slate-900">Existing log options</h3></div>
        <p className="mt-1 text-xs text-slate-500">What residents of {data.department.name} can log today. Change a number and press Save to update its minimum.</p>
      </div>

      <div className={`grid w-full grid-cols-1 gap-3 ${totals.length === 2 ? "md:grid-cols-2" : totals.length === 3 ? "md:grid-cols-3" : totals.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : ""}`}>
        {totals.map(({ key, label, value }, index) => <Card key={key} className={`overflow-hidden border-0 shadow-sm ring-1 ring-inset ${index % 3 === 0 ? "bg-gradient-to-br from-teal-50 to-white ring-teal-100" : index % 3 === 1 ? "bg-gradient-to-br from-sky-50 to-white ring-sky-100" : "bg-gradient-to-br from-violet-50 to-white ring-violet-100"}`}>
          <CardContent className="relative p-5"><div className={`absolute right-0 top-0 h-20 w-20 -translate-y-1/3 translate-x-1/3 rounded-full blur-2xl ${index % 3 === 0 ? "bg-teal-200/50" : index % 3 === 1 ? "bg-sky-200/50" : "bg-violet-200/50"}`} /><p className="relative max-w-[13rem] text-xs font-semibold leading-5 text-slate-600">{label}</p>{value ? <><p className="relative mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p><p className="relative mt-1 text-[11px] text-slate-500">Target total</p></>
            : <><p className="relative mt-3 text-base font-semibold text-slate-700">No minimum set yet</p><p className="relative mt-1 text-[11px] leading-4 text-slate-500">Residents can still log these. Set a required count on any item below and this total will add them up.</p></>}</CardContent>
        </Card>)}
      </div>

      {procedureTypesEnabled && (
        <Card className="border-slate-200/80 shadow-sm shadow-slate-200/50"><CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-4"><CardTitle className="text-base">Procedures</CardTitle><p className="text-xs text-slate-500">Procedure groups and types, with the required count for each.</p></CardHeader><CardContent className="grid gap-6 p-5 md:grid-cols-2">
          <SearchableSection
            title="Procedure groups"
            items={procedureGroups}
            emptyText="No procedure groups."
            renderItem={(g) => <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
              <span className="flex-1 text-sm">{g.name} <span className="text-xs text-slate-500">({g.count} procedure types)</span></span>
              <Button variant="ghost" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(g.id, "procedure_group", g.name)} className="text-rose-700 hover:bg-rose-100 h-8 w-8 p-0"><Trash2 className="h-4 w-4" /></Button>
            </div>}
          />
          <SearchableSection
            title="Procedure types"
            items={data.procedures}
            emptyText="No procedure types configured."
            renderItem={(p) => <form className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/procedures/${p.id}`, { required: Number(targets[p.id] ?? p.required) }), "Procedure target updated"); }}>
              <div className="min-w-0 grow basis-full sm:basis-0"><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.group}</p></div>
              <Input aria-label={`Required count for ${p.name}`} className="w-24" type="number" min={0} max={100000} required value={targets[p.id] ?? p.required} onChange={(e) => setTargets({ ...targets, [p.id]: e.target.value })} />
              <Button variant="outline" size="sm" disabled={busy} type="submit">Save</Button>
              <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(p.id, "procedure", p.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
            </form>}
          />
        </CardContent></Card>
      )}

      {features.clinicalWorks && (
        <Card className="border-slate-200/80 shadow-sm shadow-slate-200/50"><CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-4"><CardTitle className="text-base">Clinical work</CardTitle><p className="text-xs text-slate-500">Categories residents log under, the minimum for each (0 means optional), and the sub-types offered. A category with no sub-types is logged without one.</p></CardHeader><CardContent className="p-5">
          {data.clinicalWorkCategories.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No clinical work categories configured.</p> : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.clinicalWorkCategories.map((category) => {
                const subTypes = data.clinicalWorkSubtypes.filter((item) => item.parentValue === category.value);
                return (
                  <div key={category.id} className="rounded-xl bg-slate-50 p-3">
                    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${category.id}`, { required: Number(clinicalTargets[category.id] ?? category.required), period: category.period }), "Clinical work minimum updated"); }}>
                      <span className="min-w-0 grow basis-full text-sm font-medium sm:basis-0">{category.name}{category.period === "month" && <span className="font-normal text-slate-500"> (per month)</span>}</span>
                      <Input className="w-20" type="number" min={0} max={100000} required aria-label={`Minimum for ${category.name}`} value={clinicalTargets[category.id] ?? category.required} onChange={(e) => setClinicalTargets({ ...clinicalTargets, [category.id]: e.target.value })} />
                      <Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
                      <Button variant="outline" size="sm" type="button" aria-label={`Delete ${category.name}`} disabled={busy || deleting} onClick={() => confirmDelete(category.id, "clinical_work_category", category.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
                    </form>
                    {subTypes.length === 0 ? <p className="mt-1 text-xs text-slate-500">No sub-types yet</p> : (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {subTypes.map((item) => (
                          <li key={item.id} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
                            {item.name}
                            <button type="button" aria-label={`Delete ${item.name}`} disabled={busy || deleting} onClick={() => confirmDelete(item.id, "clinical_work_subtype", item.name)} className="rounded-full p-0.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-3 w-3" /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent></Card>
      )}

      <Card className="border-slate-200/80 shadow-sm shadow-slate-200/50"><CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-4"><CardTitle className="text-base">Training catalog</CardTitle><p className="text-xs text-slate-500">{isRadiology ? "Postings" : "Wards"}, academic activities and the other lists residents choose from.</p></CardHeader><CardContent className="space-y-6 p-5">
      <div className="grid gap-6 md:grid-cols-2">
        <SearchableSection
          title="Posting"
          defaultOpen={true}
          items={data.postings}
          emptyText="No postings configured."
          renderItem={(item) => <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
            <span className="flex-1">{item.name}</span>
            <Button variant="ghost" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "posting", item.name)} className="text-rose-700 hover:bg-rose-100 h-8 w-8 p-0"><Trash2 className="h-4 w-4" /></Button>
          </div>}
        />
        <SearchableSection
          title="Academic activities"
          defaultOpen={true}
          items={data.academics}
          emptyText="No academic activities configured."
          renderItem={(item) => <form className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(academicTargets[item.id] ?? item.required), period: item.period }), "Academic target updated"); }}>
            <span className="min-w-0 grow basis-full text-sm sm:basis-0">{item.name} ({item.period === "month" ? "per month" : "overall"})</span><Input className="w-24" type="number" min={0} max={100000} required aria-label={`Required count for ${item.name}`} value={academicTargets[item.id] ?? item.required} onChange={(e) => setAcademicTargets({ ...academicTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "academic", item.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>}
        />
      </div>
      {(!features.hideCaseLogs || (features.procedureExperience && !features.hideProcedureLogs)) && <div className="grid gap-6 md:grid-cols-2 mt-8 pt-8 border-t">
        {!features.hideCaseLogs && <SearchableSection
          title="Case Categories"
          items={data.caseCategories ?? []}
          emptyText="No case categories configured."
          renderItem={(item) => <form className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(academicTargets[item.id] ?? item.required), period: item.period }), "Case target updated"); }}>
            <span className="min-w-0 grow basis-full text-sm sm:basis-0">{item.name}</span><Input className="w-16" type="number" min={0} max={100000} required aria-label={`Required count for ${item.name}`} value={academicTargets[item.id] ?? item.required} onChange={(e) => setAcademicTargets({ ...academicTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "case_category", item.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>}
        />}
        {data.config?.enabledFeatures?.procedureExperience && !features.hideProcedureLogs && (
          <SearchableSection
            title="Experience levels"
            items={data.competencyLevels ?? []}
            emptyText="No experience levels configured."
            renderItem={(item) => <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
              <span className="flex-1">{item.name}</span>
              <Button variant="ghost" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "competency_level", item.name)} className="text-rose-700 hover:bg-rose-100 h-8 w-8 p-0"><Trash2 className="h-4 w-4" /></Button>
            </div>}
          />
        )}
      </div>}
      {data.config?.enabledFeatures?.conferenceLevels && (
      <div className="grid gap-6 md:grid-cols-2 mt-8 pt-8 border-t">
        <SearchableSection
          title="Conference Levels"
          items={data.conferenceLevels ?? []}
          emptyText="No conference levels configured."
          renderItem={(item) => <form className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(conferenceTargets[item.id] ?? item.required), period: item.period }), "Conference level target updated"); }}>
            <span className="min-w-0 grow basis-full text-sm sm:basis-0">{item.name}</span><Input className="w-16" type="number" min={0} max={100000} required aria-label={`Required count for ${item.name}`} value={conferenceTargets[item.id] ?? item.required} onChange={(e) => setConferenceTargets({ ...conferenceTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "conference_level", item.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>}
        />
      </div>
      )}
      <div className="grid gap-6 md:grid-cols-2 mt-8 pt-8 border-t">
        <SearchableSection
          title="Leave types"
          items={data.leaveTypes ?? []}
          emptyText="No leave types configured."
          renderItem={(item) => <form className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void save(() => apiPatch(`/api/admin/department/catalog/${item.id}`, { required: Number(leaveTargets[item.id] ?? item.required), period: item.period }), "Leave allowance updated"); }}>
            <span className="min-w-0 grow basis-full text-sm sm:basis-0">{item.name}</span><Input className="w-16" type="number" min={0} max={365} required aria-label={`Allowance for ${item.name}`} value={leaveTargets[item.id] ?? item.required} onChange={(e) => setLeaveTargets({ ...leaveTargets, [item.id]: e.target.value })} /><Button size="sm" variant="outline" disabled={busy} type="submit">Save</Button>
            <Button variant="outline" size="sm" type="button" disabled={busy || deleting} onClick={() => confirmDelete(item.id, "leave_type", item.name)} className="text-rose-700 border-rose-200 hover:bg-rose-50 px-2"><Trash2 className="h-4 w-4" /></Button>
          </form>}
        />
      </div>
    </CardContent></Card>
    </section>
  </div>;
}
