import { ProgressRing } from "@/components/ui/progress";
import * as React from "react";
import { Link } from "wouter";
import {
  AlertCircle,
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
  Target,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  const [isTargetsExpanded, setIsTargetsExpanded] = React.useState(false);
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
    if (!userId) return;

    if (isDemoMode()) {
      setProgressGapsState({
        userId,
        gaps: [
          { label: "Cases", verified: 10, target: 150 },
          { label: "Procedures", verified: 0, target: 50 },
          { label: "Academic Activities", verified: 0, target: 10 },
          { label: "Emergency Procedures: CPR Pediatrics", verified: 1, target: 5 },
          { label: "Emergency Procedures: Endotracheal intubation (NEONATAL/PED)", verified: 0, target: 25 },
          { label: "Psychomotor skills: Behavioral Disorders Screening", verified: 0, target: 2 },
          { label: "Invasive procedures: Bone marrow aspiration", verified: 1, target: 2 },
          { label: "Neonatal procedures: Surfactant administration INSU/LISA/MIST", verified: 3, target: 20 },
        ],
      });
      return;
    }

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
  const allGaps = progressGaps && "gaps" in progressGaps ? progressGaps.gaps : [];
  const hasSubCategories = allGaps.some((g) => g.label.includes(":"));
  const categoryGaps = hasSubCategories ? allGaps.filter((g) => !g.label.includes(":")) : [];
  const procedureGaps = hasSubCategories ? allGaps.filter((g) => g.label.includes(":")) : allGaps;

  return (
    <div className="section-spacing pb-12">
      {progressGaps && ("error" in progressGaps || progressGaps.gaps.length > 0) && (
        <Card className="overflow-hidden border-slate-200/80 bg-white/95 shadow-sm layer-1 animate-float-up">
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100/90 bg-slate-50/60 px-4 sm:px-6 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700 shadow-sm border border-teal-100/60">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Training targets to work on
                  </CardTitle>
                  {"gaps" in progressGaps && progressGaps.gaps.length > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
                      {progressGaps.gaps.length} {progressGaps.gaps.length === 1 ? "deficit" : "deficits"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Focus areas where verified entries are below departmental requirements
                </p>
              </div>
            </div>
            {"gaps" in progressGaps && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 border-teal-200 bg-white text-xs font-semibold text-teal-800 shadow-sm hover:bg-teal-50 hover:text-teal-900"
                onClick={() => {
                  void apiPost("/api/arogya/usage", { eventType: "nudge_click" }).catch(() => {});
                  openArogya("What are my current training targets and progress deficits?");
                }}
              >
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                Ask Mochi about this
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {"error" in progressGaps ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-rose-900">
                <div className="flex items-center gap-2 text-sm font-medium text-rose-800">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{progressGaps.error}</span>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 border-rose-300 bg-white text-xs font-medium text-rose-800 hover:bg-rose-100" onClick={() => setProgressRetry((value) => value + 1)}>
                  <RefreshCcw className="mr-1.5 h-3 w-3" /> Try again
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Core Category Targets (e.g. Cases, Procedures, Academics) */}
                {categoryGaps.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {categoryGaps.map((gap, index) => {
                      const pct = Math.min(100, Math.round((gap.verified / gap.target) * 100));
                      return (
                        <div key={`${gap.label}-${index}`} className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 transition-colors hover:bg-slate-50">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800 truncate">{gap.label}</span>
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium bg-white text-slate-700 border border-slate-200">
                              {gap.verified} / {gap.target}
                            </Badge>
                          </div>
                          <div className="mt-2.5 flex items-center gap-2">
                            <Progress value={pct} className="h-1.5 flex-1 bg-slate-200" />
                            <span className="text-[10px] font-medium text-slate-500 w-7 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Specific Procedure Requirements */}
                {procedureGaps.length > 0 && (
                  <div className="space-y-2.5">
                    {categoryGaps.length > 0 && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                          Specific Procedure Requirements ({procedureGaps.length})
                        </span>
                        {procedureGaps.length > 3 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-teal-700 hover:text-teal-800 p-0 hover:bg-transparent font-medium"
                            onClick={() => setIsTargetsExpanded(!isTargetsExpanded)}
                          >
                            {isTargetsExpanded ? (
                              <span className="flex items-center gap-1">Show fewer <ChevronUp className="h-3.5 w-3.5" /></span>
                            ) : (
                              <span className="flex items-center gap-1">View all {procedureGaps.length} requirements <ChevronDown className="h-3.5 w-3.5" /></span>
                            )}
                          </Button>
                        )}
                      </div>
                    )}

                    <div className={`space-y-2 ${isTargetsExpanded ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
                      {(isTargetsExpanded ? procedureGaps : procedureGaps.slice(0, categoryGaps.length > 0 ? 3 : 5)).map((gap, index) => {
                        const pct = Math.min(100, Math.round((gap.verified / gap.target) * 100));
                        const parts = gap.label.split(":");
                        const group = parts.length > 1 ? parts[0].trim() : null;
                        const name = parts.length > 1 ? parts.slice(1).join(":").trim() : gap.label;

                        return (
                          <div key={`${gap.label}-${index}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white p-2.5 px-3.5 text-xs hover:border-slate-200 hover:bg-slate-50/40 transition-colors">
                            <div className="min-w-0 flex-1">
                              {group && (
                                <span className="inline-block text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-100/70 px-1.5 py-0.5 rounded-md mr-2">
                                  {group}
                                </span>
                              )}
                              <span className="font-medium text-slate-800 truncate" title={gap.label}>{name}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="w-24 hidden sm:block">
                                <Progress value={pct} className="h-1.5 bg-slate-100" />
                              </div>
                              <span className="text-slate-600 font-mono text-[11px] min-w-16 text-right">
                                {gap.verified} of {gap.target}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {!isTargetsExpanded && procedureGaps.length > (categoryGaps.length > 0 ? 3 : 5) && (
                      <div className="text-center pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-slate-500 hover:text-teal-700 hover:bg-slate-50 gap-1 font-medium"
                          onClick={() => setIsTargetsExpanded(true)}
                        >
                          + {procedureGaps.length - (categoryGaps.length > 0 ? 3 : 5)} more procedure requirements <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
