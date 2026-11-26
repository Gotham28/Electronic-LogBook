import { ProgressRing } from "@/components/ui/progress";
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
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoCount, DemoProgress, useDemoAnimatedValue } from "@/components/DemoMotion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { formatLogbookDate } from "@/lib/logbook-config";
import { apiGet, apiPost } from "@/lib/apiClient";
import { isDemoMode } from "@/lib/session";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDepartment } from "@/lib/department-context";
import { openArogya } from "@/lib/arogya-context";

type ProgressGap = { label: string; verified: number; target: number };
type ProgressGapsState = { userId: number; gaps: ProgressGap[] } | { userId: number; error: string };

export function Dashboard() {
  const { config: departmentConfig, clinicalWorkCategories, clinicalWorkSubtypes, label } = useDepartment();
  const deptConfig = departmentConfig;
  const features = deptConfig?.enabledFeatures ?? {};
  const user = useCurrentUser();
  const [logs, setLogs] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [progressGapsState, setProgressGapsState] = React.useState<ProgressGapsState | null>(null);
  const [progressRetry, setProgressRetry] = React.useState(0);
  const fetchDashboardData = React.useCallback(async () => {
    if (!user?.studentProfileId) {
      setError("No student profile ID found. Please log in as a student.");
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const logsData = await apiGet(`/api/students/${user.studentProfileId}/logs`);
      setLogs(logsData);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  React.useEffect(() => {
    const userId = user?.id;
    setProgressGapsState(null);
    if (!userId || isDemoMode()) return;

    let active = true;
    void apiGet<{ gaps: ProgressGap[] }>("/api/arogya/progress-gaps").then(({ gaps }) => {
      if (!Array.isArray(gaps)) throw new Error("Invalid progress response");
      if (active) setProgressGapsState({ userId, gaps });
    }).catch(() => {
      if (active) setProgressGapsState({ userId, error: "Progress targets could not be loaded." });
    });
    return () => { active = false; };
  }, [user?.id, progressRetry]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-forest" />
        <p className="text-sm text-helper">Loading your logbook data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-status-foreground" />
        <p className="text-sm font-medium text-ink">{error}</p>
        <Button onClick={fetchDashboardData} variant="outline" className="text-forest">
          <RefreshCcw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  if (!logs) return null;

  // The HOD's per-category minimums, summed the same way the server sums them for completion.
  const clinicalTarget = clinicalWorkCategories.filter((item) => item.period === "total").reduce((sum, item) => sum + item.required, 0);
  const allCategories = [
    { label: "Clinical cases", logged: logs.caseLogs?.filter((l: any) => l.status !== "rejected").length || 0, required: deptConfig?.requiredCases ?? 0, verified: logs.caseLogs?.filter((l: any) => l.status === "verified").length || 0, icon: FileText, href: "/cases", hasTarget: deptConfig?.requiredCases !== null && deptConfig?.requiredCases !== undefined },
    { label: "Procedures", logged: logs.procedureLogs?.filter((l: any) => l.status !== "rejected").length || 0, required: deptConfig?.requiredProcedures ?? 0, verified: logs.procedureLogs?.filter((l: any) => l.status === "verified").length || 0, icon: Stethoscope, href: "/procedures", hasTarget: deptConfig?.requiredProcedures !== null && deptConfig?.requiredProcedures !== undefined },
    { label: "Clinical work", logged: logs.clinicalWorkLogs?.filter((l: any) => l.status !== "rejected").length || 0, required: clinicalTarget, verified: logs.clinicalWorkLogs?.filter((l: any) => l.status === "verified").length || 0, icon: Stethoscope, href: "/clinical-works", hasTarget: clinicalTarget > 0 },
    { label: "Academic activities", logged: logs.academicLogs?.filter((l: any) => l.status !== "rejected").length || 0, required: deptConfig?.requiredAcademic ?? 0, verified: logs.academicLogs?.filter((l: any) => l.status === "verified").length || 0, icon: GraduationCap, href: "/academics", hasTarget: deptConfig?.requiredAcademic !== null && deptConfig?.requiredAcademic !== undefined },
  ];
  const categories = allCategories.filter((item) =>
    item.href === "/cases" ? !features.hideCaseLogs
      : item.href === "/procedures" ? !features.hideProcedureLogs
      : item.href === "/clinical-works" ? !!features.clinicalWorks
      : true);
  const primaryLogHref = !features.hideCaseLogs ? "/cases" : features.clinicalWorks ? "/clinical-works" : "/academics";
  const clinicalNames = new Map([...clinicalWorkCategories, ...clinicalWorkSubtypes].map((item) => [item.value, item.name]));

  const configured = categories.filter((item) => item.hasTarget && item.required > 0);
  const completion = configured.length ? Math.round(configured.reduce((sum, item) => sum + Math.min(item.verified / item.required, 1), 0) / configured.length * 100) : null;

  const hideUhid = isDemoMode();
  const mappedCaseLogs = (logs.caseLogs || []).map((l: any) => ({
    number: l.id, date: l.date, type: "Case", title: l.diagnosisProvisional || "Case Log", patientUhid: l.patientUhid, status: l.status, timestamp: new Date(l.createdAt).getTime(), href: "/cases"
  }));
  const mappedProcLogs = (logs.procedureLogs || []).map((l: any) => ({
    number: l.id, date: l.date, type: "Procedure", title: l.procedureName || "Procedure Log", patientUhid: l.patientUhid, status: l.status, timestamp: new Date(l.createdAt).getTime(), href: "/procedures"
  }));
  const mappedAcadLogs = (logs.academicLogs || []).map((l: any) => ({
    number: l.id, date: l.date, type: "Academic", title: l.topic || "Academic Log", patientUhid: undefined, status: l.status, timestamp: new Date(l.createdAt).getTime(), href: "/academics"
  }));

  const mappedClinicalLogs = (features.clinicalWorks ? logs.clinicalWorkLogs || [] : []).map((l: any) => ({
    number: l.id, date: l.date, type: "Clinical work",
    title: [clinicalNames.get(l.category) ?? l.category, l.subType ? clinicalNames.get(l.subType) ?? l.subType : null].filter(Boolean).join(" — "),
    patientUhid: l.caseNumber, status: l.status, timestamp: new Date(l.createdAt).getTime(), href: "/clinical-works"
  }));

  const recent = [...(features.hideCaseLogs ? [] : mappedCaseLogs), ...(features.hideProcedureLogs ? [] : mappedProcLogs), ...mappedClinicalLogs, ...mappedAcadLogs]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  const overallRemaining = categories.reduce((sum, item) => sum + Math.max(item.required - item.verified, 0), 0);
  const pendingCount = [...(features.hideCaseLogs ? [] : logs.caseLogs || []), ...(features.hideProcedureLogs ? [] : logs.procedureLogs || []),
    ...(features.clinicalWorks ? logs.clinicalWorkLogs || [] : []), ...(logs.academicLogs || [])]
    .filter((entry: any) => entry.status === "pending").length;
  const rejectedCount = [...(features.hideCaseLogs ? [] : logs.caseLogs || []), ...(features.hideProcedureLogs ? [] : logs.procedureLogs || []),
    ...(features.clinicalWorks ? logs.clinicalWorkLogs || [] : []), ...(logs.academicLogs || [])]
    .filter((entry: any) => entry.status === "rejected").length;
  const progressLabel = completion !== null ? (completion >= 75 ? "On track" : completion >= 40 ? "Needs attention" : "Getting started") : "Getting started";

  const hasAnyNumericTargets = configured.length > 0;
  const progressGaps = progressGapsState?.userId === user?.id ? progressGapsState : null;

  return (
    <div className="section-spacing pb-12">
      {progressGaps && ("error" in progressGaps || progressGaps.gaps.length > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Training targets to work on</CardTitle></CardHeader>
          <CardContent>
            {"error" in progressGaps ? (
              <div role="alert" className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-status-foreground">{progressGaps.error}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setProgressRetry((value) => value + 1)}>Try again</Button>
              </div>
            ) : (
              <>
                <ul className="space-y-2 text-sm">
                  {progressGaps.gaps.map((gap, index) => (
                    <li key={`${gap.label}-${index}`} className="flex flex-wrap justify-between gap-2">
                      <span>{gap.label}</span>
                      <span className="text-soft-ink">{gap.verified} of {gap.target} verified</span>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => {
                  void apiPost("/api/arogya/usage", { eventType: "nudge_click" }).catch(() => {});
                  openArogya();
                }}>Ask Mochi about this</Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
      {rejectedCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-status-border bg-status p-4 text-status-foreground shadow-sm animate-float-up">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status text-status-foreground">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-status-foreground">
                {rejectedCount} {rejectedCount === 1 ? "entry requires" : "entries require"} revision
              </p>
              <p className="text-xs text-status-foreground">
                Faculty requested changes on your submitted logs. Review the feedback and resubmit them.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="border-status-border bg-white text-status-foreground hover:bg-status shrink-0 font-semibold text-xs">
            <Link href={primaryLogHref}>Review &amp; resubmit <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      )}
      {!configured.length && <p className="rounded-xl bg-mist p-4 text-sm text-forest">Your HOD has not configured completion targets yet.</p>}
      <Card className="overflow-hidden border-card-edge bg-card layer-2 animate-float-up">
        <div className="h-1.5 hero-rule" />
        <CardContent className="p-4 sm:p-6 md:p-8">
          <div className="grid items-stretch gap-7 xl:grid-cols-[.8fr_1.2fr]">
            <div data-tour="dashboard-welcome" className="flex flex-col justify-center rounded-[24px] bg-deep p-6 text-white md:p-9">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-white">{logs.profile?.department || "Department Unassigned"}</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">Welcome back, {user?.name?.split(" ")[0] || "Student"}</h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-white">Your clinical record, academic work, and verification status are summarised here.</p>
              <div className="mt-8 flex items-center gap-3 text-xs text-white">
                <div className="h-px w-10 bg-sage" />
                <span>Batch {logs.profile?.joiningYear || "—"}</span>
              </div>
            </div>
            <Card className="min-w-0 border-line-soft bg-white layer-1">
              <CardContent className="p-0">
                <div className="flex items-center gap-4 border-b border-line-soft p-5 md:p-6">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-forest text-lg font-bold text-white shadow-[0_14px_30px_color-mix(in_srgb,var(--gothos-forest)_20%,transparent)]">
                    {(user?.name || "Student").split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[.16em] text-forest">Resident profile</p>
                    <p className="mt-1 truncate text-xl font-semibold text-ink">{user?.name || "Student"}</p>
                  </div>
                </div>
                <div className="grid gap-px bg-sage sm:grid-cols-2">
                  <ProfileField label="Registration number" value={logs.profile?.registrationNumber || "—"} />
                  <ProfileField label="Department" value={logs.profile?.department || "Unassigned"} />
                  <ProfileField label="Date of joining" value={formatLogbookDate(logs.profile?.dateOfJoining || "—")} />

                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card data-tour="dashboard-progress" className="overflow-hidden border-card-edge bg-card layer-2">
        <CardContent className="p-4 sm:p-6 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_.9fr] lg:items-center">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
              {hasAnyNumericTargets && completion !== null && <ProgressDonut value={completion} />}
              <div>
                <p className="page-eyebrow">Dashboard insights</p>
                {hasAnyNumericTargets ? (
                  <h2 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">You need <DemoCount value={overallRemaining} /> more entries to complete the core targets.</h2>
                ) : (
                  <h2 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">Keep logging your work.</h2>
                )}
                <p className="mt-2 max-w-2xl text-sm leading-6 text-soft-ink">{pendingCount > 0 ? <><DemoCount value={pendingCount} /> {pendingCount === 1 ? "entry is" : "entries are"} waiting for faculty verification.</> : "All submitted entries have been reviewed."}</p>
                {hasAnyNumericTargets && <Badge variant="secondary" className="mt-4 rounded-full border-card-edge bg-mist px-3 py-1 text-forest">{progressLabel}</Badge>}
              </div>
            </div>
            {hasAnyNumericTargets && (
              <div className="space-y-4 rounded-[22px] border border-line-soft bg-mist p-5">
                {configured.map((item) => {
                  const percent = item.required > 0 ? Math.min(Math.round(item.verified / item.required * 100), 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink">{item.label}</span>
                        <span className="font-bold text-forest"><DemoCount value={percent} suffix="%" /></span>
                      </div>
                      <DemoProgress value={percent} className="h-2 bg-sage" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div data-tour="dashboard-categories" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((item) => {
          const Icon = item.icon;
          const percent = item.required > 0 ? Math.min(Math.round(item.verified / item.required * 100), 100) : 0;
          const remaining = Math.max(item.required - item.verified, 0);
          return (
            <Link key={item.label} href={item.href}>
              <Card data-tour={`dashboard-${item.href.slice(1)}`} className={`h-full cursor-pointer border-card-edge bg-card shadow-[0_18px_48px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_70px_color-mix(in_srgb,var(--gothos-forest)_8%,transparent)] ${isDemoMode() ? "demo-lift-card" : ""}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-forest text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--gothos-forest)_18%,transparent)]`}><Icon className="h-5 w-5" /></div>
                    {item.hasTarget ? (
                      <CircularProgress value={percent} />
                    ) : (
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-sage shadow-inner">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-xs font-bold text-ink"><DemoCount value={item.logged} /></div>
                      </div>
                    )}
                    <div className="sr-only">
                      <div className="text-4xl font-semibold leading-none text-ink">{item.logged}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-ink">{item.label}</p>
                  {item.hasTarget ? (
                    <>
                      <p className="mt-1 text-[11px] text-helper"><DemoCount value={item.logged} /> of <DemoCount value={item.required} /> required</p>
                      <DemoProgress value={percent} className="mt-4 h-2" />
                      <div className="mt-3 flex items-center justify-between text-[11px] text-helper">
                        <span><DemoCount value={remaining} /> remaining</span>
                        <span><DemoCount value={percent} suffix="%" /></span>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-[11px] text-helper"><DemoCount value={item.logged} /> logged</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <Card data-tour="dashboard-recent" className="border-card-edge bg-card">
          <CardHeader className="flex flex-row items-center justify-between border-b border-card-edge">
            <div>
              <p className="page-eyebrow">Student activity</p>
              <CardTitle className="mt-1 text-xl">Recent entries</CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href={primaryLogHref}>View logs <ArrowRight className="h-4 w-4" /></Link></Button>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mist text-forest">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink">No entries yet</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-helper">Your logbook is empty. Add your first entry and the dashboard will begin to fill in immediately.</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  {!features.hideCaseLogs && <Button asChild><Link href="/cases">Log first case</Link></Button>}
                  {features.clinicalWorks && <Button asChild><Link href="/clinical-works">Log clinical work</Link></Button>}
                  {!features.hideProcedureLogs && <Button asChild variant="outline"><Link href="/procedures">Open procedure list</Link></Button>}
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Entry</TableHead>{!hideUhid && <TableHead>{label("caseLog.caseId")}</TableHead>}<TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {recent.map((item, index) => (
                    <TableRow key={`${item.type}-${item.number}`} className={isDemoMode() ? "demo-stagger-item" : undefined} style={isDemoMode() ? { "--demo-stagger-index": index } as React.CSSProperties : undefined}>
                      <TableCell className="font-bold">{index + 1}</TableCell>
                      <TableCell>{formatLogbookDate(item.date)}</TableCell>
                      <TableCell><Badge variant="outline" className="border-line-soft bg-mist text-forest">{item.type}</Badge></TableCell>
                      <TableCell className="max-w-xs font-semibold">{item.title}</TableCell>
                      {!hideUhid && <TableCell className="text-xs font-semibold text-forest">{item.patientUhid}</TableCell>}
                      <TableCell><Status value={item.status} /></TableCell>
                      <TableCell className="text-right">
                        {item.status === "rejected" ? (
                          <Button asChild size="sm" variant="outline" className="border-status-border text-status-foreground bg-status hover:bg-status hover:text-status-foreground text-xs font-semibold h-7 px-2.5">
                            <Link href={item.href}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Resubmit
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="ghost" className="text-forest hover:text-forest hover:bg-mist text-xs h-7 px-2">
                            <Link href={item.href}>
                              View
                            </Link>
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

        <div className="space-y-4">
          {!features.hideProcedureLogs && (deptConfig?.requiredProcedures ?? 0) > 0 && <Card className="border-card-edge bg-card">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-status-foreground" />
                <div>
                  <p className="text-sm font-bold text-status-foreground">Procedure shortfall</p>
                  <p className="mt-1 text-xs leading-5 text-status-foreground">Complete and verify every named procedure requirement; the combined target is {deptConfig?.requiredProcedures}.</p>
                  <Button asChild variant="link" className="mt-2 h-auto p-0 text-status-foreground"><Link href="/procedures">Review requirements <ArrowRight className="h-3 w-3" /></Link></Button>
                </div>
              </div>
            </CardContent>
          </Card>}

          <Card className="border-card-edge bg-card">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Printer className="mt-0.5 h-5 w-5 text-forest" />
                <div>
                  <p className="text-sm font-bold text-ink">Print at any point</p>
                  <p className="mt-1 text-xs leading-5 text-helper">Use Print PDF for a current copy. Incomplete records are automatically marked Draft; finalized records print as an official copy.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card data-tour="dashboard-bottom" className="border-card-edge bg-card">
        <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-forest" />
            <div><p className="text-sm font-bold">Next quarterly assessment</p><p className="text-xs text-helper italic">Assessment tracking coming soon</p></div>
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
  return <div className="min-w-0 bg-white px-5 py-4 md:px-6"><p className="text-[9px] font-bold uppercase tracking-[.15em] text-forest">{label}</p><p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p></div>;
}

function Status({ value }: { value: string }) {
  if (value === "verified") return <Badge className="border-status-border bg-status text-status-foreground"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge>;
  if (value === "rejected") return <Badge className="border-status-border bg-status text-status-foreground">Revision</Badge>;
  return <Badge className="border-status-border bg-status text-status-foreground">Pending</Badge>;
}

function CircularProgress({ value }: { value: number }) {
  const animatedValue = useDemoAnimatedValue(value);
  const safeValue = Math.max(0, Math.min(Math.round(animatedValue), 100));
  return (
    <div className="relative grid h-14 w-14 place-items-center rounded-full">
      <ProgressRing value={safeValue} strokeWidth={14.2857} />
      <div className="grid h-10 w-10 place-items-center relative rounded-full bg-white text-[11px] font-bold text-ink">{safeValue}%</div>
    </div>
  );
}

function ProgressDonut({ value }: { value: number }) {
  const animatedValue = useDemoAnimatedValue(value);
  const safeValue = Math.max(0, Math.min(Math.round(animatedValue), 100));
  return (
    <div className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full p-3 shadow-[0_18px_45px_color-mix(in_srgb,var(--gothos-forest)_12%,transparent)]" aria-label={`Overall progress ${safeValue}%`}>
      <ProgressRing value={safeValue} strokeWidth={9.375} />
      <div className="grid h-full w-full place-items-center relative rounded-full bg-white text-center shadow-inner">
        <div><p className="text-2xl font-semibold text-ink">{safeValue}%</p><p className="text-[8px] font-bold uppercase tracking-[.14em] text-helper">Complete</p></div>
      </div>
    </div>
  );
}
