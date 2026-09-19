import * as React from "react";
import { Award, PlusCircle } from "lucide-react";
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

type Certificate = { id: string; title: string; provider: string | null; issueDate: string; expiryDate: string; certificateUrl: string };
const emptyCertificate = { title: "", provider: "", issueDate: "", expiryDate: "", certificateUrl: "" };

export function CertificationsPage() {
  const user = getCurrentUser()!;
  const base = `/api/students/${user.studentProfileId}`;
  const [certificates, setCertificates] = React.useState<Certificate[]>([]);
  const [certificate, setCertificate] = React.useState(emptyCertificate);
  const [certificateOpen, setCertificateOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const training = await apiGet<Certificate[]>(`${base}/certifications`);
      setCertificates(training);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load certifications"); }
    finally { setLoading(false); }
  }, [base]);
  React.useEffect(() => { void load(); }, [load]);

  async function saveCertificate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await apiPost(`${base}/certifications`, certificate);
      setCertificateOpen(false); setCertificate(emptyCertificate); toast.success("Certificate saved"); await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Unable to save certificate"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6 pb-12">
    <div><p className="page-eyebrow">Training</p><h2 className="page-title mt-1">Certifications</h2>
      <p className="mt-2 text-sm text-slate-500">Record your completed training and certifications.</p></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error} <Button variant="outline" onClick={load}>Try again</Button></div>}
    {loading ? <p role="status">Loading certifications…</p> : !error && <>
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
