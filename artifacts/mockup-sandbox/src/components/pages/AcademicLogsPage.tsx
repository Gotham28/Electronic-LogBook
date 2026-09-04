import * as React from "react";
import { CheckCircle2, Clock, GraduationCap, PlusCircle, Loader2 } from "lucide-react";
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
import { ACADEMIC_REQUIREMENTS, formatLogbookDate, todayForInput } from "@/lib/logbook-config";

type AcademicLog = {
  number: number;
  date: string;
  type: string;
  presentationType: string;
  topic: string;
  faculty: string;
  status: "pending" | "verified";
};


const conferenceTypes = new Set(["Conference Presentation", "Symposia"]);

export function AcademicLogsPage() {
  const [open, setOpen] = React.useState(false);
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    date: todayForInput(),
    type: "Journal Club",
    presentationType: "Paper",
    topic: "",
    supervisorId: "",
  });

  const user = React.useMemo(() => getCurrentUser(), []);
  const [professors, setProfessors] = React.useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const reverseTypeMap: Record<string, string> = {
    "journal_club": "Journal Club",
    "seminar": "Seminar",
    "symposia": "Symposia",
    "bedside_presentation": "Case Discussion",
    "mortality_meeting": "Mortality Meeting",
    "conference_attended": "Conference Attended",
    "conference_presentation": "Conference Presentation"
  };

  const fetchLogs = React.useCallback(async () => {
    if (!user?.studentProfileId) {
      setError("Not logged in");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await apiGet(`/api/students/${user.studentProfileId}/logs`);
      const sortedLogs = (data.academicLogs || []).sort((a: any, b: any) => b.id - a.id);
      setLogs(sortedLogs.map((log: any, index: number) => ({ 
        ...log, 
        number: sortedLogs.length - index,
        type: reverseTypeMap[log.activityType] || log.activityType,
        presentationType: log.presentationType || "—",
        faculty: log.supervisorName || "Unknown",
      })));
    } catch (err: any) {
      setError(err.message || "Failed to load academic logs");
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
    if (!form.supervisorId) {
      toast.error("Please select a reviewing faculty member");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const typeMap: Record<string, string> = {
        "Journal Club": "journal_club",
        "Seminar": "seminar",
        "Symposia": "symposia",
        "Case Discussion": "bedside_presentation",
        "Interesting Case Presentation": "bedside_presentation",
        "Mortality Meeting": "mortality_meeting",
        "Conference Attended": "conference_attended",
        "Conference Presentation": "conference_presentation"
      };

      const payload = {
        activityType: typeMap[form.type] || "journal_club",
        presentationType: conferenceTypes.has(form.type) ? form.presentationType.toLowerCase().replace(" ", "_") : null,
        topic: form.topic,
        date: form.date,
        supervisorId: form.supervisorId,
      };
      
      await apiPost(`/api/students/${user?.studentProfileId}/academic-logs`, payload);
      
      await fetchLogs();
      setOpen(false);
      setForm({ ...form, topic: "", supervisorId: "" });
      toast.success(`Academic activity submitted successfully`);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit academic log");
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
          <p className="page-eyebrow">Academic record</p>
          <h2 className="page-title mt-1">Academic activities</h2>
          <p className="mt-2 text-sm text-slate-500">Presentations, journal clubs, seminars, symposia, mortality meetings and conferences.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><PlusCircle className="h-4 w-4" /> Log academic activity</Button></DialogTrigger>
          <DialogContent className="rounded-2xl bg-white sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New academic activity</DialogTitle>
              <DialogDescription>Add attendance or presentation details for faculty verification.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                <Field label="Activity category">
                  <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Journal Club">Journal club</SelectItem>
                      <SelectItem value="Seminar">Seminar</SelectItem>
                      <SelectItem value="Case Discussion">Case discussion</SelectItem>
                      <SelectItem value="Interesting Case Presentation">Interesting case presentation</SelectItem>
                      <SelectItem value="Symposia">Symposia</SelectItem>
                      <SelectItem value="Bedside Case Presentation">Bedside case presentation</SelectItem>
                      <SelectItem value="Mortality Meeting">Mortality meeting</SelectItem>
                      <SelectItem value="Conference Attended">Conference attended</SelectItem>
                      <SelectItem value="Conference Presentation">Conference presentation</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {conferenceTypes.has(form.type) && (
                <Field label="Presentation format">
                  <Select value={form.presentationType} onValueChange={(value) => setForm({ ...form, presentationType: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Poster">Poster</SelectItem>
                      <SelectItem value="Paper">Paper</SelectItem>
                      <SelectItem value="Case presentation">Case presentation</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label={form.type === "Conference Attended" ? "Conference name" : "Topic / title"}>
                <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} required />
              </Field>
              <Field label="Reviewing faculty member">
                <Select value={form.supervisorId} onValueChange={(value) => setForm({ ...form, supervisorId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select a faculty member" /></SelectTrigger>
                  <SelectContent>
                    {professors.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Save draft</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send to faculty
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Conferences attended" value={logs.filter((log) => log.type === "Conference Attended").length} />
        <Summary label="Conference presentations" value={logs.filter((log) => log.type === "Conference Presentation").length} />
        <Summary label="All academic activities" value={logs.length} />
      </div>

      <Card>
        <CardHeader className="border-b border-teal-100">
          <CardTitle className="text-lg">Mandatory academic requirements</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {ACADEMIC_REQUIREMENTS.map((requirement) => {
            const logged = logs.filter((log) => log.type === requirement.name).length;
            return (
              <div key={requirement.name} className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
                <p className="text-sm font-bold text-slate-900">{requirement.name}</p>
                <p className="mt-3 text-2xl font-bold text-teal-700">{requirement.target}</p>
                <p className="text-xs text-slate-500">{requirement.requirement}</p>
                <p className="mt-3 text-xs font-semibold text-slate-700">{logged} logged in this demo</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-teal-100"><CardTitle className="flex items-center gap-2 text-lg"><GraduationCap className="h-5 w-5 text-teal-600" /> Academic activity record</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm font-medium text-slate-500">Loading academic activities...</p>
            </div>
          ) : logs.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GraduationCap className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No academic activities yet</EmptyTitle>
                <EmptyDescription>Journal clubs, case discussions, and conferences will appear here once you log your first activity.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setOpen(true)}>Log academic activity</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Date</TableHead><TableHead>Activity</TableHead><TableHead>Presentation</TableHead><TableHead>Topic / conference</TableHead><TableHead>Reviewing faculty member</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-bold">{log.number}</TableCell>
                    <TableCell>{formatLogbookDate(log.date)}</TableCell>
                    <TableCell><Badge variant="outline" className="border-teal-100 bg-teal-50 text-teal-800">{log.type}</Badge></TableCell>
                    <TableCell>{log.presentationType}</TableCell>
                    <TableCell className="max-w-sm font-semibold">{log.topic}</TableCell>
                    <TableCell>{log.faculty}</TableCell>
                    <TableCell>{log.status === "verified" ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge> : <Badge className="border-amber-200 bg-amber-50 text-amber-700"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>}</TableCell>
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
