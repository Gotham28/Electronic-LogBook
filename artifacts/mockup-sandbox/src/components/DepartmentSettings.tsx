import * as React from "react";
import { toast } from "sonner";
import { apiPost, apiPatch, apiGet, apiDelete } from "@/lib/apiClient";
import { Trash2, AlertTriangle, ChevronDown, Search } from "lucide-react";
import { useDepartment } from "@/lib/department-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TARGET_KINDS = ["academic", "case_category", "conference_level", "clinical_work_category"];
const COLLAPSE_THRESHOLD = 5;

function useSearch<T extends { name: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return React.useMemo(() => {
    return q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items;
  }, [items, q]) as T[];
}

export function DepartmentSettings() {
  const data = useDepartment();
  const isRadiology = data.department?.name?.toLowerCase().includes("radiology") || data.department?.name?.toLowerCase().includes("dermatology");
  const features = data.config?.enabledFeatures ?? {};
  const procedureTypesEnabled = !features.freeTextProcedures && !features.hideProcedureLogs;
  
  const sections = React.useMemo(() => {
    const list = [];
    if (procedureTypesEnabled) list.push({ id: "procedures", label: "Procedures", items: data.procedures, kind: "procedure", addLabel: "+ Add procedure", desc: "Procedure groups and types, with the required count for each." });
    if (features.clinicalWorks) list.push({ id: "clinical", label: "Clinical work", items: data.clinicalWorkCategories, kind: "clinical_work_category", addLabel: "+ Add category", desc: "Categories residents log under, the minimum for each (0 means optional), and the sub-types offered. A category with no sub-types is logged without one." });
    list.push({ id: "postings", label: isRadiology ? "Postings" : "Wards / postings", items: data.postings, kind: "posting", addLabel: "+ Add posting", desc: `${isRadiology ? "Postings" : "Wards"}, academic activities and the other lists residents choose from.` });
    list.push({ id: "academic", label: "Academic activities", items: data.academics, kind: "academic", addLabel: "+ Add activity", desc: `${isRadiology ? "Postings" : "Wards"}, academic activities and the other lists residents choose from.` });
    if (!features.hideCaseLogs) list.push({ id: "cases", label: "Case categories", items: data.caseCategories ?? [], kind: "case_category", addLabel: "+ Add case category", desc: `${isRadiology ? "Postings" : "Wards"}, academic activities and the other lists residents choose from.` });
    if (!features.hideProcedureLogs) list.push({ id: "competency", label: "Competency levels", items: data.competencyLevels ?? [], kind: "competency_level", addLabel: "+ Add competency level", desc: `${isRadiology ? "Postings" : "Wards"}, academic activities and the other lists residents choose from.` });
    if (features.conferenceLevels) list.push({ id: "conference", label: "Conference levels", items: data.conferenceLevels ?? [], kind: "conference_level", addLabel: "+ Add conference level", desc: `${isRadiology ? "Postings" : "Wards"}, academic activities and the other lists residents choose from.` });
    list.push({ id: "leaves", label: "Leave types", items: data.leaveTypes ?? [], kind: "leave_type", addLabel: "+ Add leave type", desc: `${isRadiology ? "Postings" : "Wards"}, academic activities and the other lists residents choose from.` });
    return list;
  }, [procedureTypesEnabled, features, data, isRadiology]);

  const [activeSectionId, setActiveSectionId] = React.useState(sections[0].id);
  React.useEffect(() => {
    if (!sections.find(s => s.id === activeSectionId)) {
      setActiveSectionId(sections[0].id);
    }
  }, [sections, activeSectionId]);

  const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];

  const clinicalTotal = data.clinicalWorkCategories.filter((item) => item.period === "total").reduce((sum, item) => sum + item.required, 0);
  const totals = [
    ...(!features.hideCaseLogs ? [{ key: "cases", label: "Required clinical cases", value: data.config?.requiredCases }] : []),
    ...(!features.hideProcedureLogs ? [{ key: "procedures", label: "Required procedures", value: data.config?.requiredProcedures }] : []),
    ...(features.clinicalWorks ? [{ key: "clinical", label: "Required clinical work", value: clinicalTotal }] : []),
    { key: "academic", label: "Required academic activities", value: data.config?.requiredAcademic },
  ];

  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const getDraft = (kind: string, id: number | string, current: number) => {
    return drafts[`${kind}:${id}`] ?? String(current);
  };
  const setDraft = (kind: string, id: number | string, value: string) => {
    setDrafts(prev => ({ ...prev, [`${kind}:${id}`]: value }));
  };
  const isDraftDifferent = (kind: string, id: number | string, current: number) => {
    return drafts[`${kind}:${id}`] !== undefined && drafts[`${kind}:${id}`] !== String(current);
  };

  const [procedureGroups, setProcedureGroups] = React.useState<{id: string, name: string, count: number}[]>([]);
  const [groupsError, setGroupsError] = React.useState(false);
  const fetchGroups = React.useCallback(() => {
    setGroupsError(false);
    apiGet<{id: string, name: string, count: number}[]>("/api/admin/department/procedure-groups")
      .then(setProcedureGroups)
      .catch(() => setGroupsError(true));
  }, []);

  React.useEffect(() => {
    fetchGroups();
  }, [fetchGroups, data.department.id]);

  const [deleteTarget, setDeleteTarget] = React.useState<{id: number | string, type: "procedure" | "posting" | "academic" | "case_category" | "competency_level" | "leave_type" | "procedure_group" | "conference_level" | "clinical_work_category" | "clinical_work_subtype", name: string, count: number | null} | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const confirmDelete = async (id: number | string, type: any, name: string) => {
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
        toast.warning("Deleted, but the list may be out of date \u2014 refresh the page");
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

  const [busy, setBusy] = React.useState(false);
  async function save(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await operation(); await data.refresh(); fetchGroups(); toast.success(message); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not save settings"); }
    finally { setBusy(false); }
  }

  const patchItem = (id: number | string, kind: string, currentVal: number, period?: string, successMsg?: string) => {
    if (!isDraftDifferent(kind, id, currentVal)) return;
    void save(() => apiPatch(`/api/admin/department/${kind === 'procedure' ? 'procedures' : 'catalog'}/${id}`, { 
      required: Number(drafts[`${kind}:${id}`]),
      ...(kind !== 'procedure' ? { period } : {})
    }), successMsg || "Target updated");
  };

  const [isAdding, setIsAdding] = React.useState(false);
  const [entryName, setEntryName] = React.useState("");
  const [entryRequired, setEntryRequired] = React.useState("");
  const [entryPeriod, setEntryPeriod] = React.useState("total");
  const [procedureGroup, setProcedureGroup] = React.useState("");
  const [isAddingNewGroup, setIsAddingNewGroup] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    setIsAdding(false);
    setEntryName("");
    setEntryRequired("");
    setEntryPeriod("total");
    setProcedureGroup("");
    setIsAddingNewGroup(false);
    setSearchQuery("");
  }, [activeSectionId]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void save(async () => {
      if (activeSection.kind === "procedure") {
        await apiPost("/api/admin/department/procedures", { name: entryName, group: procedureGroup, required: Number(entryRequired) });
        setProcedureGroup("");
        setIsAddingNewGroup(false);
      } else {
        await apiPost("/api/admin/department/catalog", { 
          kind: activeSection.kind, 
          name: entryName, 
          required: TARGET_KINDS.includes(activeSection.kind) ? Number(entryRequired) : 0, 
          period: entryPeriod, 
          value: entryName.trim()
        });
      }
      setEntryName("");
      setEntryRequired("");
      setIsAdding(false);
    }, activeSection.kind === "procedure" ? "Procedure type added" : "Log option added");
  };

  const visibleItems = useSearch<{ id: number; name: string; required: number }>(activeSection.items, searchQuery);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Training requirements</h2>
        <p className="text-sm text-slate-500">Department of {data.department.name}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {totals.map(({ key, label, value }) => (
          <div key={key} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm min-w-[12rem] flex-1">
            <p className="text-xs font-semibold text-slate-600">{label}</p>
            {value ? (
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-slate-950">{value}</span>
                <span className="text-[11px] text-slate-500">Target total</span>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-slate-700">No minimum set yet</span>
                <span className="text-[11px] leading-4 text-slate-500">Residents can still log these. Set a required count on any item below and this total will add them up.</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <div className="space-y-2 lg:sticky lg:top-4 h-fit">
          <div className="lg:hidden">
            <Label htmlFor="section-select" className="sr-only">Section</Label>
            <select 
              id="section-select" 
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={activeSectionId}
              onChange={(e) => setActiveSectionId(e.target.value)}
            >
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          
          <ul className="hidden lg:flex lg:flex-col gap-1">
            {sections.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={activeSectionId === s.id ? "page" : undefined}
                  onClick={() => setActiveSectionId(s.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeSectionId === s.id 
                      ? "bg-teal-50 text-teal-900" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span>{s.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    activeSectionId === s.id ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"
                  }`}>
                    {s.items.length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 flex flex-col gap-4 pb-12">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-slate-900">{activeSection.label}</h3>
              <Button size="sm" onClick={() => setIsAdding(!isAdding)}>
                {activeSection.addLabel}
              </Button>
            </div>
            <p className="text-sm text-slate-500">{activeSection.desc}</p>
          </div>

          {isAdding && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-2">
              <form onSubmit={handleAddSubmit} className="flex flex-wrap items-end gap-4">
                <div className="space-y-2 flex-1 min-w-[200px]">
                  <Label htmlFor="add-name">Name</Label>
                  <Input id="add-name" required maxLength={160} value={entryName} onChange={(e) => setEntryName(e.target.value)} />
                </div>
                
                {activeSection.kind === "procedure" && (
                  <div className="space-y-2 flex-1 min-w-[200px]">
                    <Label htmlFor="add-group">Group</Label>
                    {isAddingNewGroup ? (
                      <Input id="add-group" required maxLength={160} value={procedureGroup} onChange={(e) => setProcedureGroup(e.target.value)} placeholder="Enter new group name" />
                    ) : (
                      <Select value={procedureGroup} onValueChange={(v) => { if (v === "NEW_GROUP") { setIsAddingNewGroup(true); setProcedureGroup(""); } else { setProcedureGroup(v); } }}>
                        <SelectTrigger id="add-group"><SelectValue placeholder="Select a group" /></SelectTrigger>
                        <SelectContent>
                          {procedureGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                          <SelectItem value="NEW_GROUP" className="font-semibold text-teal-700">+ Add new group</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {(activeSection.kind === "procedure" || TARGET_KINDS.includes(activeSection.kind)) && (
                  <div className="space-y-2 w-32">
                    <Label htmlFor="add-required">
                      {activeSection.kind === "clinical_work_category" ? "Minimum" : "Required count"}
                    </Label>
                    <Input id="add-required" type="number" min={0} max={100000} required value={entryRequired} onChange={(e) => setEntryRequired(e.target.value)} />
                  </div>
                )}

                {TARGET_KINDS.includes(activeSection.kind) && (
                  <div className="space-y-2 w-32">
                    <Label htmlFor="add-period">Period</Label>
                    <select id="add-period" className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring" value={entryPeriod} onChange={(e) => setEntryPeriod(e.target.value)}>
                      <option value="total">Overall</option>
                      <option value="month">Per month</option>
                    </select>
                  </div>
                )}

                <div className="flex gap-2 w-full justify-end mt-2">
                  <Button type="button" variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
                  <Button type="submit" disabled={busy}>Add log option</Button>
                </div>
              </form>
            </div>
          )}

          {activeSection.items.length > COLLAPSE_THRESHOLD && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeSection.label.toLowerCase()}...`}
                aria-label={`Search ${activeSection.label}`}
                className="pl-9"
              />
            </div>
          )}

          {activeSection.kind === "procedure" && (
            <ProceduresList
              query={searchQuery}
              procedureGroups={procedureGroups}
              procedures={activeSection.items}
              getDraft={getDraft}
              setDraft={setDraft}
              isDraftDifferent={isDraftDifferent}
              patchItem={patchItem}
              confirmDelete={confirmDelete}
              busy={busy}
              deleting={deleting}
              groupsError={groupsError}
              fetchGroups={fetchGroups}
            />
          )}

          {activeSection.kind === "clinical_work_category" && (
            <div className="flex flex-col space-y-3">
              {activeSection.items.length === 0 && !searchQuery.trim() ? (
                <p className="py-2 text-sm text-slate-500">No clinical work categories configured.</p>
              ) : visibleItems.length === 0 ? (
                <p className="py-2 text-sm text-slate-500">No matches for &ldquo;{searchQuery.trim()}&rdquo;.</p>
              ) : (
                <>
                  {searchQuery.trim() && (
                    <p className="text-xs text-slate-500">Showing {visibleItems.length} of {activeSection.items.length}</p>
                  )}
                  {visibleItems.map(category => (
                    <ClinicalWorkRow
                      key={category.id}
                      category={category as any}
                      subTypes={data.clinicalWorkSubtypes.filter(item => item.parentValue === (category as any).value)}
                      getDraft={getDraft}
                      setDraft={setDraft}
                      isDraftDifferent={isDraftDifferent}
                      patchItem={patchItem}
                      confirmDelete={confirmDelete}
                      busy={busy}
                      deleting={deleting}
                      save={save}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {!["procedure", "clinical_work_category"].includes(activeSection.kind) && (
            <div className="flex flex-col">
              {visibleItems.length === 0 ? (
                <p className="py-2 text-sm text-slate-500">
                  {searchQuery.trim() ? `No matches for \u201c${searchQuery.trim()}\u201d.` : 
                    activeSection.kind === "posting" ? "No postings configured." :
                    activeSection.kind === "academic" ? "No academic activities configured." :
                    activeSection.kind === "case_category" ? "No case categories configured." :
                    activeSection.kind === "competency_level" ? "No competency levels configured." :
                    activeSection.kind === "conference_level" ? "No conference levels configured." :
                    "No leave types configured."
                  }
                </p>
              ) : (
                <>
                  {searchQuery.trim() && (
                    <p className="mb-2 text-xs text-slate-500">
                      Showing {visibleItems.length} of {activeSection.items.length}
                    </p>
                  )}
                  <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
                    {visibleItems.map(item => {
                      const hasCount = ["academic", "case_category", "conference_level", "leave_type"].includes(activeSection.kind);
                      const isLeave = activeSection.kind === "leave_type";
                      return (
                        <div key={item.id} className="flex items-center justify-between py-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">{item.name}</span>
                            {(item as any).period && (
                              <span className="text-xs text-slate-500">{(item as any).period === "month" ? "per month" : "overall"}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {hasCount && (
                              <div className="flex items-center gap-2">
                                <Label htmlFor={`target-${item.id}`} className="text-xs text-slate-500">
                                  {isLeave ? "Days" : "Minimum"}
                                </Label>
                                <Input 
                                  id={`target-${item.id}`}
                                  type="number" 
                                  min={0} 
                                  max={isLeave ? 365 : 100000} 
                                  required 
                                  className="w-20"
                                  aria-label={
                                    isLeave ? `Allowance for ${item.name}` :
                                    `Required count for ${item.name}`
                                  }
                                  value={getDraft(activeSection.kind, item.id, (item as any).required)}
                                  onChange={(e) => setDraft(activeSection.kind, item.id, e.target.value)}
                                />
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  disabled={busy || !isDraftDifferent(activeSection.kind, item.id, (item as any).required)}
                                  onClick={() => patchItem(
                                    item.id, 
                                    activeSection.kind, 
                                    (item as any).required, 
                                    (item as any).period,
                                    activeSection.kind === "academic" ? "Academic target updated" :
                                    activeSection.kind === "case_category" ? "Case target updated" :
                                    activeSection.kind === "conference_level" ? "Conference level target updated" :
                                    "Leave allowance updated"
                                  )}
                                >
                                  Save
                                </Button>
                              </div>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              aria-label={`Delete ${item.name}`}
                              disabled={busy || deleting}
                              onClick={() => confirmDelete(item.id, activeSection.kind as any, item.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) { setDeleteTarget(null); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <AlertTriangle className="h-4 w-4 text-rose-700" />
              </div>
              <div className="flex-1 space-y-3">
                <AlertDialogTitle className="text-rose-900">Delete {deleteTarget?.name}?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div>
                    {deleteTarget?.count === null ? (
                      deleteError ? (
                        <p className="text-sm text-rose-800 mt-1 leading-relaxed">Checking usage failed.</p>
                      ) : (
                        <p className="text-sm text-rose-800 mt-1 leading-relaxed animate-pulse">Checking usage...</p>
                      )
                    ) : deleteTarget && deleteTarget.count !== null && deleteTarget.count > 0 ? (
                      <p className="text-sm text-rose-800 mt-1 leading-relaxed">
                        {deleteTarget.count} student {deleteTarget.count === 1 ? 'record currently uses' : 'records currently use'} &apos;{deleteTarget.name}&apos;. Deleting it will not affect those existing records, but it will be removed from the dropdown for future entries. Delete anyway?
                      </p>
                    ) : (
                      <p className="text-sm text-rose-800 mt-1 leading-relaxed">
                        No student records currently use this option. Delete?
                      </p>
                    )}
                    {deleteError && deleteTarget && deleteTarget.count !== null && (
                      <div className="mt-3 p-3 bg-rose-100 border border-rose-300 rounded-md text-sm text-rose-900 font-medium">
                        {deleteError}
                      </div>
                    )}
                  </div>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
              Cancel
            </Button>
            {deleteTarget && deleteTarget.count === null && deleteError ? (
              <Button type="button" onClick={() => confirmDelete(deleteTarget.id, deleteTarget.type, deleteTarget.name)} className="bg-rose-600 hover:bg-rose-700 text-white">
                Try again
              </Button>
            ) : (
              <Button
                onClick={handleDelete}
                disabled={deleting || !deleteTarget || deleteTarget.count === null}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProceduresList({
  query, procedureGroups, procedures, getDraft, setDraft, isDraftDifferent, patchItem, confirmDelete, busy, deleting, groupsError, fetchGroups
}: any) {
  if (groupsError) {
    return (
      <div className="py-4 flex items-center gap-3">
        <p className="text-sm text-rose-600">Could not load procedure groups.</p>
        <Button variant="outline" size="sm" onClick={fetchGroups} disabled={busy}>Retry</Button>
      </div>
    );
  }

  const groupsMap = new Map();
  procedureGroups.forEach((g: any) => {
    groupsMap.set(g.id, { id: g.id, name: g.name, count: g.count, isOfficial: true, types: [] });
  });

  procedures.forEach((p: any) => {
    let gId = p.group;
    if (!groupsMap.has(gId)) {
      groupsMap.set(gId, { id: gId, name: gId, count: 0, isOfficial: false, types: [] });
    }
    groupsMap.get(gId).types.push(p);
  });

  const allGroups = Array.from(groupsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  
  if (allGroups.length === 0 && !query.trim()) {
    return <p className="py-4 text-sm text-slate-500">No procedure types configured.</p>;
  }

  return (
    <div className="flex flex-col space-y-3">
      {allGroups.map(g => {
        const matchingTypes = query.trim() 
          ? g.types.filter((t: any) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
          : g.types;
        
        const groupMatches = g.name.toLowerCase().includes(query.trim().toLowerCase());
        if (query.trim() && matchingTypes.length === 0 && !groupMatches) return null;

        return <ProcedureGroupBlock 
          key={g.id} 
          group={g} 
          types={query.trim() && !groupMatches ? matchingTypes : g.types}
          forceExpand={query.trim().length > 0 && matchingTypes.length > 0}
          {...{ getDraft, setDraft, isDraftDifferent, patchItem, confirmDelete, busy, deleting }}
        />;
      })}
    </div>
  );
}

function ProcedureGroupBlock({ group, types, forceExpand, getDraft, setDraft, isDraftDifferent, patchItem, confirmDelete, busy, deleting }: any) {
  const [expanded, setExpanded] = React.useState(false);
  const isExpanded = forceExpand || expanded;

  return (
    <div className="flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/50 transition-colors">
        <button 
          type="button" 
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900">{group.name}</span>
            <span className="text-xs text-slate-500">({group.isOfficial ? group.count : types.length} types)</span>
          </div>
        </button>
        {group.isOfficial && (
          <Button 
            variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:bg-rose-100"
            aria-label={`Delete ${group.name}`}
            disabled={busy || deleting}
            onClick={() => confirmDelete(group.id, "procedure_group", group.name)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isExpanded && types.length > 0 && (
        <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-200">
          {types.map((p: any) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between p-3 gap-2">
              <div className="flex flex-col">
                <span className="text-sm text-slate-900 font-medium">{p.name}</span>
                <span className="text-xs text-slate-500">{p.group}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`target-proc-${p.id}`} className="text-xs text-slate-500">Minimum</Label>
                  <Input 
                    id={`target-proc-${p.id}`}
                    type="number" min={0} max={100000} required className="w-20"
                    aria-label={`Required count for ${p.name}`}
                    value={getDraft("procedure", p.id, p.required)}
                    onChange={(e) => setDraft("procedure", p.id, e.target.value)}
                  />
                  <Button 
                    size="sm" variant="outline"
                    disabled={busy || !isDraftDifferent("procedure", p.id, p.required)}
                    onClick={() => patchItem(p.id, "procedure", p.required, undefined, "Procedure target updated")}
                  >
                    Save
                  </Button>
                </div>
                <Button 
                  variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                  aria-label={`Delete ${p.name}`}
                  disabled={busy || deleting}
                  onClick={() => confirmDelete(p.id, "procedure", p.name)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClinicalWorkRow({ 
  category, subTypes, getDraft, setDraft, isDraftDifferent, patchItem, confirmDelete, busy, deleting, save
}: any) {
  const [expanded, setExpanded] = React.useState(false);
  const [newSubTypeName, setNewSubTypeName] = React.useState("");

  const handleAddSubType = (e: React.FormEvent) => {
    e.preventDefault();
    void save(async () => {
      await apiPost("/api/admin/department/catalog", { 
        kind: "clinical_work_subtype", 
        name: newSubTypeName, 
        required: 0, 
        period: "total", 
        value: newSubTypeName.trim(), 
        parentValue: category.value 
      });
      setNewSubTypeName("");
    }, "Log option added");
  };

  return (
    <div className="flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between p-3 bg-slate-50 gap-2">
        <button 
          type="button" 
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded min-w-[200px]"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? "" : "-rotate-90"}`} />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-900">{category.name}</span>
            {category.period === "month" && <span className="text-xs text-slate-500">per month</span>}
          </div>
        </button>
        <div className="flex items-center gap-3 md:pl-4 md:border-l border-slate-200">
          <div className="flex items-center gap-2">
            <Label htmlFor={`target-${category.id}`} className="text-xs text-slate-500">Minimum</Label>
            <Input 
              id={`target-${category.id}`}
              type="number" min={0} max={100000} required className="w-20"
              aria-label={`Minimum for ${category.name}`}
              value={getDraft("clinical_work_category", category.id, category.required)}
              onChange={(e) => setDraft("clinical_work_category", category.id, e.target.value)}
            />
            <Button 
              size="sm" variant="outline"
              disabled={busy || !isDraftDifferent("clinical_work_category", category.id, category.required)}
              onClick={() => patchItem(category.id, "clinical_work_category", category.required, category.period, "Clinical work minimum updated")}
            >
              Save
            </Button>
          </div>
          <Button 
            variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:bg-rose-50"
            aria-label={`Delete ${category.name}`}
            disabled={busy || deleting}
            onClick={() => confirmDelete(category.id, "clinical_work_category", category.name)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="bg-white p-4 border-t border-slate-200 space-y-4">
          {subTypes.length === 0 ? (
            <p className="text-sm text-slate-500">No sub-types yet</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {subTypes.map((item: any) => (
                <li key={item.id} className="flex items-center justify-between p-2">
                  <span className="text-sm pl-2">{item.name}</span>
                  <Button 
                    variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                    aria-label={`Delete ${item.name}`}
                    disabled={busy || deleting}
                    onClick={() => confirmDelete(item.id, "clinical_work_subtype", item.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddSubType} className="flex items-end gap-2 max-w-sm">
            <div className="space-y-1 flex-1">
              <Label htmlFor={`add-subtype-${category.id}`} className="text-xs font-semibold">Add sub-type</Label>
              <Input 
                id={`add-subtype-${category.id}`}
                placeholder="Sub-type name" required maxLength={160}
                value={newSubTypeName} onChange={e => setNewSubTypeName(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>Add</Button>
          </form>
        </div>
      )}
    </div>
  );
}
