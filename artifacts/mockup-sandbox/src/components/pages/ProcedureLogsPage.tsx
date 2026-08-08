import * as React from "react";
import { AlertCircle, CheckCircle2, Clock, PlusCircle, Stethoscope, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
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
import { formatLogbookDate, PROCEDURE_GROUPS, PROCEDURE_REQUIREMENTS, REQUIRED_PROCEDURE_COUNT, todayForInput, type ProcedureGroup } from "@/lib/logbook-config";

type ProcedureLog = {
  id: number;
  number: number;
  date: string;
  group: ProcedureGroup;
  patientUhid: string;
  procedureName: string;
  age: string;
  experience: string;
  verifiedCompetency: string;
  status: "pending" | "verified" | "revision";
  procedureGroup: string;
  patientAge: string;
  competencyLevel: string;
};


const groupNames: Record<ProcedureGroup, string> = {
  emergency: "Emergency procedures",
  invasive: "Invasive procedures",
};

export function ProcedureLogsPage() {
  const [open, setOpen] = React.useState(false);
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    date: todayForInput(),
    group: "emergency" as ProcedureGroup,
    procedureName: "",
    patientUhid: "",
    age: "",
    experience: "Observed / procedure seen",
    supervisorId: "",
  });
  const loggedCounts = React.useMemo(
    () => Object.fromEntries(PROCEDURE_REQUIREMENTS.map((requirement) => [
      requirement.name,
      logs.filter((log) => log.procedureName === requirement.name).length,
    ])),
    [logs],
  );

  const setGroup = (group: ProcedureGroup) => setForm({ ...form, group, procedureName: "" });

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
      const sortedLogs = (data.procedureLogs || []).sort((a: any, b: any) => b.id - a.id);
      setLogs(sortedLogs.map((log: any, index: number) => ({ ...log, number: sortedLogs.length - index })));
    } catch (err: any) {
      setError(err.message || "Failed to load procedure logs");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  async function handleDeleteProcedureLog(logId: number) {
    if (!window.confirm("Delete this log? This cannot be undone.")) return;
    
    try {
      const res = await apiDelete(`/api/students/${user!.studentProfileId}/procedure-logs/${logId}`);
      if (res.error) {
        toast.error("Failed to delete log: " + res.error);
        return;
      }
      setLogs(prev => prev.filter(log => log.id !== logId));
      toast.success("Log deleted successfully");
    } catch (error) {
      toast.error("An error occurred");
    }
  }

  React.useEffect(() => {
    fetchLogs();
    if (user?.departmentId) {
      apiGet(`/api/departments/${user.departmentId}/professors`).then(setProfessors).catch(console.error);
    }
  }, [fetchLogs, user?.departmentId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.supervisorId) {
      toast.error("Please select a reviewing professor");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        procedureGroup: form.group,
        procedureName: form.procedureName,
        date: form.date,
        patientUhid: form.patientUhid,
        patientAge: form.age,
        competencyLevel: form.experience === "Observed / procedure seen" ? "observed" :
          form.experience === "Assisted" ? "assisted" :
          form.experience === "Performed under supervision" ? "performed_under_supervision" : "performed_independently",
        supervisorId: form.supervisorId,
      };
      
      await apiPost(`/api/students/${user?.studentProfileId}/procedure-logs`, payload);

      await fetchLogs();
      setOpen(false);
      setForm({
        date: todayForInput(),
        group: "emergency",
        procedureName: "",
        patientUhid: "",
        age: "",
        experience: "Observed / procedure seen",
        supervisorId: "",
      });
      toast.success(`Procedure submitted successfully`);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit procedure log");
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
          <p className="page-eyebrow">Procedures seen and performed</p>
          <h2 className="page-title mt-1">Procedure log</h2>
          <p className="mt-2 text-sm text-slate-500">Emergency and invasive procedure exposure, with competency verified only by the reviewing professor.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><PlusCircle className="h-4 w-4" /> Log procedure</Button></DialogTrigger>
          <DialogContent className="rounded-2xl bg-white sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>New procedure entry</DialogTitle>
              <DialogDescription>Select the required procedure and record the level of exposure.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
                <Field label="Procedure group">
                  <Select value={form.group} onValueChange={(value: ProcedureGroup) => setGroup(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="emergency">Emergency procedures</SelectItem><SelectItem value="invasive">Invasive procedures</SelectItem></SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Procedure">
                <Select value={form.procedureName} onValueChange={(value) => setForm({ ...form, procedureName: value })}>
                  <SelectTrigger><SelectValue placeholder="Select a required procedure" /></SelectTrigger>
                  <SelectContent>{PROCEDURE_GROUPS[form.group].map((procedure) => <SelectItem key={procedure} value={procedure}>{procedure}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Patient UHID"><Input value={form.patientUhid} onChange={(e) => setForm({ ...form, patientUhid: e.target.value })} required /></Field>
                <Field label="Age"><Input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="e.g. 4 months" required /></Field>
              </div>
              <Field label="Procedure experience">
                <Select value={form.experience} onValueChange={(value) => setForm({ ...form, experience: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Observed / procedure seen">Observed / procedure seen</SelectItem>
                    <SelectItem value="Assisted">Assisted</SelectItem>
                    <SelectItem value="Performed under supervision">Performed under supervision</SelectItem>
                    <SelectItem value="Performed independently">Performed independently</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <p className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-[11px] leading-5 text-teal-800">
                Verified competency is not self-selected. It is assigned by a professor during procedure review.
              </p>
              <Field label="Reviewing professor">
                <Select value={form.supervisorId} onValueChange={(value) => setForm({ ...form, supervisorId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select a professor" /></SelectTrigger>
                  <SelectContent>
                    {professors.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Save draft</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send to professor
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(PROCEDURE_GROUPS) as ProcedureGroup[]).map((group) => {
          const completed = logs.filter((log) => log.group === group).length;
          return (
            <Card key={group} className={group === "emergency" ? "border-cyan-100" : "border-teal-100"}>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{groupNames[group]}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{completed} logged</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Stethoscope className="h-5 w-5" /></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
        <AlertCircle className="h-5 w-5 text-amber-700" />
        <p className="text-xs text-amber-900"><strong>{logs.length}/{REQUIRED_PROCEDURE_COUNT}</strong> required procedures logged. Continue adding procedures from the departmental list.</p>
      </div>

      <Card>
        <CardHeader className="border-b border-teal-100">
          <CardTitle className="text-lg">Number of procedures required</CardTitle>
          <p className="text-xs text-slate-500">The total is calculated from every required emergency and invasive procedure.</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Procedure</TableHead><TableHead>Group</TableHead><TableHead>Logged</TableHead><TableHead>Required</TableHead><TableHead>Remaining</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {PROCEDURE_REQUIREMENTS.map((requirement) => {
                const logged = loggedCounts[requirement.name] ?? 0;
                return (
                  <TableRow key={requirement.name}>
                    <TableCell className="font-semibold">{requirement.name}</TableCell>
                    <TableCell><Badge variant="outline" className="border-teal-100 bg-teal-50 text-teal-800">{groupNames[requirement.group]}</Badge></TableCell>
                    <TableCell>{logged}</TableCell>
                    <TableCell className="font-bold text-teal-800">{requirement.required}</TableCell>
                    <TableCell>{Math.max(requirement.required - logged, 0)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-teal-50/60">
                <TableCell className="font-bold" colSpan={3}>Combined target</TableCell>
                <TableCell className="font-bold text-teal-800">{REQUIRED_PROCEDURE_COUNT}</TableCell>
                <TableCell className="font-bold">{Math.max(REQUIRED_PROCEDURE_COUNT - logs.length, 0)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-teal-100"><CardTitle className="text-lg">Procedure entries sent</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm font-medium text-slate-500">Loading procedures...</p>
            </div>
          ) : logs.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Stethoscope className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No procedures logged yet</EmptyTitle>
                <EmptyDescription>Record emergency or invasive procedures to start building your competency history.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setOpen(true)}>Log procedure</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Date</TableHead><TableHead>Group</TableHead><TableHead>Procedure</TableHead><TableHead>Patient UHID</TableHead><TableHead>Age</TableHead><TableHead>Experience</TableHead><TableHead>Verified competency</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-bold">{log.number}</TableCell>
                    <TableCell>{formatLogbookDate(log.date)}</TableCell>
                    <TableCell><Badge variant="outline" className="border-teal-100 bg-teal-50 text-teal-800">{groupNames[log.procedureGroup as ProcedureGroup]}</Badge></TableCell>
                    <TableCell className="font-semibold">{log.procedureName}</TableCell>
                    <TableCell className="font-semibold text-teal-800">{log.patientUhid}</TableCell>
                    <TableCell>{log.patientAge || log.age}</TableCell>
                    <TableCell className="text-xs">{log.competencyLevel}</TableCell>
                    <TableCell className="text-xs">{log.verifiedCompetency || (log.status === 'verified' ? log.competencyLevel : 'Pending verification')}</TableCell>
                    <TableCell>{statusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">
                      {log.status === "pending" && (
                        <Button variant="ghost" size="sm" className="text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDeleteProcedureLog(log.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
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

function statusBadge(status: ProcedureLog["status"]) {
  if (status === "verified") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge>;
  if (status === "revision") return <Badge className="border-rose-200 bg-rose-50 text-rose-700"><AlertCircle className="mr-1 h-3 w-3" /> Revision</Badge>;
  return <Badge className="border-amber-200 bg-amber-50 text-amber-700"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>;
}
