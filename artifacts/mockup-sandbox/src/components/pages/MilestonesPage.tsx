import * as React from "react";
import { Award, Edit3, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
type Certificate = { id: string; title: string; provider: string | null; issueDate: string; expiryDate: string; certificateUrl: string };
type Faculty = { id: number; fullName: string };
const emptyThesis: Thesis = { thesisTitle: "", guideId: null, coGuideId: null, protocolSubmissionDate: null,
  iecClearanceDate: null, dataCollectionStartDate: null, dataCollectionEndDate: null, submissionDate: null };
const emptyCertificate = { title: "", provider: "", issueDate: "", expiryDate: "", certificateUrl: "" };

export function MilestonesPage() {
  const user = getCurrentUser()!;
  const base = `/api/students/${user.studentProfileId}`;
  const [thesis, setThesis] = React.useState<Thesis | null>(null);
  const [draft, setDraft] = React.useState<Thesis>(emptyThesis);
  const [faculty, setFaculty] = React.useState<Faculty[]>([]);
  const [certificates, setCertificates] = React.useState<Certificate[]>([]);
  const [certificate, setCertificate] = React.useState(emptyCertificate);
  const [thesisOpen, setThesisOpen] = React.useState(false);
  const [certificateOpen, setCertificateOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [research, training, staff] = await Promise.all([
        apiGet<{ data: Thesis | null }>(`${base}/thesis`),
        apiGet<Certificate[]>(`${base}/certifications`),
        apiGet<Faculty[]>(`/api/departments/${user.departmentId}/professors`),
      ]);
      setThesis(research.data); setCertificates(training); setFaculty(staff);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load milestones"); }
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
  async function saveCertificate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await apiPost(`${base}/certifications`, certificate);
      setCertificateOpen(false); setCertificate(emptyCertificate); toast.success("Certificate saved"); await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to save certificate"); }
    finally { setBusy(false); }
  }
  const guideName = (id: number | null) => faculty.find((person) => person.id === id)?.fullName || (id ? "Inactive faculty member" : "Not selected");
  return <div className="space-y-6 pb-12">
    <div><p className="page-eyebrow">Research and training</p><h2 className="page-title mt-1">Thesis & certifications</h2>
      <p className="mt-2 text-sm text-slate-500">Record your research timeline and completed training.</p></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error} <Button variant="outline" onClick={load}>Try again</Button></div>}
    {loading ? <p role="status">Loading milestones…</p> : !error && <>
      <Card className="overflow-hidden border-white/70 bg-white/80">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div><p className="page-eyebrow">Thesis milestone tracker</p>
            <CardTitle className="mt-2 max-w-3xl text-xl">{thesis?.thesisTitle || "No thesis recorded yet"}</CardTitle>
            {thesis && <p className="mt-2 text-sm text-slate-600">Guide: {guideName(thesis.guideId)} · Co-guide: {guideName(thesis.coGuideId)}</p>}</div>
          <Button variant="outline" size="sm" onClick={() => { setDraft(thesis || emptyThesis); setThesisOpen(true); }}><Edit3 className="h-4 w-4" /> {thesis ? "Edit thesis" : "Add thesis"}</Button>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {dateFields.map(([key, label]) => <div key={key} className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-sm">{thesis?.[key] ? formatLogbookDate(thesis[key]!) : "Not recorded"}</p>
          </div>)}
        </CardContent>
      </Card>
      <Card className="border-white/70 bg-white/80">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-lg"><Award className="h-5 w-5 text-teal-600" /> Certifications</CardTitle>
          <Button size="sm" onClick={() => { setCertificate(emptyCertificate); setCertificateOpen(true); }}><PlusCircle className="h-4 w-4" /> Add certificate</Button>
        </CardHeader>
        <CardContent>
          {!certificates.length ? <p className="text-sm text-slate-500">No certificates recorded yet.</p> : <Table>
            <TableHeader><TableRow>{["Certificate", "Issuing body", "Date issued", "Expiry", "Status"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{certificates.map((item) => <TableRow key={item.id}>
              <TableCell className="font-semibold">{item.title}</TableCell><TableCell>{item.provider || "Not recorded"}</TableCell>
              <TableCell>{formatLogbookDate(item.issueDate)}</TableCell><TableCell>{formatLogbookDate(item.expiryDate)}</TableCell>
              <TableCell>{item.expiryDate.slice(0, 10) < new Date().toISOString().slice(0, 10) ? "Expired" : "Current (self-reported)"}</TableCell>
            </TableRow>)}</TableBody>
          </Table>}
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
    <Dialog open={certificateOpen} onOpenChange={(open) => { if (!busy) setCertificateOpen(open); }}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()} className="max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader><DialogTitle>Add certificate</DialogTitle><DialogDescription>Record a completed course and a secure link to its certificate.</DialogDescription></DialogHeader>
        <form onSubmit={saveCertificate} className="space-y-4">
          {(["title", "provider", "issueDate", "expiryDate", "certificateUrl"] as const).map((key) => <Field key={key} label={{ title: "Certificate", provider: "Issuing body", issueDate: "Date issued", expiryDate: "Expiry date", certificateUrl: "Certificate URL (HTTPS)" }[key]}>
            <Input required maxLength={key === "certificateUrl" ? 2000 : 160} type={key.endsWith("Date") ? "date" : key === "certificateUrl" ? "url" : "text"} value={certificate[key]} onChange={(e) => setCertificate({ ...certificate, [key]: e.target.value })} />
          </Field>)}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setCertificateOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save certificate"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactElement }) {
  const id = React.useId();
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{React.cloneElement(children as React.ReactElement<{ id: string }>, { id })}</div>;
}
