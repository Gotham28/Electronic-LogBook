import * as React from "react";
import { AlertCircle, CheckCircle2, Clock, Eye, FileText, PlusCircle, Search, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
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
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { formatLogbookDate, todayForInput } from "@/lib/logbook-config";

type CaseLog = {
  number: number;
  date: string;
  patientUhid: string;
  age: string;
  gender: string;
  chiefComplaints: string;
  history: string;
  examination: string;
  investigations: string;
  diagnosis: string;
  differentialDiagnosis: string;
  management: string;
  outcome: string;
  learningPoints: string;
  status: "pending" | "verified" | "revision";
  remarks: string;
};


const emptyForm = {
  date: todayForInput(),
  patientUhid: "",
  age: "",
  gender: "Male",
  chiefComplaints: "",
  history: "",
  examination: "",
  investigations: "",
  diagnosis: "",
  differentialDiagnosis: "",
  management: "",
  outcome: "",
  learningPoints: "",
  supervisorId: "",
};

export function CaseLogsPage() {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedLog, setSelectedLog] = React.useState<any | null>(null);
  const [caseLogs, setCaseLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(emptyForm);

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
      // Sort so newest are first
      const sortedLogs = (data.caseLogs || []).sort((a: any, b: any) => b.id - a.id);
      setCaseLogs(sortedLogs.map((log: any, index: number) => ({ ...log, number: sortedLogs.length - index })));
    } catch (err: any) {
      setError(err.message || "Failed to load case logs");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    fetchLogs();
    if (user?.departmentId) {
      apiGet(`/api/departments/${user.departmentId}/professors`).then(setProfessors).catch(console.error);
    }
  }, [fetchLogs, user?.departmentId]);

  const handleAddCase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.supervisorId) {
      toast.error("Please select a reviewing professor");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        date: form.date,
        patientUhid: form.patientUhid,
        patientAge: form.age,
        patientGender: form.gender.toLowerCase(),
        chiefComplaints: form.chiefComplaints,
        history: form.history,
        examination: form.examination,
        investigations: form.investigations,
        diagnosisProvisional: form.diagnosis,
        diagnosisFinal: form.diagnosis, 
        differentialDiagnosis: form.differentialDiagnosis,
        managementPlan: form.management,
        outcome: form.outcome,
        learningPoints: form.learningPoints,
        supervisorId: form.supervisorId,
      };
      
      await apiPost(`/api/students/${user?.studentProfileId}/case-logs`, payload);
      
      await fetchLogs();
      setForm({ ...emptyForm, date: todayForInput() });
      setIsModalOpen(false);
      toast.success(`Case submitted successfully`);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit case log");
    } finally {
      setIsSubmitting(false);
    }
  };

  async function handleDeleteCaseLog(logId: number) {
    if (!window.confirm("Delete this log? This cannot be undone.")) return;
    
    try {
      await apiDelete(`/api/students/${user!.studentProfileId}/case-logs/${logId}`);
      setCaseLogs(prev => prev.filter(log => log.id !== logId));
      toast.success("Log deleted successfully");
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    }
  }

  const search = searchTerm.toLowerCase();
  const filteredLogs = caseLogs.filter((log) =>
    [log.number, log.diagnosis, log.patientUhid, log.chiefComplaints]
      .some((value) => String(value).toLowerCase().includes(search)),
  );

  const setField = (field: keyof typeof form, value: string) => setForm({ ...form, [field]: value });

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
          <p className="page-eyebrow">Clinical case exposure</p>
          <h2 className="page-title mt-1">Cases presented</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Structured histories, examinations, investigations, management and learning reflections for every presented case.
          </p>
        </div>
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button><PlusCircle className="h-4 w-4" /> Log clinical case</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl bg-white sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl"><FileText className="h-5 w-5 text-teal-600" /> New clinical case</DialogTitle>
              <DialogDescription>Complete the clinical record before sending it to a professor.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddCase} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} required /></Field>
                <Field label="Patient UHID"><Input value={form.patientUhid} onChange={(e) => setField("patientUhid", e.target.value)} placeholder="UHID-2026-…" /></Field>
                <Field label="Age"><Input value={form.age} onChange={(e) => setField("age", e.target.value)} placeholder="e.g. 7 years" required /></Field>
                <Field label="Gender">
                  <Select value={form.gender} onValueChange={(value) => setField("gender", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Chief complaints"><Textarea rows={2} value={form.chiefComplaints} onChange={(e) => setField("chiefComplaints", e.target.value)} /></Field>
              <Field label="Relevant history"><Textarea rows={3} value={form.history} onChange={(e) => setField("history", e.target.value)} /></Field>
              <Field label="Clinical examination"><Textarea rows={3} value={form.examination} onChange={(e) => setField("examination", e.target.value)} /></Field>
              <Field label="Investigations"><Textarea rows={2} value={form.investigations} onChange={(e) => setField("investigations", e.target.value)} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Final diagnosis"><Input value={form.diagnosis} onChange={(e) => setField("diagnosis", e.target.value)} required /></Field>
                <Field label="Differential diagnosis"><Input value={form.differentialDiagnosis} onChange={(e) => setField("differentialDiagnosis", e.target.value)} /></Field>
              </div>
              <Field label="Management and interventions"><Textarea rows={3} value={form.management} onChange={(e) => setField("management", e.target.value)} /></Field>
              <Field label="Outcome / follow-up"><Textarea rows={2} value={form.outcome} onChange={(e) => setField("outcome", e.target.value)} /></Field>
              <Field label="Learning points"><Textarea rows={2} value={form.learningPoints} onChange={(e) => setField("learningPoints", e.target.value)} /></Field>
              <Field label="Reviewing professor">
                <Select value={form.supervisorId} onValueChange={(value) => setField("supervisorId", value)}>
                  <SelectTrigger><SelectValue placeholder="Select a professor" /></SelectTrigger>
                  <SelectContent>
                    {professors.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Save draft</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send to professor
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-col justify-between gap-4 border-b border-teal-100 md:flex-row md:items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-teal-600" />
            <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-11 pl-9 pr-24" placeholder="Search patient, UHID or diagnosis..." />
            <div className="pointer-events-none absolute right-3 top-2.5 flex items-center gap-1">
              <Kbd>Ctrl</Kbd>
              <span className="text-[10px] text-slate-400">+</span>
              <Kbd>K</Kbd>
            </div>
          </div>
          <Badge variant="outline" className="w-fit border-teal-100 bg-teal-50 px-3 py-1 text-teal-800">{caseLogs.length} of 50 cases logged</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm font-medium text-slate-500">Loading cases...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center space-y-4 text-slate-500">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                <FileText className="h-6 w-6" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-base font-semibold text-slate-950">No cases found</p>
                <p className="max-w-sm text-sm leading-6 text-slate-500">Try a different UHID, diagnosis, or case number, or clear the search to see all records.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient UHID</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-bold">{log.number}</TableCell>
                    <TableCell>{formatLogbookDate(log.date)}</TableCell>
                    <TableCell className="font-semibold text-teal-800">{log.patientUhid}</TableCell>
                    <TableCell>{log.patientAge || log.age}</TableCell>
                    <TableCell><p className="max-w-sm font-semibold text-slate-900">{log.diagnosisProvisional || log.diagnosis}</p></TableCell>
                    <TableCell>{statusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {log.status === "pending" && (
                          <Button variant="ghost" size="sm" className="text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDeleteCaseLog(log.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}><Eye className="h-4 w-4" /> Details</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl bg-white sm:max-w-3xl">
          {selectedLog && (
            <>
              <DialogHeader>
                <p className="page-eyebrow">Case number {selectedLog.number} • {formatLogbookDate(selectedLog.date)}</p>
                <DialogTitle className="text-2xl">{selectedLog.diagnosisProvisional || selectedLog.diagnosis}</DialogTitle>
                <DialogDescription>{selectedLog.patientUhid} • {selectedLog.patientAge || selectedLog.age} • {selectedLog.patientGender || selectedLog.gender}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <Detail label="Chief complaints" value={selectedLog.chiefComplaints} />
                <Detail label="Relevant history" value={selectedLog.history} />
                <Detail label="Clinical examination" value={selectedLog.examination} />
                <Detail label="Investigations" value={selectedLog.investigations} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Detail label="Final diagnosis" value={selectedLog.diagnosisProvisional || selectedLog.diagnosis} />
                  <Detail label="Differential diagnosis" value={selectedLog.differentialDiagnosis} />
                </div>
                <Detail label="Management and interventions" value={selectedLog.managementPlan || selectedLog.management} />
                <Detail label="Outcome / follow-up" value={selectedLog.outcome} />
                <Detail label="Learning points" value={selectedLog.learningPoints} />
                {(selectedLog.comments || selectedLog.remarks) && (
                  <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Professor remarks</p>
                    <p className="mt-1 text-sm text-teal-950">{selectedLog.comments || selectedLog.remarks}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">{label}</p><p className="mt-1 text-sm leading-6 text-slate-700">{value || "Not recorded"}</p></div>;
}

function statusBadge(status: CaseLog["status"]) {
  if (status === "verified") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge>;
  if (status === "revision") return <Badge className="border-rose-200 bg-rose-50 text-rose-700"><AlertCircle className="mr-1 h-3 w-3" /> Revision</Badge>;
  return <Badge className="border-amber-200 bg-amber-50 text-amber-700"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>;
}
