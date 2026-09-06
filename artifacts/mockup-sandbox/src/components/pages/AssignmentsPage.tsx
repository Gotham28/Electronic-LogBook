import * as React from "react";
import { ClipboardList, Plus, Send, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
import { useDepartment } from "@/lib/department-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type AssignmentType = { id: number; name: string; description: string };
type Student = { id: number; name: string; registrationNumber: string };
type Assignment = { id: number; assignmentId: number; title: string; instructions: string; typeName: string;
  typeDescription: string; dueAt: string; facultyId: number; studentId: number; studentName: string;
  registrationNumber: string; status: "assigned" | "submitted" | "returned" | "completed";
  response: string | null; feedback: string | null; submittedAt: string | null };
type Page = { items: Assignment[]; nextCursor: number | null };

export function AssignmentsPage() {
  const { department } = useDepartment();
  const user = getCurrentUser()!;
  const isStudent = user.role === "student";
  const [items, setItems] = React.useState<Assignment[]>([]);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [selected, setSelected] = React.useState<Assignment | null>(null);
  const [response, setResponse] = React.useState("");
  const [feedback, setFeedback] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const fetchPage = React.useCallback(async (after?: number) => {
    setLoading(true); setError("");
    try {
      const page = await apiGet<Page>(`/api/assignments${after ? `?cursor=${after}` : ""}`);
      setItems((current) => after ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load assignments"); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void fetchPage(); }, [fetchPage]);

  async function act(action: "submit" | "completed" | "returned") {
    if (!selected) return;
    setBusy(true);
    try {
      await apiPost(`/api/assignments/${selected.id}/${action === "submit" ? "submit" : "review"}`,
        action === "submit" ? { response } : { status: action, feedback });
      toast.success(action === "submit" ? "Work submitted for review" : action === "completed" ? "Assignment completed" : "Work returned for revision");
      setSelected(null); await fetchPage();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save assignment"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6 pb-12">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="page-eyebrow">{department.name}</p><h2 className="page-title mt-1">Assignments</h2>
        <p className="mt-2 text-sm text-slate-500">{isStudent ? "Read your faculty's instructions, submit your work, and follow their feedback." : "Assign work, define the type of assignment, and review student submissions."}</p></div>
      {!isStudent && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New assignment</Button>}
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}<Button variant="outline" className="ml-3" onClick={() => fetchPage()}>Try again</Button></div>}
    {loading && !items.length && <p role="status">Loading assignments…</p>}
    {!loading && !error && !items.length && <Card><CardContent className="py-14 text-center"><ClipboardList className="mx-auto mb-3 h-8 w-8 text-teal-700" />
      <h3 className="text-lg font-semibold">No assignments yet</h3><p className="mt-2 text-sm text-slate-500">{isStudent ? "Your assigned work will appear here." : "Create an assignment for approved students in your department."}</p></CardContent></Card>}
    <div className="grid gap-4 xl:grid-cols-2">{items.map((item) => {
      const overdue = ["assigned", "returned"].includes(item.status) && Date.parse(item.dueAt) < Date.now();
      return <Card key={item.id}><CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.typeName}</Badge><Badge className={item.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-teal-50 text-teal-800"}>{item.status}</Badge>{overdue && <Badge className="bg-amber-100 text-amber-900">Overdue</Badge>}</div>
        <h3 className="text-lg font-semibold">{item.title}</h3>
        {!isStudent && <p className="text-sm text-slate-600">{item.studentName} · {item.registrationNumber}</p>}
        <p className="text-xs text-slate-500">Due {new Date(item.dueAt).toLocaleString()}</p>
        <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-slate-600">{item.instructions}</p>
        <Button variant="outline" onClick={() => { setSelected(item); setResponse(item.response || ""); setFeedback(""); }}>Open assignment</Button>
      </CardContent></Card>;
    })}</div>
    {cursor && <Button variant="outline" disabled={loading} onClick={() => fetchPage(cursor)}>{loading ? "Loading…" : "Load more"}</Button>}

    <Dialog open={!!selected} onOpenChange={(open) => { if (!busy && !open) setSelected(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>{selected?.typeName} · Due {selected && new Date(selected.dueAt).toLocaleString()}</DialogDescription></DialogHeader>
        {selected && <div className="space-y-5">
          <p className="whitespace-pre-wrap break-words text-sm text-slate-500">{selected.typeDescription}</p>
          <section><h4 className="mb-2 font-semibold">Instructions</h4><p className="whitespace-pre-wrap break-words text-sm">{selected.instructions}</p></section>
          {selected.feedback && <section className="rounded-xl bg-teal-50 p-4"><h4 className="font-semibold">Faculty feedback</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm">{selected.feedback}</p></section>}
          {isStudent && ["assigned", "returned"].includes(selected.status) ? <form onSubmit={(e) => { e.preventDefault(); void act("submit"); }} className="space-y-3">
            <Label htmlFor="assignment-response">Your work</Label><Textarea id="assignment-response" rows={8} required maxLength={20000} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Complete the work described in the instructions." />
            <p className="text-xs text-slate-500">Late submissions are accepted and timestamped. Do not include patient identifiers.</p>
            <Button disabled={busy || !response.trim()} type="submit"><Send className="h-4 w-4" />{busy ? "Submitting…" : "Submit work"}</Button>
          </form> : selected.response && <section><h4 className="font-semibold">Student submission</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm">{selected.response}</p>
            <p className="mt-2 text-xs text-slate-500">Submitted {selected.submittedAt && new Date(selected.submittedAt).toLocaleString()}</p></section>}
          {!isStudent && selected.status === "submitted" && <div className="space-y-3">
            <Label htmlFor="assignment-feedback">Review feedback</Label><Textarea id="assignment-feedback" rows={4} maxLength={10000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <div className="flex flex-wrap gap-2"><Button disabled={busy || !feedback.trim()} onClick={() => act("completed")}><CheckCircle2 className="h-4 w-4" />Mark completed</Button>
              <Button variant="outline" disabled={busy || !feedback.trim()} onClick={() => act("returned")}><RotateCcw className="h-4 w-4" />Return for revision</Button></div>
          </div>}
        </div>}
      </DialogContent>
    </Dialog>
    {creating && <CreateAssignment onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await fetchPage(); }} />}
  </div>;
}

function CreateAssignment({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [types, setTypes] = React.useState<AssignmentType[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = React.useState<Map<number, Student>>(new Map());
  const [search, setSearch] = React.useState("");
  const [typeId, setTypeId] = React.useState("");
  const [newType, setNewType] = React.useState(false);
  const [typeName, setTypeName] = React.useState("");
  const [typeDescription, setTypeDescription] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [typeError, setTypeError] = React.useState("");
  const [studentError, setStudentError] = React.useState("");
  React.useEffect(() => {
    const controller = new AbortController();
    apiGet<AssignmentType[]>("/api/assignments/types", { signal: controller.signal }).then(setTypes)
      .catch((err) => { if (!controller.signal.aborted) setTypeError(err.message); });
    return () => controller.abort();
  }, []);
  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      apiGet<Student[]>(`/api/assignments/students?search=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then((rows) => { setStudents(rows); setStudentError(""); })
        .catch((err) => { if (!controller.signal.aborted) setStudentError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const due = String(new FormData(e.currentTarget as HTMLFormElement).get("dueAt") || "");
    setBusy(true); setError("");
    try {
      let chosenType = Number(typeId);
      if (newType) {
        const created = await apiPost<AssignmentType>("/api/assignments/types", { name: typeName, description: typeDescription });
        chosenType = created.id; setTypes((current) => [...current, created]); setTypeId(String(created.id)); setNewType(false);
      }
      await apiPost("/api/assignments", { typeId: chosenType, title, instructions, dueAt: new Date(due).toISOString(), studentIds: [...selectedStudents.keys()] });
      toast.success("Assignment sent to students"); await onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create assignment"); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent onInteractOutside={(event) => event.preventDefault()} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>New assignment</DialogTitle>
      <DialogDescription>Choose a type and the students who should complete this work.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={save}>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {typeError && <p role="alert" className="text-sm text-rose-700">Could not load assignment types: {typeError}. Close and reopen this form to retry.</p>}
        {studentError && <p role="alert" className="text-sm text-rose-700">Could not load students: {studentError}. Change the search to retry.</p>}
        <div className="space-y-2"><Label htmlFor="assignment-type">Assignment type</Label>
          <select id="assignment-type" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" value={newType ? "new" : typeId} required
            onChange={(e) => { setNewType(e.target.value === "new"); if (e.target.value !== "new") setTypeId(e.target.value); }}>
            <option value="" disabled>Select type</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="new">Create an assignment type…</option>
          </select></div>
        {newType && <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
          <Label htmlFor="type-name">Type name</Label><Input id="type-name" required maxLength={160} value={typeName} onChange={(e) => setTypeName(e.target.value)} />
          <Label htmlFor="type-description">What does this type of work involve?</Label><Textarea id="type-description" required maxLength={2000} value={typeDescription} onChange={(e) => setTypeDescription(e.target.value)} />
        </div>}
        <div className="space-y-2"><Label htmlFor="assignment-title">Title</Label><Input id="assignment-title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="assignment-instructions">Instructions and expected submission</Label><Textarea id="assignment-instructions" required rows={5} maxLength={16000} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="assignment-due">Due date and time</Label><Input id="assignment-due" name="dueAt" type="datetime-local" required /></div>
        <fieldset className="space-y-3"><legend className="text-sm font-semibold">Students ({selectedStudents.size} selected)</legend>
          <Input aria-label="Search approved students" placeholder="Search approved students by name" value={search} onChange={(e) => setSearch(e.target.value)} />
          <p className="text-xs text-slate-500">Select up to 100 students. Search to find students beyond the first 100 results.</p>
          <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border p-3">
            {loading ? <p role="status" className="text-sm">Loading students…</p> : !students.length ? <p className="text-sm text-slate-500">No approved students match.</p> : students.map((s) => <label key={s.id} className="flex cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={selectedStudents.has(s.id)} disabled={!selectedStudents.has(s.id) && selectedStudents.size >= 100}
                onChange={(e) => setSelectedStudents((previous) => { const next = new Map(previous); if (e.target.checked) next.set(s.id, s); else next.delete(s.id); return next; })} />
              <span>{s.name} <span className="text-xs text-slate-500">{s.registrationNumber}</span></span></label>)}
          </div>
          {!!selectedStudents.size && <div className="flex flex-wrap gap-1">{[...selectedStudents.values()].map((s) => <button type="button" className="rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-800" key={s.id}
            aria-label={`Remove ${s.name}`} onClick={() => setSelectedStudents((previous) => { const next = new Map(previous); next.delete(s.id); return next; })}>{s.name} ×</button>)}</div>}
        </fieldset>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !selectedStudents.size}>{busy ? "Assigning…" : "Assign work"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
