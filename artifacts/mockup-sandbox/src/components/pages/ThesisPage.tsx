import * as React from "react";
import { Edit3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLogbookDate } from "@/lib/logbook-config";
import { apiGet, apiPost } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";

const dateFields = [
  ["protocolSubmissionDate", "Protocol submission"], ["iecClearanceDate", "IEC clearance"],
  ["dataCollectionStartDate", "Data collection start"], ["dataCollectionEndDate", "Data collection end"],
  ["submissionDate", "Thesis submission"],
] as const;
type DateKey = typeof dateFields[number][0];
type Thesis = { thesisTitle: string; guideId: number | null; coGuideId: number | null } & Record<DateKey, string | null>;
type Faculty = { id: number; fullName: string };
const emptyThesis: Thesis = { thesisTitle: "", guideId: null, coGuideId: null, protocolSubmissionDate: null,
  iecClearanceDate: null, dataCollectionStartDate: null, dataCollectionEndDate: null, submissionDate: null };

export function ThesisPage() {
  const user = getCurrentUser()!;
  const base = `/api/students/${user.studentProfileId}`;
  const [thesis, setThesis] = React.useState<Thesis | null>(null);
  const [draft, setDraft] = React.useState<Thesis>(emptyThesis);
  const [faculty, setFaculty] = React.useState<Faculty[]>([]);
  const [thesisOpen, setThesisOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [research, staff] = await Promise.all([
        apiGet<{ data: Thesis | null }>(`${base}/thesis`),
        apiGet<Faculty[]>(`/api/departments/${user.departmentId}/professors`),
      ]);
      setThesis(research.data); setFaculty(staff);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load thesis"); }
    finally { setLoading(false); }
  }, [base, user.departmentId]);
  React.useEffect(() => { void load(); }, [load]);

  async function saveThesis(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      // Only editable fields are sent; approval status and student identity stay server-controlled.
      const body = { thesisTitle: draft.thesisTitle, guideId: draft.guideId, coGuideId: draft.coGuideId,
        ...Object.fromEntries(dateFields.map(([key]) => [key, draft[key] ?? null])) };
      await apiPost(`${base}/thesis`, body);
      setThesisOpen(false); toast.success("Thesis milestones saved"); await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to save milestones"); }
    finally { setBusy(false); }
  }
  const guideName = (id: number | null) => faculty.find((person) => person.id === id)?.fullName || (id ? "Inactive faculty member" : "Not selected");
  return <div className="space-y-6 pb-12">
    <div><p className="page-eyebrow">Research</p><h2 className="page-title mt-1">Thesis</h2>
      <p className="mt-2 text-sm text-slate-500">Record your research timeline and milestones.</p></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error} <Button variant="outline" onClick={load}>Try again</Button></div>}
    {loading ? <p role="status">Loading thesis…</p> : !error && <>
      <Card className="overflow-hidden border-white/70 bg-white/80">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div><p className="page-eyebrow">Thesis milestone tracker</p>
            <CardTitle className="mt-2 max-w-3xl text-xl">{thesis?.thesisTitle || "No thesis recorded yet"}</CardTitle>
            {thesis && <p className="mt-2 text-sm text-slate-600">Guide: {guideName(thesis.guideId)} · Co-guide: {guideName(thesis.coGuideId)}</p>}
            {thesis && (thesis as any).facultyRemarks && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold text-amber-800">Guide remarks</p>
                <p className="mt-0.5 text-xs text-amber-700">{(thesis as any).facultyRemarks}</p>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDraft(thesis || emptyThesis); setThesisOpen(true); }}><Edit3 className="h-4 w-4" /> {thesis ? "Edit thesis" : "Add thesis"}</Button>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {dateFields.map(([key, label]) => <div key={key} className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-sm">{thesis?.[key] ? formatLogbookDate(thesis[key]!) : "Not recorded"}</p>
          </div>)}
        </CardContent>
      </Card>
    </>}
    <Dialog open={thesisOpen} onOpenChange={(open) => { if (!busy) setThesisOpen(open); }}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()} className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit thesis milestones</DialogTitle><DialogDescription>Choose guides from your department. Leave unknown dates blank.</DialogDescription></DialogHeader>
        <form onSubmit={saveThesis} className="space-y-4">
          <Field label="Topic"><Input required maxLength={4000} value={draft.thesisTitle} onChange={(e) => setDraft({ ...draft, thesisTitle: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">{(["guideId", "coGuideId"] as const).map((key) => <Field key={key} label={key === "guideId" ? "Guide" : "Co-guide (optional)"}>
            <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" required={key === "guideId"} value={draft[key] ?? ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Select faculty</option>{faculty.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          </Field>)}</div>
          <div className="grid gap-4 sm:grid-cols-2">{dateFields.map(([key, label]) => <Field key={key} label={label}>
            <Input type="date" value={draft[key] || ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value || null })} />
          </Field>)}</div>
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setThesisOpen(false)}>Cancel</Button><Button disabled={busy || !faculty.length}>{busy ? "Saving…" : "Save milestones"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactElement }) {
  const id = React.useId();
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{React.cloneElement(children as React.ReactElement<{ id: string }>, { id })}</div>;
}
