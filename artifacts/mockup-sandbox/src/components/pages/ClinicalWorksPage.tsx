import * as React from "react";
import { AlertCircle, CheckCircle2, Clock, Edit3, Loader2, PlusCircle, Search, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { getCurrentUser, isDemoMode } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLogbookDate, todayForInput } from "@/lib/logbook-config";
import { useDepartment } from "@/lib/department-context";

type ClinicalWorkLog = {
  id: number;
  number: number;
  date: string;
  category: string;
  subType: string | null;
  patientAge: string;
  patientSex: "male" | "female" | "other";
  caseNumber: string;
  supervisorId: number | null;
  supervisorName: string | null;
  status: "pending" | "verified" | "rejected";
  facultyRemarks: string | null;
};

const emptyForm = () => ({ date: todayForInput(), category: "", subType: "", patientAge: "", patientSex: "", caseNumber: "", supervisorId: "" });

export function ClinicalWorksPage() {
  const { clinicalWorkCategories, clinicalWorkSubtypes } = useDepartment();
  const user = React.useMemo(() => getCurrentUser(), []);
  const hideCaseNumber = isDemoMode();
  const [logs, setLogs] = React.useState<ClinicalWorkLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [professors, setProfessors] = React.useState<Array<{ id: number; fullName: string }>>([]);
  const [professorsError, setProfessorsError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [editId, setEditId] = React.useState<number | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const names = React.useMemo(() => new Map([...clinicalWorkCategories, ...clinicalWorkSubtypes].map((item) => [item.value, item.name])), [clinicalWorkCategories, clinicalWorkSubtypes]);
  const subTypesFor = React.useCallback((category: string) => clinicalWorkSubtypes.filter((item) => item.parentValue === category), [clinicalWorkSubtypes]);
  const formSubTypes = subTypesFor(form.category);

  const fetchLogs = React.useCallback(async () => {
    if (!user?.studentProfileId) { setError("Not logged in"); setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet(`/api/students/${user.studentProfileId}/logs`);
      const sorted = [...(data.clinicalWorkLogs || [])].sort((a: any, b: any) => b.id - a.id);
      setLogs(sorted.map((log: any, index: number) => ({ ...log, number: sorted.length - index })));
    } catch (err: any) {
      setError(err?.message || "Could not load your clinical work");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    void fetchLogs();
    if (user?.departmentId) {
      apiGet(`/api/departments/${user.departmentId}/professors`).then(setProfessors)
        .catch((err: any) => setProfessorsError(err?.message || "Could not load faculty members"));
    }
  }, [fetchLogs, user?.departmentId]);

  const setField = (field: keyof ReturnType<typeof emptyForm>, value: string) =>
    setForm((current) => field === "category" ? { ...current, category: value, subType: "" } : { ...current, [field]: value });

  const closeDialog = (value: boolean) => {
    setOpen(value);
    if (!value) { setForm(emptyForm()); setEditId(null); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.studentProfileId) return;
    if (!form.category) { toast.error("Select a category"); return; }
    if (formSubTypes.length > 0 && !form.subType) { toast.error("Select a sub-type"); return; }
    if (!form.patientSex) { toast.error("Select the patient's sex"); return; }
    if (!form.supervisorId) { toast.error("Select a reviewing faculty member"); return; }
    const payload = { date: form.date, category: form.category, subType: form.subType || null, patientAge: form.patientAge.trim(),
      patientSex: form.patientSex, caseNumber: form.caseNumber.trim(), supervisorId: Number(form.supervisorId) };
    setSubmitting(true);
    try {
      if (editId) await apiPatch(`/api/students/${user.studentProfileId}/clinical-works/${editId}`, payload);
      else await apiPost(`/api/students/${user.studentProfileId}/clinical-works`, payload);
      toast.success(editId ? "Clinical work updated" : "Clinical work sent to faculty");
      closeDialog(false);
      await fetchLogs();
    } catch (err: any) {
      toast.error(err?.message || "Could not save this entry");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: number) => {
    if (!user?.studentProfileId || !window.confirm("Delete this entry? This cannot be undone.")) return;
    try {
      await apiDelete(`/api/students/${user.studentProfileId}/clinical-works/${id}`);
      setLogs((current) => current.filter((log) => log.id !== id));
      toast.success("Entry deleted");
    } catch (err: any) {
      toast.error(err?.message || "Could not delete this entry");
    }
  };

  const startEdit = (log: ClinicalWorkLog) => {
    setEditId(log.id);
    setForm({ date: log.date, category: log.category, subType: log.subType || "", patientAge: log.patientAge, patientSex: log.patientSex,
      caseNumber: log.caseNumber, supervisorId: log.supervisorId ? String(log.supervisorId) : "" });
    setOpen(true);
  };

  const label = (log: ClinicalWorkLog) => ({ category: names.get(log.category) ?? log.category, subType: log.subType ? names.get(log.subType) ?? log.subType : null });
  const term = search.trim().toLowerCase();
  const filtered = logs.filter((log) => {
    if (!term) return true;
    const { category, subType } = label(log);
    return [log.number, category, subType, hideCaseNumber ? null : log.caseNumber, log.supervisorName]
      .some((value) => value != null && String(value).toLowerCase().includes(term));
  });
  const counts = new Map<string, number>();
  logs.filter((log) => log.status !== "rejected").forEach((log) => counts.set(log.category, (counts.get(log.category) ?? 0) + 1));
  // Verified entries per category: all of them for an overall minimum, this month's for a monthly one.
  const thisMonth = todayForInput().slice(0, 7);
  const verifiedCounts = new Map<string, { total: number; month: number }>();
  logs.filter((log) => log.status === "verified").forEach((log) => {
    const current = verifiedCounts.get(log.category) ?? { total: 0, month: 0 };
    verifiedCounts.set(log.category, { total: current.total + 1, month: current.month + (log.date.startsWith(thisMonth) ? 1 : 0) });
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="page-eyebrow">Imaging and procedures</p>
          <h2 className="page-title mt-1">Clinical work</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Log each study or procedure you performed and send it to a faculty member for verification.</p>
        </div>
        <Dialog open={open} onOpenChange={closeDialog}>
          <DialogTrigger asChild>
            <Button disabled={clinicalWorkCategories.length === 0}><PlusCircle className="h-4 w-4" /> Log clinical work</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl bg-white sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl"><Stethoscope className="h-5 w-5 text-teal-600" /> {editId ? "Edit clinical work" : "New clinical work"}</DialogTitle>
              <DialogDescription>All fields are required.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" htmlFor="cw-category">
                  <Select value={form.category} onValueChange={(value) => setField("category", value)}>
                    <SelectTrigger id="cw-category"><SelectValue placeholder="Select a category" /></SelectTrigger>
                    <SelectContent>
                      {clinicalWorkCategories.map((item) => <SelectItem key={item.value} value={item.value}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {formSubTypes.length > 0 && (
                  <Field label="Sub-type" htmlFor="cw-subtype">
                    <Select value={form.subType} onValueChange={(value) => setField("subType", value)}>
                      <SelectTrigger id="cw-subtype"><SelectValue placeholder="Select a sub-type" /></SelectTrigger>
                      <SelectContent>
                        {formSubTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date" htmlFor="cw-date"><Input id="cw-date" type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} required /></Field>
                <Field label="Case number" htmlFor="cw-case"><Input id="cw-case" value={form.caseNumber} onChange={(e) => setField("caseNumber", e.target.value)} required maxLength={160} /></Field>
                <Field label="Age" htmlFor="cw-age"><Input id="cw-age" value={form.patientAge} onChange={(e) => setField("patientAge", e.target.value)} placeholder="e.g. 45 years" required maxLength={160} /></Field>
                <Field label="Sex" htmlFor="cw-sex">
                  <Select value={form.patientSex} onValueChange={(value) => setField("patientSex", value)}>
                    <SelectTrigger id="cw-sex"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Reviewing faculty member" htmlFor="cw-supervisor">
                {professorsError ? <p role="alert" className="text-sm text-rose-700">{professorsError}</p> : (
                  <Select value={form.supervisorId} onValueChange={(value) => setField("supervisorId", value)}>
                    <SelectTrigger id="cw-supervisor"><SelectValue placeholder="Select a faculty member" /></SelectTrigger>
                    <SelectContent>
                      {professors.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => closeDialog(false)} disabled={submitting}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editId ? "Save changes" : "Send to faculty"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {clinicalWorkCategories.length === 0 && (
        <p className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800">Your HOD has not set up clinical work categories yet.</p>
      )}

      {!loading && !error && clinicalWorkCategories.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {clinicalWorkCategories.map((item) => {
            // A minimum of 0 means the HOD has not made this category mandatory.
            const logged = counts.get(item.value) ?? 0;
            const monthly = item.period === "month";
            const verified = (monthly ? verifiedCounts.get(item.value)?.month : verifiedCounts.get(item.value)?.total) ?? 0;
            const hasMinimum = item.required > 0;
            const done = hasMinimum && verified >= item.required;
            const pct = hasMinimum ? Math.min(Math.round((verified / item.required) * 100), 100) : 0;
            return (
              <div key={item.value} className={`rounded-xl border p-4 ${done ? "border-emerald-200 bg-emerald-50/60" : "border-teal-100 bg-white"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-xs font-semibold leading-snug text-slate-700">{item.name}</p>
                  {done && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                </div>
                <p className="mt-2 text-xl font-bold text-slate-900">{logged}</p>
                {hasMinimum ? (
                  <>
                    <p className="text-[11px] text-slate-500">{verified} of {item.required} verified{monthly ? " this month" : ""}</p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                      <div className={`h-1.5 rounded-full transition-all ${done ? "bg-emerald-500" : "bg-teal-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-slate-500">No minimum set</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col justify-between gap-4 border-b border-teal-100 md:flex-row md:items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-teal-600" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 pl-9" aria-label="Search clinical work"
              placeholder={hideCaseNumber ? "Search category or sub-type..." : "Search category, sub-type or case number..."} />
          </div>
          {!loading && !error && <Badge variant="outline" className="w-fit border-teal-100 bg-teal-50 px-3 py-1 text-teal-800">{logs.length} logged</Badge>}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm text-slate-500">Loading clinical work...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
              <p className="text-sm font-medium text-rose-700">{error}</p>
              <Button size="sm" variant="outline" onClick={() => void fetchLogs()} className="border-rose-200 text-rose-700">Try again</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <p className="text-base font-semibold text-slate-950">{logs.length === 0 ? "No clinical work logged yet" : "No entries match your search"}</p>
              <p className="max-w-sm text-sm text-slate-500">{logs.length === 0 ? "Use “Log clinical work” to add your first entry." : "Clear the search to see every entry."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  {!hideCaseNumber && <TableHead>Case number</TableHead>}
                  <TableHead>Age / Sex</TableHead>
                  <TableHead>Faculty</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => {
                  const { category, subType } = label(log);
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-bold">{log.number}</TableCell>
                      <TableCell>{formatLogbookDate(log.date)}</TableCell>
                      <TableCell>
                        <p className="font-semibold text-slate-900">{category}</p>
                        {subType && <p className="text-xs text-slate-500">{subType}</p>}
                      </TableCell>
                      {!hideCaseNumber && <TableCell className="font-semibold text-teal-800">{log.caseNumber}</TableCell>}
                      <TableCell className="capitalize">{log.patientAge} / {log.patientSex}</TableCell>
                      <TableCell>{log.supervisorName ?? "—"}</TableCell>
                      <TableCell className="max-w-[180px] text-xs">
                        {log.status === "pending" ? <span className="text-slate-400">—</span>
                          : <span title={log.facultyRemarks || "No remark"} className={`block truncate ${log.status === "rejected" && log.facultyRemarks ? "font-medium text-rose-700" : "text-slate-600"}`}>{log.facultyRemarks || "No remark"}</span>}
                      </TableCell>
                      <TableCell>{statusBadge(log.status)}</TableCell>
                      <TableCell className="text-right">
                        {(log.status === "pending" || log.status === "rejected") && (
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" aria-label={`Edit entry ${log.number}`} className="text-teal-600 hover:bg-teal-50 hover:text-teal-800" onClick={() => startEdit(log)}><Edit3 className="h-4 w-4" /></Button>
                            {log.status === "pending" && (
                              <Button variant="ghost" size="sm" aria-label={`Delete entry ${log.number}`} className="text-rose-500 hover:bg-rose-50 hover:text-rose-700" onClick={() => void remove(log.id)}><Trash2 className="h-4 w-4" /></Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}

function statusBadge(status: ClinicalWorkLog["status"]) {
  if (status === "verified") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge>;
  if (status === "rejected") return <Badge className="border-rose-200 bg-rose-50 text-rose-700"><AlertCircle className="mr-1 h-3 w-3" /> Rejected</Badge>;
  return <Badge className="border-amber-200 bg-amber-50 text-amber-700"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>;
}
