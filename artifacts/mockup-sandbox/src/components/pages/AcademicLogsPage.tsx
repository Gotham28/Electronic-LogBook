import * as React from "react";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Clock, GraduationCap, PlusCircle, Loader2, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch } from "@/lib/apiClient";
import { publishArogyaContext } from "@/lib/arogya-context";
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
import { Textarea } from "@/components/ui/textarea";
import { formatLogbookDate, todayForInput } from "@/lib/logbook-config";
import { useDepartment } from "@/lib/department-context";
import { academicFieldVisible, readAcademicRecord, validateAcademicRecord, writeAcademicRecord } from "@/lib/academic-logbook";
import { AcademicRecordFields } from "@/components/AcademicRecordFields";
import { AcademicRecordDetails } from "@/components/AcademicRecordDetails";
import { categorySections, filterAcademicLogs, logbookCategory } from "@/lib/academic-navigation";

type AcademicLog = {
  number: number;
  date: string;
  type: string;
  presentationType: string;
  description?: string | null;
  topic: string;
  faculty: string;
  facultyRemarks?: string | null;
  status: "pending" | "verified" | "rejected";
};




export function AcademicLogsPage({ categoryId }: { categoryId?: string } = {}) {
  const { academics: configuredAcademicOptions, config, academicLogbook } = useDepartment();
  const [selectedYear, setSelectedYear] = React.useState("all");
  const category = logbookCategory(academicLogbook, categoryId);
  const sections = categorySections(academicLogbook, categoryId);
  const configuredOptions = configuredAcademicOptions.filter((option) => !categoryId || !!category?.sectionValues.includes(option.value));
  const academicOptions = [...configuredOptions, ...sections
    .filter((section) => !configuredAcademicOptions.some((option) => option.value === section.value))
    .map((section, index) => ({ id: -index - 1, name: section.value, value: section.value, required: 0, period: "total" as const }))];
  const [open, setOpen] = React.useState(false);
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    date: todayForInput(),
    type: "",
    presentationType: "",
    topic: "",
    description: "",
    supervisorId: "",
    trainingYear: "",
  });
  const [recordValues, setRecordValues] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState("");
  const formErrorRef = React.useRef<HTMLParagraphElement>(null);
  const section = academicLogbook?.sections.find((item) => item.value === form.type);
  const availableOptions = academicOptions.filter((option) => !form.trainingYear
    || !academicLogbook?.sections.some((item) => item.value === option.value)
    || academicLogbook.sections.some((item) => item.value === option.value && item.years.includes(Number(form.trainingYear))));
  const [editLogId, setEditLogId] = React.useState<number | null>(null);

  const user = React.useMemo(() => getCurrentUser(), []);
  const [professors, setProfessors] = React.useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  React.useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);

  const openNewLog = (type = "", openDialog = true) => {
    setEditLogId(null);
    setForm({ date: todayForInput(), type, presentationType: "", topic: "", description: "", supervisorId: "",
      trainingYear: selectedYear === "all" ? "" : selectedYear });
    setRecordValues({});
    setFormError("");
    publishArogyaContext(null);
    if (openDialog) setOpen(true);
  };
  const visibleLogs = filterAcademicLogs(logs, academicLogbook, categoryId, selectedYear);



  const fetchLogs = React.useCallback(async () => {
    if (!user?.studentProfileId) {
      setError("Not logged in");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet(`/api/students/${user.studentProfileId}/logs`);
      const sortedLogs = (data.academicLogs || []).sort((a: any, b: any) => b.id - a.id);
      setLogs(sortedLogs.map((log: any, index: number) => ({ 
        ...log, 
        number: sortedLogs.length - index,
        type: log.activityType,
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
    if (!categoryId || category) fetchLogs();
  }, [fetchLogs, categoryId, category]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!form.type || !form.date || !form.topic.trim()) {
      setFormError("Enter the date, activity category and topic or activities.");
      return;
    }
    if (!form.supervisorId) {
      setFormError("Please select a reviewing faculty member.");
      return;
    }
    const description = section
      ? writeAcademicRecord(Number(form.trainingYear), Object.fromEntries(Object.entries(recordValues)
        .filter(([key]) => section.fields.some((field) => field.key === key && academicFieldVisible(field, recordValues)))), form.description)
      : form.description;
    if (section) {
      const error = validateAcademicRecord(section, description, form.date, form.presentationType);
      if (error) { setFormError(error); return; }
    }
    
    setIsSubmitting(true);
    try {


      const payload = {
        activityType: form.type,
        presentationType: form.presentationType || null,
        topic: form.topic,
        date: form.date,
        supervisorId: form.supervisorId,
        description,
      };
      
      if (editLogId) {
        await apiPatch(`/api/students/${user?.studentProfileId}/academic-logs/${editLogId}`, payload);
      } else {
        await apiPost(`/api/students/${user?.studentProfileId}/academic-logs`, payload);
      }
      
      await fetchLogs();
      setOpen(false);
      setEditLogId(null);
      setForm({ ...form, topic: "", supervisorId: "", description: "" });
      setRecordValues({});
      toast.success(editLogId ? `Academic activity updated successfully` : `Academic activity submitted successfully`);
    } catch (err: any) {
      setFormError(err.message || "Failed to submit academic log");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (categoryId && !category) return (
    <div className="space-y-4 p-6" role="alert">
      <h2 className="page-title">Category unavailable</h2>
      <p>This logbook category is not available for your department.</p>
      <Button asChild variant="outline"><Link href="/academics">Open academic activities</Link></Button>
    </div>
  );

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
          <h2 className="page-title mt-1">{category?.title || academicLogbook?.title || "Academic activities"}</h2>
          <p className="mt-2 text-sm text-slate-500">{category ? "Record entries in this category and select a training year to see the available logbook sections." : academicLogbook
            ? "Record lectures, practicals, daily activities, teaching, postings, research, assessment marks, attendance and appraisal."
            : "Presentations, journal clubs, seminars, symposia, mortality meetings and conferences."}</p>
        </div>
        <Dialog open={open} onOpenChange={(val) => { 
          if (isSubmitting) return;
          setOpen(val);
          if (!val) { publishArogyaContext(null); setForm({ date: todayForInput(), type: "", presentationType: "", topic: "", description: "", supervisorId: "", trainingYear: "" }); setEditLogId(null); setRecordValues({}); setFormError(""); }
        }}>
          <DialogTrigger asChild><Button onClick={() => openNewLog("", false)}><PlusCircle className="h-4 w-4" /> {academicLogbook ? "Add log entry" : "Log academic activity"}</Button></DialogTrigger>
          <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl bg-white sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editLogId ? "Edit log entry" : "New log entry"}</DialogTitle>
              <DialogDescription>{academicLogbook ? "Choose the logbook year and section, then enter the details for faculty verification. Record completed appraisal ratings from your appraisal form." : "Add attendance or presentation details for faculty verification."}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              {formError && <p ref={formErrorRef} role="alert" tabIndex={-1} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
              {academicLogbook && <Field label="Logbook year *">
                <Select value={form.trainingYear} onValueChange={(trainingYear) => {
                  const keepSection = !section || section.years.includes(Number(trainingYear));
                  setForm({ ...form, trainingYear, ...(keepSection ? {} : { type: "", presentationType: "" }) });
                  if (!keepSection) setRecordValues({});
                  setFormError("");
                }} disabled={isSubmitting}>
                  <SelectTrigger aria-label="Logbook year"><SelectValue placeholder="Select year" /></SelectTrigger>
                  <SelectContent>{[1, 2, 3].map((year) => <SelectItem key={year} value={String(year)}>Year {year}</SelectItem>)}</SelectContent>
                </Select>
              </Field>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={section?.fields.some((field) => field.notBeforeLogDate) ? "Start date" : "Date"}><Input aria-label="Entry date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required disabled={isSubmitting} /></Field>
                <Field label="Activity category">
                  <Select value={form.type} onValueChange={(value) => { setForm({ ...form, type: value, presentationType: "" }); setRecordValues({}); setFormError(""); }} disabled={isSubmitting}>
                    <SelectTrigger aria-label="Activity category"><SelectValue placeholder="Select a section" /></SelectTrigger>
                    <SelectContent>
                      {!academicOptions.length && <p className="text-sm text-slate-500">Your HOD has not configured academic activities yet.</p>}
                      {availableOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {section ? (section.participation && <Field label="Participation *">
                <Select value={form.presentationType} onValueChange={(presentationType) => setForm({ ...form, presentationType })} disabled={isSubmitting}>
                  <SelectTrigger aria-label="Participation"><SelectValue placeholder="Select participation" /></SelectTrigger>
                  <SelectContent>{section.participation.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>) : config?.enabledFeatures?.academicActivityExtras ? (
                <Field label="Presentation format (optional)">
                  <Select value={form.presentationType} onValueChange={(value) => setForm({ ...form, presentationType: value })}>
                    <SelectTrigger><SelectValue placeholder="Select format" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Presented">Presented</SelectItem>
                      <SelectItem value="Attended">Attended</SelectItem>
                      <SelectItem value="Supervised">Supervised</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field label="Presentation format (optional)"><Input value={form.presentationType} onChange={(e) => setForm({ ...form, presentationType: e.target.value })} maxLength={160} /></Field>
              )}
              <Field label={section?.topicLabel || "Topic / Title / Impression"}>
                {section?.multilineTopic
                  ? <Textarea aria-label={section.topicLabel} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={4000} required disabled={isSubmitting} />
                  : <Input aria-label={section?.topicLabel || "Topic / Title / Impression"} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={4000} required disabled={isSubmitting} />}
              </Field>
              {section && <AcademicRecordFields section={section} values={recordValues} onChange={setRecordValues} disabled={isSubmitting} />}
              {(section || config?.enabledFeatures?.academicActivityExtras) && (
                <>
                  <Field label={section ? "Notes (optional)" : "Description (optional)"}><Textarea aria-label={section ? "Notes" : "Description"} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={2000} disabled={isSubmitting} /></Field>
                </>
              )}
              <Field label="Reviewing faculty member">
                <Select value={form.supervisorId} onValueChange={(value) => setForm({ ...form, supervisorId: value })} disabled={isSubmitting}>
                  <SelectTrigger aria-label="Reviewing faculty member"><SelectValue placeholder="Select a faculty member" /></SelectTrigger>
                  <SelectContent>
                    {professors.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setOpen(false); publishArogyaContext(null); }} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send to faculty
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!!category?.relatedPages?.length && <nav aria-label="Related records" className="flex flex-wrap gap-2">
        {category.relatedPages.map((page) => <Button key={page.href} asChild variant="outline"><Link href={page.href}>{page.title}</Link></Button>)}
      </nav>}

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Summary label="Awaiting review" value={loading || error ? "—" : visibleLogs.filter((log) => log.status === "pending").length} />
        <Summary label="Verified activities" value={loading || error ? "—" : visibleLogs.filter((log) => log.status === "verified").length} />
        <Summary label="Valid academic activities" value={loading || error ? "—" : visibleLogs.filter((log) => log.status !== "rejected").length} />
      </div>

      {academicLogbook && <Card>
        <CardHeader className="gap-3 border-b border-teal-100 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Logbook sections</CardTitle>
          <div className="space-y-1 sm:w-40"><Label htmlFor="logbook-year-filter">Show year</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger id="logbook-year-filter"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All years</SelectItem>{[1, 2, 3].map((year) => <SelectItem key={year} value={String(year)}>Year {year}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
          {categorySections(academicLogbook, categoryId, selectedYear).map((item) => (
            <button key={item.value} type="button" onClick={() => openNewLog(item.value)}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600">
              <span><span className="block text-sm font-medium text-slate-900">{item.value}</span>
                <span className="mt-1 block text-xs text-slate-500">{loading || error ? "" : `${visibleLogs.filter((log) => log.activityType === item.value && log.status !== "rejected").length} recorded · `}Years {item.years.join(", ")}</span>
              </span><PlusCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-teal-700" />
            </button>
          ))}
        </CardContent>
      </Card>}

      {configuredOptions.some((item) => item.required > 0) && <Card>
        <CardHeader className="border-b border-teal-100">
          <CardTitle className="text-lg">Mandatory academic requirements</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {configuredOptions.filter((item) => item.required > 0).map((requirement) => {
            const logged = logs.filter((log) => log.type === requirement.value && log.status !== "rejected" && (requirement.period !== "month" || log.date.startsWith(todayForInput().slice(0, 7)))).length;
            return (
              <div key={requirement.name} className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
                <p className="text-sm font-bold text-slate-900">{requirement.name}</p>
                <p className="mt-3 text-2xl font-bold text-teal-700">{requirement.required}</p>
                <p className="text-xs text-slate-500">{requirement.period === "month" ? "per month" : "overall"}</p>
                <p className="mt-3 text-xs font-semibold text-slate-700">{logged} logged {requirement.period === "month" ? "this month" : "overall"}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>}

      <Card>
        <CardHeader className="border-b border-teal-100"><CardTitle className="flex items-center gap-2 text-lg"><GraduationCap className="h-5 w-5 text-teal-600" /> Academic activity record</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm font-medium text-slate-500">Loading academic activities...</p>
            </div>
          ) : visibleLogs.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GraduationCap className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>{error ? "Activity records are unavailable" : "No entries recorded"}</EmptyTitle>
                <EmptyDescription>{error ? "Use Try Again above to reload your records." : "Add a log entry to record your training activity for faculty review."}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => openNewLog()}>{academicLogbook ? "Add log entry" : "Log academic activity"}</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Date</TableHead><TableHead>Activity</TableHead><TableHead>Presentation</TableHead><TableHead>Topic / conference</TableHead><TableHead>Reviewing faculty member</TableHead><TableHead>Grade</TableHead><TableHead>Remarks</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {visibleLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-bold">{log.number}</TableCell>
                    <TableCell>{formatLogbookDate(log.date)}</TableCell>
                    <TableCell><Badge variant="outline" className="border-teal-100 bg-teal-50 text-teal-800">{log.type}</Badge></TableCell>
                    <TableCell>{log.presentationType}</TableCell>
                    <TableCell className="max-w-sm whitespace-pre-wrap font-semibold">{log.topic}
                      {log.description && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-teal-700">View details</summary>
                        <AcademicRecordDetails activityType={log.activityType} description={log.description} />
                      </details>}
                    </TableCell>
                    <TableCell>{log.faculty}</TableCell>
                    <TableCell className="font-medium">
                      {log.status === "pending"
                        ? <span className="text-slate-400">—</span>
                        : log.facultyGrade
                          ? <span className="font-bold text-teal-800">{log.facultyGrade}</span>
                          : <span className="text-slate-500">No grade</span>}
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px]">
                      {log.status === "pending"
                        ? <span className="text-slate-400">—</span>
                        : log.status === "rejected"
                          ? <span title={log.facultyRemarks || "No remark"} className={`block truncate cursor-help font-medium ${log.facultyRemarks ? "text-rose-700" : "text-slate-400"}`}>
                              {log.facultyRemarks || "No remark"}
                            </span>
                          : log.facultyRemarks
                            ? <span title={log.facultyRemarks} className="block truncate cursor-help text-slate-600">{log.facultyRemarks}</span>
                            : <span className="text-slate-500">No remark</span>}
                    </TableCell>
                    <TableCell>{log.status === "verified" ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge> : log.status === "rejected" ? <Badge className="border-rose-200 bg-rose-50 text-rose-700"><AlertCircle className="mr-1 h-3 w-3" /> Rejected</Badge> : <Badge className="border-amber-200 bg-amber-50 text-amber-700"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>}</TableCell>
                    <TableCell className="text-right">
                      {(log.status === "pending" || log.status === "rejected") && (
                        <Button aria-label={`Edit ${log.topic}`} variant="ghost" size="sm" className="text-teal-600 hover:text-teal-800 hover:bg-teal-50" onClick={() => {
                          setEditLogId(log.id);
                          publishArogyaContext({ log: { type: "academic", id: Number(log.id) } });
                          const record = readAcademicRecord(log.description);
                          setRecordValues(record?.values ?? {});
                          setFormError("");
                          setForm({
                            date: log.date, type: log.activityType || log.type, presentationType: log.presentationType === "—" ? "" : (log.presentationType || ""),
                            topic: log.topic || "", supervisorId: String(log.supervisorId || ""),
                            description: record?.notes ?? log.description ?? "", trainingYear: record ? String(record.trainingYear) : ""
                          });
                          setOpen(true);
                        }}>
                          <Edit3 className="h-4 w-4" />
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

function Summary({ label, value }: { label: string; value: number | string }) {
  return <Card><CardContent className="p-3 sm:p-5"><p className="text-2xl font-bold text-teal-700 sm:text-3xl">{value}</p><p className="mt-1 text-[11px] font-bold uppercase leading-tight tracking-wide text-slate-500 sm:leading-[inherit] sm:tracking-wider">{label}</p></CardContent></Card>;
}
