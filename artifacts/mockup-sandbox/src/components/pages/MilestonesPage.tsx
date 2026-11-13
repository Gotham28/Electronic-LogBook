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
import { apiGet, apiPost, apiPatch, apiPutFile, openCertificateFile } from "@/lib/apiClient";
import { compressImage, MAX_PDF_BYTES } from "@/lib/compressImage";
import { getCurrentUser } from "@/lib/session";
import { useDepartment } from "@/lib/department-context";

const dateFields = [
  ["protocolSubmissionDate", "Protocol submission"], ["iecClearanceDate", "IEC clearance"],
  ["dataCollectionStartDate", "Data collection start"], ["dataCollectionEndDate", "Data collection end"],
  ["submissionDate", "Thesis submission"],
] as const;
type DateKey = typeof dateFields[number][0];
type Thesis = { thesisTitle: string; guideId: number | null; coGuideId: number | null } & Record<DateKey, string | null>;
type Certificate = { id: string; title: string; provider: string | null; issueDate: string; expiryDate: string; certificateUrl: string | null; certificateFileType?: string | null; certificateFileName?: string | null };
type Faculty = { id: number; fullName: string };
const emptyThesis: Thesis = { thesisTitle: "", guideId: null, coGuideId: null, protocolSubmissionDate: null,
  iecClearanceDate: null, dataCollectionStartDate: null, dataCollectionEndDate: null, submissionDate: null };
const emptyCertificate = { title: "", provider: "", issueDate: "", expiryDate: "", certificateUrl: "" };

export function MilestonesPage() {
  const { config, department } = useDepartment();
  const isMicrobiology = department?.code?.toLowerCase() === "microbiology" || department?.name?.toLowerCase().includes("microbiology");
  const pageTitle = (config?.enabledFeatures?.useThesisAndMandatoryCertificationsLabel || isMicrobiology)
    ? "Thesis and mandatory certifications"
    : "Thesis & certifications";
  const user = getCurrentUser()!;
  const base = `/api/students/${user.studentProfileId}`;
  const [thesis, setThesis] = React.useState<Thesis | null>(null);
  const [draft, setDraft] = React.useState<Thesis>(emptyThesis);
  const [faculty, setFaculty] = React.useState<Faculty[]>([]);
  const [certificates, setCertificates] = React.useState<Certificate[]>([]);
  const [certificate, setCertificate] = React.useState(emptyCertificate);
  const [thesisOpen, setThesisOpen] = React.useState(false);
  const [certificateOpen, setCertificateOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
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
  const [mode, setMode] = React.useState<"file" | "link">("file");
  const [file, setFile] = React.useState<{ blob: Blob; name: string; size: number } | null>(null);
  const [fileError, setFileError] = React.useState("");
  React.useEffect(() => { if (!certificateOpen) { setFile(null); setFileError(""); setMode("file"); } }, [certificateOpen]);

  const [preparing, setPreparing] = React.useState(false);
  const storedFileOnEdit = Boolean(editId && certificates.find((item) => item.id === editId)?.certificateFileType);
  React.useEffect(() => { if (storedFileOnEdit) setMode("file"); }, [storedFileOnEdit]);

  async function chooseFile(input: File | undefined) {
    setFileError(""); setFile(null);
    if (!input) return;
    setPreparing(true);
    try {
      if (input.type === "application/pdf") {
        if (input.size > MAX_PDF_BYTES) throw new Error("A PDF must be 2 MB or smaller");
        setFile({ blob: input, name: input.name, size: input.size });
      } else if (["image/jpeg", "image/png", "image/webp"].includes(input.type)) {
        const { blob, size } = await compressImage(input);
        setFile({ blob, name: input.name.replace(/\.[^.]+$/, "") + ".jpg", size });
      } else throw new Error("Choose a JPG, PNG, WebP or PDF file");
    } catch (err) { setFileError(err instanceof Error ? err.message : "Could not read this file"); }
    finally { setPreparing(false); }
  }

  function viewFile(certId: string) {
    openCertificateFile(user.studentProfileId!, certId).catch((err) => toast.error(err instanceof Error ? err.message : "Unable to open certificate"));
  }

  async function saveCertificate(event: React.FormEvent) {
    event.preventDefault();
    if (preparing) return;
    const hasStoredFile = Boolean(editId && certificates.find((item) => item.id === editId)?.certificateFileType);
    if (mode === "file" && !file && !hasStoredFile) { setFileError("Choose a file to upload"); return; }
    const { certificateUrl: _url, ...fields } = certificate;
    const payload = mode === "link" ? certificate : fields;
    setBusy(true);
    try {
      let savedId = editId;
      try {
        if (editId) {
          await apiPatch(`${base}/certifications/${editId}`, payload);
        } else {
          const created = await apiPost(`${base}/certifications`, payload);
          savedId = created.id; setEditId(created.id);
        }
      } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to save certificate"); return; }
      if (mode === "file" && file) {
        try { await apiPutFile(`${base}/certifications/${savedId}/file`, file.blob, file.name); }
        catch (err) {
          setFileError(`Certificate saved, but the file was not uploaded${err instanceof Error ? ` (${err.message})` : ""}. Press Save to try again.`);
          await load(); return;
        }
      }
      setCertificateOpen(false); setCertificate(emptyCertificate); toast.success("Certificate saved"); await load();
      setEditId(null);
    } finally { setBusy(false); }
  }
  const guideName = (id: number | null) => faculty.find((person) => person.id === id)?.fullName || (id ? "Inactive faculty member" : "Not selected");
  return <div className="space-y-6 pb-12">
    <div><p className="page-eyebrow">Research and training</p><h2 className="page-title mt-1">{pageTitle}</h2>
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
            <TableHeader><TableRow>{["Certificate", "Issuing body", "Date issued", "Expiry", "Status", ""].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{certificates.map((item) => <TableRow key={item.id}>
              <TableCell className="font-semibold">{item.title}
                <div className="mt-0.5 text-xs font-normal">
                  {item.certificateFileType
                    ? <button type="button" className="text-teal-600 hover:underline" onClick={() => viewFile(item.id)}>View certificate ↗</button>
                    : item.certificateUrl
                      ? <a href={item.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">View certificate ↗</a>
                      : <span className="text-slate-500">No file attached</span>}
                </div>
              </TableCell><TableCell>{item.provider || "Not recorded"}</TableCell>
              <TableCell>{formatLogbookDate(item.issueDate)}</TableCell><TableCell>{formatLogbookDate(item.expiryDate)}</TableCell>
              <TableCell>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  (item as any).status === "verified" ? "bg-emerald-100 text-emerald-700" :
                  (item as any).status === "rejected" ? "bg-rose-100 text-rose-700" :
                  "bg-amber-100 text-amber-700"
                }`}>
                  {(item as any).status === "verified" ? "Verified" : (item as any).status === "rejected" ? "Rejected" : "Pending review"}
                </span>
                {(item as any).facultyRemarks && (
                  <p className="mt-0.5 text-[10px] text-slate-500 italic">{(item as any).facultyRemarks}</p>
                )}
              </TableCell>
              <TableCell className="text-right">
                {(item as any).status === "pending" && (
                  <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-800 hover:bg-teal-50" onClick={() => {
                    setEditId(item.id);
                    setMode(!item.certificateFileType && item.certificateUrl ? "link" : "file");
                    setCertificate({ title: item.title, provider: item.provider || "", issueDate: item.issueDate.split('T')[0], expiryDate: item.expiryDate.split('T')[0], certificateUrl: item.certificateUrl || "" });
                    setCertificateOpen(true);
                  }}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
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
    <Dialog open={certificateOpen} onOpenChange={(open) => { if (!busy) { setCertificateOpen(open); if (!open) { setCertificate(emptyCertificate); setEditId(null); } } }}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()} className="max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader><DialogTitle>{editId ? "Edit certificate" : "Add certificate"}</DialogTitle><DialogDescription>Record a completed course and attach a photo or PDF of its certificate, or paste a secure link.</DialogDescription></DialogHeader>
        <form onSubmit={saveCertificate} className="space-y-4">
          {(["title", "provider", "issueDate", "expiryDate"] as const).map((key) => <Field key={key} label={{ title: "Certificate", provider: "Issuing body", issueDate: "Date issued", expiryDate: "Expiry date" }[key]}>
            <Input required maxLength={160} type={key.endsWith("Date") ? "date" : "text"} value={certificate[key]} onChange={(e) => setCertificate({ ...certificate, [key]: e.target.value })} />
          </Field>)}
          <div className="flex gap-2" role="group" aria-label="Certificate source">
            <Button type="button" size="sm" variant={mode === "file" ? "default" : "outline"} onClick={() => setMode("file")}>Upload file</Button>
            <Button type="button" size="sm" variant={mode === "link" ? "default" : "outline"} disabled={storedFileOnEdit} onClick={() => setMode("link")}>Paste link</Button>
          </div>
          {mode === "link"
            ? <Field label="Certificate URL (HTTPS)"><Input required maxLength={2000} type="url" value={certificate.certificateUrl} onChange={(e) => setCertificate({ ...certificate, certificateUrl: e.target.value })} /></Field>
            : <><Field label="Certificate file (JPG, PNG, WebP or PDF)"><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => void chooseFile(e.target.files?.[0])} /></Field>
              <p className="text-xs text-slate-500">Images are compressed before upload and may be up to 5 MB. PDFs may be up to 2 MB.</p></>}
          {storedFileOnEdit && <p className="text-xs text-slate-600">This certificate already has a stored file, so the stored file is what will be shown. Pasting a link is not available. Choose a new file below to replace it.</p>}
          {mode === "file" && preparing && <p role="status" className="text-xs text-slate-600">Preparing file…</p>}
          {mode === "file" && file && !preparing && <p className="text-xs text-slate-600">{file.name} — {(file.size / 1024).toFixed(0)} KB{file.blob.type === "application/pdf" ? "" : " after compression"}</p>}
          {fileError && <p role="alert" className="text-sm text-rose-700">{fileError}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setCertificateOpen(false)}>Cancel</Button><Button disabled={busy || preparing}>{busy ? "Saving…" : preparing ? "Preparing file…" : "Save certificate"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactElement }) {
  const id = React.useId();
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{React.cloneElement(children as React.ReactElement<{ id: string }>, { id })}</div>;
}
