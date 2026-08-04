import * as React from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  FileText,
  GraduationCap,
  Printer,
  Stethoscope,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { formatLogbookDate } from "@/lib/logbook-config";
import { apiGet } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";

// Calculate expected completion by adding 3 years to dateOfJoining
function calculateExpectedCompletion(dateOfJoining: string) {
  if (!dateOfJoining) return "Unknown";
  try {
    const d = new Date(dateOfJoining);
    d.setFullYear(d.getFullYear() + 3);
    return d.toISOString().slice(0, 10);
  } catch {
    return "Unknown";
  }
}

export function Dashboard() {
  const user = React.useMemo(() => getCurrentUser(), []);
  const [logs, setLogs] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deptConfig, setDeptConfig] = React.useState({ requiredCases: 50, requiredProcedures: 101, requiredAcademic: 50 });

  const fetchDashboardData = React.useCallback(async () => {
    if (!user?.studentProfileId) {
      setError("No student profile ID found. Please log in as a student.");
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const [logsData, configData] = await Promise.all([
        apiGet(`/api/students/${user.studentProfileId}/logs`),
        apiGet(`/api/departments/${user.departmentId}/config`).catch(() => null)
      ]);
      setLogs(logsData);
      if (configData) setDeptConfig(configData);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm text-slate-500">Loading your logbook data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm font-medium text-slate-900">{error}</p>
        <Button onClick={fetchDashboardData} variant="outline" className="text-teal-700">
          <RefreshCcw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  if (!logs) return null;

  const categories = [
    { label: "Clinical cases", logged: logs.caseLogs?.length || 0, required: deptConfig.requiredCases, icon: FileText, href: "/cases", tone: "from-teal-500 to-cyan-500" },
    { label: "Procedures", logged: logs.procedureLogs?.length || 0, required: deptConfig.requiredProcedures, icon: Stethoscope, href: "/procedures", tone: "from-cyan-500 to-sky-500" },
    { label: "Case discussions", logged: logs.academicLogs?.length || 0, required: deptConfig.requiredAcademic, icon: GraduationCap, href: "/academics", tone: "from-emerald-500 to-teal-500" },
  ];

  const completion = Math.round(
    categories.reduce((sum, item) => sum + Math.min(item.logged / item.required, 1), 0) / categories.length * 100,
  );

  const mappedCaseLogs = (logs.caseLogs || []).map((l: any) => ({
    number: l.id, date: l.date, type: "Case", title: l.diagnosisProvisional || "Case Log", patientUhid: l.patientUhid, status: l.status, timestamp: new Date(l.createdAt).getTime()
  }));
  const mappedProcLogs = (logs.procedureLogs || []).map((l: any) => ({
    number: l.id, date: l.date, type: "Procedure", title: l.procedureName, patientUhid: l.patientUhid, status: l.status, timestamp: new Date(l.createdAt).getTime()
  }));
  const mappedAcadLogs = (logs.academicLogs || []).map((l: any) => ({
    number: l.id, date: l.date, type: "Academic", title: l.topic, patientUhid: "—", status: l.status, timestamp: new Date(l.createdAt).getTime()
  }));

  const recent = [...mappedCaseLogs, ...mappedProcLogs, ...mappedAcadLogs]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  const overallRemaining = categories.reduce((sum, item) => sum + Math.max(item.required - item.logged, 0), 0);
  const pendingCount = [...(logs.caseLogs || []), ...(logs.procedureLogs || []), ...(logs.academicLogs || [])]
    .filter((entry: any) => entry.status === "pending").length;
  const progressLabel = completion >= 75 ? "On track" : completion >= 40 ? "Needs attention" : "Getting started";

  return (
    <div className="section-spacing pb-12">
      <Card className="overflow-hidden border-white/70 bg-white/72 layer-2 animate-float-up">
        <div className="h-1.5 bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400" />
        <CardContent className="p-6 md:p-8 lg:p-10">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-0 bg-teal-50/80 text-[10px] font-bold uppercase tracking-[.18em] text-teal-800">Student workspace</Badge>
                <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-[11px] font-semibold text-teal-900 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                  <span>Live progress</span>
                </div>
              </div>
              <div>
                <p className="page-eyebrow">{logs.profile?.department || "Department Unassigned"}</p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-slate-950 md:text-4xl">Welcome back, {user?.name?.split(" ")[0] || "Student"}</h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">Track verified work, spot shortfalls, and add today’s clinical entries.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 text-white shadow-[0_16px_36px_rgba(13,148,136,0.20)] hover:shadow-[0_20px_48px_rgba(13,148,136,0.25)]">
                  <Link href="/cases"><FileText className="h-4 w-4" /> Log a case</Link>
                </Button>
                <Button asChild variant="outline" className="border-white/70 bg-white/80 text-teal-800 shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
                  <Link href="/procedures"><Stethoscope className="h-4 w-4" /> Log a procedure</Link>
                </Button>
                <Button asChild variant="outline" className="border-white/70 bg-white/80 text-teal-800 shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
                  <Link href="/postings"><CalendarDays className="h-4 w-4" /> Add posting / rotation</Link>
                </Button>
              </div>
            </div>
            <Card className="min-w-0 max-w-2xl border-white/70 bg-white/74 layer-1">
              <CardContent className="p-6 md:p-7">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ProfileField label="Resident" value={user?.name || "Student"} />
                  <ProfileField label="Registration number" value={logs.profile?.registrationNumber || "—"} />
                  <ProfileField label="Date of joining" value={formatLogbookDate(logs.profile?.dateOfJoining || "—")} />
                  <ProfileField label="Expected completion" value={formatLogbookDate(calculateExpectedCompletion(logs.profile?.dateOfJoining))} />
                </div>
                <div className="mt-4 grid gap-3 rounded-[18px] border border-teal-100/70 bg-teal-50/60 p-4 sm:grid-cols-2">
                  <div>
                    <p className="metric-label">Current year</p>
                    <p className="mt-1 text-xl font-semibold text-slate-950">{logs.profile?.joiningYear || "—"}</p>
                  </div>
                  <div>
                    <p className="metric-label">Department</p>
                    <p className="mt-1 text-xl font-semibold text-slate-950">{logs.profile?.department || "Unassigned"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-white/70 bg-white/78 layer-2">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <MultiRingProgress values={categories.map((item) => Math.min(Math.round(item.logged / item.required * 100), 100))} label={`${completion}%`} />
              <div>
                <p className="page-eyebrow">Dashboard insights</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">You need {overallRemaining} more entries to complete the core targets.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? "entry is" : "entries are"} waiting for faculty verification.` : "All submitted entries have been reviewed."}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full border-white/70 bg-white/80 px-3 py-1 text-teal-800">{progressLabel}</Badge>
              <Badge variant="outline" className="rounded-full border-white/70 bg-white/80 px-3 py-1 text-slate-700">{completion}% of targets logged</Badge>
            </div>
          </div>
          <Progress value={completion} className="mt-6 h-3 bg-teal-100/70" />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {categories.map((item) => {
          const Icon = item.icon;
          const percent = Math.min(Math.round(item.logged / item.required * 100), 100);
          const remaining = Math.max(item.required - item.logged, 0);
          return (
            <Link key={item.label} href={item.href}>
              <Card className="h-full cursor-pointer border-white/70 bg-white/76 shadow-[0_18px_48px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${item.tone} text-white shadow-[0_12px_28px_rgba(13,148,136,0.18)]`}><Icon className="h-5 w-5" /></div>
                    <CircularProgress value={percent} />
                    <div className="sr-only">
                      <div className="text-4xl font-semibold leading-none text-slate-950">{item.logged}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{item.logged} of {item.required} required</p>
                  <Progress value={percent} className="mt-4 h-2" />
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{remaining} remaining</span>
                    <span>{percent}%</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <Card className="border-white/70 bg-white/76">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/70">
            <div>
              <p className="page-eyebrow">Student activity</p>
              <CardTitle className="mt-1 text-xl">Recent entries</CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/cases">View logs <ArrowRight className="h-4 w-4" /></Link></Button>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-950">No entries yet</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Your logbook is empty. Start with a case, a procedure, or a posting and the dashboard will begin to fill in immediately.</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Button asChild><Link href="/cases">Log first case</Link></Button>
                  <Button asChild variant="outline"><Link href="/procedures">Open procedure list</Link></Button>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Entry</TableHead><TableHead>Patient UHID</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {recent.map((item, index) => (
                    <TableRow key={`${item.type}-${item.number}`}>
                      <TableCell className="font-bold">{index + 1}</TableCell>
                      <TableCell>{formatLogbookDate(item.date)}</TableCell>
                      <TableCell><Badge variant="outline" className="border-teal-100 bg-teal-50 text-teal-800">{item.type}</Badge></TableCell>
                      <TableCell className="max-w-xs font-semibold">{item.title}</TableCell>
                      <TableCell className="text-xs font-semibold text-teal-800">{item.patientUhid}</TableCell>
                      <TableCell><Status value={item.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/70 bg-white/76">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                <div>
                  <p className="text-sm font-bold text-amber-950">Procedure shortfall</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900/80">Complete and verify every named procedure requirement; the combined target is 101.</p>
                  <Button asChild variant="link" className="mt-2 h-auto p-0 text-amber-800"><Link href="/procedures">Review requirements <ArrowRight className="h-3 w-3" /></Link></Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/76">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Printer className="mt-0.5 h-5 w-5 text-cyan-700" />
                <div>
                  <p className="text-sm font-bold text-slate-900">Print at any point</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Use Print PDF for a current copy. Incomplete records are automatically marked Draft; finalized records print as an official copy.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-white/70 bg-white/76">
        <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-teal-600" />
            <div><p className="text-sm font-bold">Next quarterly assessment</p><p className="text-xs text-slate-500 italic">Assessment tracking coming soon</p></div>
          </div>
          <Button asChild variant="outline" size="sm" disabled className="opacity-50 cursor-not-allowed">
            <span><Award className="h-4 w-4 mr-2 inline" /> View assessments</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[18px] border border-white/70 bg-white/80 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"><p className="text-[9px] font-bold uppercase tracking-[.15em] text-teal-700">{label}</p><p className="mt-1 truncate text-sm font-semibold text-slate-950">{value}</p></div>;
}

function Status({ value }: { value: string }) {
  if (value === "verified") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge>;
  if (value === "rejected") return <Badge className="border-rose-200 bg-rose-50 text-rose-700">Revision</Badge>;
  return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Pending</Badge>;
}

function CircularProgress({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(value, 100));
  return (
    <div className="relative grid h-14 w-14 place-items-center rounded-full" style={{ background: `conic-gradient(#0d9488 ${safeValue * 3.6}deg, #e2e8f0 0deg)` }}>
      <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-900">{safeValue}%</div>
    </div>
  );
}

function MultiRingProgress({ values, label }: { values: number[]; label: string }) {
  const colors = ["#0d9488", "#06b6d4", "#10b981"];
  return (
    <div className="relative h-32 w-32 shrink-0" aria-label={`Overall progress ${label}`}>
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        {values.map((value, index) => {
          const radius = 54 - index * 11;
          const circumference = 2 * Math.PI * radius;
          return (
            <React.Fragment key={radius}>
              <circle cx="64" cy="64" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
              <circle cx="64" cy="64" r={radius} fill="none" stroke={colors[index]} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.max(0, Math.min(value, 100)) / 100)} className="transition-all duration-700" />
            </React.Fragment>
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><p className="text-xl font-semibold text-slate-950">{label}</p><p className="text-[8px] font-bold uppercase tracking-[.14em] text-slate-500">Overall</p></div>
      </div>
    </div>
  );
}
