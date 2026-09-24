import * as React from "react";
import { CheckCircle2, Clock, MapPin, PlusCircle, Loader2, Presentation } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatLogbookDate, todayForInput } from "@/lib/logbook-config";
import { useDepartment } from "@/lib/department-context";

export function ConferencesPage() {
  const [open, setOpen] = React.useState(false);
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    date: todayForInput(),
    conferenceName: "",
    role: "attended",
    location: "",
    certificateUrl: "",
    supervisorId: "",
  });

  const user = React.useMemo(() => getCurrentUser(), []);
  const [professors, setProfessors] = React.useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fetchLogs = React.useCallback(async () => {
    if (!user?.studentProfileId) {
      setError("Not logged in");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await apiGet(`/api/students/${user.studentProfileId}/logs`);
      const sortedLogs = (data.conferenceLogs || []).sort((a: any, b: any) => b.id - a.id);
      setLogs(sortedLogs.map((log: any, index: number) => ({ 
        ...log, 
        number: sortedLogs.length - index,
        faculty: log.supervisorName || "—",
      })));
    } catch (err: any) {
      setError(err.message || "Failed to load conference logs");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    if (user?.departmentId) {
      apiGet(`/api/departments/${user.departmentId}/professors`).then(setProfessors).catch(console.error);
    }
  }, [user?.departmentId]);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    setIsSubmitting(true);
    try {
      const payload = {
        conferenceName: form.conferenceName,
        role: form.role,
        date: form.date,
        location: form.location || null,
        certificateUrl: form.certificateUrl || null,
        supervisorId: form.supervisorId === "none" ? null : form.supervisorId || null,
      };
      
      await apiPost(`/api/students/${user?.studentProfileId}/conference-logs`, payload);
      
      await fetchLogs();
      setOpen(false);
      setForm({ ...form, conferenceName: "", location: "", certificateUrl: "", supervisorId: "" });
      toast.success(`Conference log submitted successfully`);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit conference log");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {error && (
        <div className="flex flex-col items-center justify-center p-8 text-center border rounded-2xl bg-rose-50 border-rose-100">
          <p className="text-rose-700 mb-4">{error}</p>
          <Button onClick={fetchLogs} variant="outline" className="border-rose-200 text-rose-700">Try Again</Button>
        </div>
      )}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="page-eyebrow">Professional Development</p>
          <h2 className="page-title mt-1">Attended Conferences</h2>
          <p className="mt-2 text-sm text-slate-500">Log conferences you have attended or presented at.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><PlusCircle className="h-4 w-4" /> Log conference</Button></DialogTrigger>
          <DialogContent className="rounded-2xl bg-white sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New conference log</DialogTitle>
              <DialogDescription>Add details about a conference you attended or presented at.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
                <Field label="Role">
                  <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attended">Attended</SelectItem>
                      <SelectItem value="presented">Presented</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Conference Name">
                <Input value={form.conferenceName} onChange={(e) => setForm({ ...form, conferenceName: e.target.value })} required />
              </Field>
              <Field label="Location (optional)"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={160} /></Field>
              <Field label="Certificate URL (optional)"><Input type="url" placeholder="https://" value={form.certificateUrl} onChange={(e) => setForm({ ...form, certificateUrl: e.target.value })} /></Field>
              <Field label="Reviewing faculty (optional)">
                <Select value={form.supervisorId} onValueChange={(value) => setForm({ ...form, supervisorId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select a faculty member" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (skip verification)</SelectItem>
                    {professors.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit log
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Awaiting review" value={logs.filter((log) => log.status === "pending").length} />
        <Summary label="Verified logs" value={logs.filter((log) => log.status === "verified").length} />
        <Summary label="Total conferences" value={logs.length} />
      </div>

      <Card>
        <CardHeader className="border-b border-teal-100"><CardTitle className="flex items-center gap-2 text-lg"><Presentation className="h-5 w-5 text-teal-600" /> Conference record</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm font-medium text-slate-500">Loading conference logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Presentation className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No conference logs yet</EmptyTitle>
                <EmptyDescription>Conferences you attend or present at will appear here.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setOpen(true)}>Log conference</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Date</TableHead><TableHead>Conference</TableHead><TableHead>Role</TableHead><TableHead>Location</TableHead><TableHead>Reviewing faculty</TableHead><TableHead>Remarks</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-bold">{log.number}</TableCell>
                    <TableCell>{formatLogbookDate(log.date)}</TableCell>
                    <TableCell className="max-w-sm font-semibold">{log.conferenceName}</TableCell>
                    <TableCell><Badge variant="outline" className="border-teal-100 bg-teal-50 text-teal-800 capitalize">{log.role}</Badge></TableCell>
                    <TableCell>{log.location ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{log.location}</span> : "—"}</TableCell>
                    <TableCell>{log.faculty}</TableCell>
                    <TableCell className="text-xs max-w-[160px]">
                      {log.status === "pending"
                        ? <span className="text-slate-400">—</span>
                        : log.facultyRemarks
                          ? <span title={log.facultyRemarks} className="block truncate cursor-help text-slate-600">{log.facultyRemarks}</span>
                          : <span className="text-slate-500">No remark</span>}
                    </TableCell>
                    <TableCell>{log.status === "verified" ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge> : log.status === "rejected" ? <Badge className="border-rose-200 bg-rose-50 text-rose-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Rejected</Badge> : <Badge className="border-amber-200 bg-amber-50 text-amber-700"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-5"><p className="text-3xl font-bold text-teal-700">{value}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p></CardContent></Card>;
}
