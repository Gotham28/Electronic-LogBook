import { ProgressRing } from "@/components/ui/progress";
import * as React from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  Users,
  XCircle,
  TrendingUp,
  FileCheck,
  UserPlus,
  Settings,
  Syringe,
  BookOpen,
  GraduationCap,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLogbookDate } from "@/lib/logbook-config";
import { isoToIstDateTimeInput, istDateTimeInputToIso } from "@/lib/maintenanceTime";
import { useDepartment } from "@/lib/department-context";
import { DepartmentSettings } from "@/components/DepartmentSettings";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import { getCurrentUser, isDemoMode } from "@/lib/session";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ProfessorPortal } from "@/components/ProfessorPortal";
import { DemoCount, useDemoAnimatedValue, useDemoMotionEnabled } from "@/components/DemoMotion";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";

type Registration = {
  id: number;
  fullName: string;
  email: string;
  registrationNumber: string;
  batch: string;
  dateOfJoining: string;
  kuhsId: string;
  specialty: string;
  department: string;
  createdAt: string;
};

type FacultyRosterEntry = { id: number; fullName: string; email: string; status?: string };
type DepartmentRoster = { students: any[]; professors: FacultyRosterEntry[] };

type AnalyticsData = {
  totalStudents: number;
  avgCompletion: number;
  logStats: { pending: number; verified: number; rejected: number };
  topProcedures: { name: string; count: number }[];
};

type WeeklyDigestResponse =
  | { status: "ready"; weekStart: string; generatedAt: string; summary: string }
  | { status: "pending"; weekStart: string };

type DigestCardState = {
  userId: number;
  departmentId: number;
  requestedWeek: string;
} & (WeeklyDigestResponse | { status: "loading" | "error" });

function digestWeek(now: Date) {
  const localDay = isoToIstDateTimeInput(now).slice(0, 10);
  const monday = new Date(localDay + "T00:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const weekStart = monday.toISOString().slice(0, 10);
  monday.setUTCDate(monday.getUTCDate() + 7);
  const nextMonday = monday.toISOString().slice(0, 10);
  const nextWeek = istDateTimeInputToIso(nextMonday + "T00:00");
  return { weekStart, refreshAt: nextWeek ? Date.parse(nextWeek) : null };
}

function isValidWeeklyDigest(data: unknown): data is WeeklyDigestResponse {
  if (!data || typeof data !== "object" || !("status" in data) ||
      !("weekStart" in data) || typeof data.weekStart !== "string") return false;
  if (data.status === "ready") {
    return (
      "generatedAt" in data &&
      typeof data.generatedAt === "string" &&
      "summary" in data &&
      typeof data.summary === "string" &&
      !Number.isNaN(new Date(data.generatedAt).getTime())
    );
  }
  return data.status === "pending";
}

function formatDigestSnapshotDate(generatedAt: string): string {
  try {
    const date = new Date(generatedAt);
    if (Number.isNaN(date.getTime())) return generatedAt;
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return generatedAt;
  }
}

const paths: Record<string, string> = {
  "roster": "/roster",
  "review-queue": "/review-queue",
  "mentees": "/",
  "assessments": "/assessments",
  "student-access": "/student-access",
  "daily-attendance": "/daily-attendance",
  "professors": "/professors",
  "requirements": "/requirements",
  // Legacy aliases so old links still resolve to the merged tab
  "settings": "/requirements",
  "procedures": "/requirements",
};

export function HODPortal({ activeTab }: { activeTab?: string }) {
  const currentUser = useCurrentUser();
  const [location, setLocation] = useLocation();
  const { department, config } = useDepartment();
  const currentTab = React.useMemo(() => {
    if (activeTab) return activeTab;
    if (location === "/" || location === "/mentees") return "mentees";
    if (location === "/review-queue") return "review-queue";
    if (location === "/assessments") return "assessments";
    if (location === "/roster") return "roster";
    if (location === "/student-access") return "student-access";
    if (location === "/professors") return "professors";
    if (location === "/daily-attendance") return "daily-attendance";
    return "requirements";
  }, [activeTab, location]);
  const [analyticsData, setAnalyticsData] = React.useState<AnalyticsData | null>(null);
  const [pendingStudents, setPendingStudents] = React.useState<Registration[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = React.useState<string | null>(null);
  const [studentsError, setStudentsError] = React.useState<string | null>(null);

  const [roster, setRoster] = React.useState<DepartmentRoster | null>(null);
  const [rosterLoading, setRosterLoading] = React.useState(false);
  const [rosterError, setRosterError] = React.useState<string | null>(null);
  const rosterRequest = React.useRef(0);

  const [userToDelete, setUserToDelete] = React.useState<{id: number, name: string, role: string} | null>(null);
  const [deletingUser, setDeletingUser] = React.useState(false);
  const [deleteUserError, setDeleteUserError] = React.useState<string | null>(null);

  // Roster Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterBatch, setFilterBatch] = React.useState("all");
  const [filterStatus, setFilterStatus] = React.useState("all");

  // Professor Form State
  const [profForm, setProfForm] = React.useState({ fullName: "", email: "" });
  const [creatingProf, setCreatingProf] = React.useState(false);

  // Weekly Mochi digest state for HOD
  const [digestState, setDigestState] = React.useState<DigestCardState | null>(null);
  const [digestRetry, setDigestRetry] = React.useState(0);
  const digestUserId = currentUser?.id;
  const digestDepartmentId = currentUser?.departmentId;
  const isEligibleHod =
    !isDemoMode() &&
    currentUser?.role === "hod" &&
    typeof digestUserId === "number" &&
    typeof digestDepartmentId === "number" &&
    digestDepartmentId > 0;
  const digestActive = isEligibleHod && currentTab === "mentees";

  const retryWeeklyDigest = React.useCallback(() => {
    setDigestRetry((count) => count + 1);
  }, []);

  React.useEffect(() => {
    if (!digestActive) return;
    let timer: number;
    let requestedWeek: string | undefined;
    let currentRequest: AbortController | undefined;

    const refreshDigest = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible") return;

      const { weekStart, refreshAt } = digestWeek(new Date());
      if (refreshAt !== null) {
        timer = window.setTimeout(refreshDigest, Math.max(0, refreshAt - Date.now()));
      }
      if (requestedWeek === weekStart) return;

      currentRequest?.abort();
      const request = new AbortController();
      currentRequest = request;
      requestedWeek = weekStart;
      const scope = { userId: digestUserId, departmentId: digestDepartmentId, requestedWeek: weekStart };
      setDigestState({ ...scope, status: "loading" });
      apiPost<unknown>("/api/arogya/department-report/weekly", {}, { signal: request.signal })
        .then((data) => {
          if (request.signal.aborted) return;
          if (isValidWeeklyDigest(data) && data.weekStart === weekStart) {
            setDigestState({ ...data, ...scope });
            return;
          }
          requestedWeek = undefined;
          setDigestState({ ...scope, status: "error" });
        })
        .catch(() => {
          if (!request.signal.aborted) setDigestState({ ...scope, status: "error" });
        });
    };
    refreshDigest();
    window.addEventListener("focus", refreshDigest);
    document.addEventListener("visibilitychange", refreshDigest);
    return () => {
      currentRequest?.abort();
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshDigest);
      document.removeEventListener("visibilitychange", refreshDigest);
    };
  }, [digestActive, digestUserId, digestDepartmentId, digestRetry]);

  let activeDigest: DigestCardState | null = null;
  if (digestActive) {
    const currentDigestWeek = digestWeek(new Date()).weekStart;
    activeDigest = digestState?.userId === digestUserId && digestState.departmentId === digestDepartmentId &&
      digestState.requestedWeek === currentDigestWeek
      ? digestState
      : { userId: digestUserId, departmentId: digestDepartmentId, requestedWeek: currentDigestWeek, status: "loading" };
  }

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnalyticsError(null);
    try {
      const user = getCurrentUser();
      if (!user) {
        setError("Not logged in");
        return;
      }
      
      try {
        const students = await apiGet<Registration[]>("/api/admin/students/pending");
        setPendingStudents(students);
        setStudentsError(null);
      } catch (err) {
        console.warn("Could not fetch pending students", err);
        setStudentsError("Could not load pending students");
      }

      try {
        const data = await apiGet<AnalyticsData>(`/api/departments/${user.departmentId}/analytics`);
        setAnalyticsData(data);
      } catch (err) {
        setAnalyticsError("Could not load analytics");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoster = React.useCallback(async () => {
    const request = ++rosterRequest.current;
    setRosterLoading(true);
    setRosterError(null);
    try {
      const data = await apiGet<DepartmentRoster>("/api/admin/roster");
      if (request === rosterRequest.current) setRoster(data);
    } catch (err: any) {
      // AGENTS.md sec 7: this file has regressed on the fallback-numbers rule twice
      // already (SEC-10, the analytics panel; SEC-15, this roster tab). A toast alone
      // fades - the summary cards and tables below must not fall back to "?? 0" /
      // "no students" while rosterError is set, or a failed load looks identical to a
      // real, empty department.
      if (request === rosterRequest.current) setRosterError(err.message || "Could not load the department roster");
    } finally {
      if (request === rosterRequest.current) setRosterLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keep the roster load scoped to the tabs that display it.
  React.useEffect(() => {
    if ((currentTab === "roster" || currentTab === "professors") && !roster) void fetchRoster();
  }, [currentTab, roster, fetchRoster]);

  const approveStudent = async (id: number) => {
    try {
      const result = await apiPost<{ emailAccepted: boolean }>(`/api/admin/students/${id}/approve`, {});
      toast.success("Student approved successfully");
      if (!result.emailAccepted) toast.warning("Student approval is complete, but the confirmation email could not be accepted by the email provider.");
      setPendingStudents((current) => current.filter((s) => s.id !== id));
      setRoster(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve student");
    }
  };

  const rejectStudent = async (id: number) => {
    if (!window.confirm("Reject this student registration?")) return;
    try {
      await apiPost(`/api/admin/students/${id}/reject`, {});
      toast.success("Student registration rejected");
      setPendingStudents((current) => current.filter((s) => s.id !== id));
      setRoster(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to reject student");
    }
  };

  const removeUser = async (id: number, name: string) => {
    if (!window.confirm(`Deactivate ${name}? Access will be revoked; logbooks and assignments will be retained.`)) return;
    try {
      await apiDelete(`/api/admin/users/${id}`);
      toast.success("Account deactivated; records retained");
      await fetchRoster();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove user");
    }
  };

  const handleHardDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    setDeleteUserError(null);
    try {
      const res: any = await apiDelete(`/api/admin/users/${userToDelete.id}/hard`);
      
      let deletedCount = 0;
      if (res?.deletedRecords) {
        deletedCount = Object.values(res.deletedRecords).reduce((acc: number, val: any) => acc + (typeof val === 'number' ? val : 0), 0) as number;
      }
      
      const summary = deletedCount > 0 ? ` (${deletedCount} related records removed)` : "";
      toast.success(`${userToDelete.name} permanently deleted${summary}`);
      
      setUserToDelete(null);
      await fetchRoster();
    } catch (err: any) {
      setDeleteUserError(err.message || "Failed to permanently delete user");
    } finally {
      setDeletingUser(false);
    }
  };

  const reactivateUser = async (id: number, name: string) => {
    if (!window.confirm(`Restore department access for ${name}?`)) return;
    try {
      await apiPost(`/api/admin/users/${id}/reactivate`, {});
      toast.success("Account reactivated");
      await fetchRoster();
    } catch (err: any) { toast.error(err.message || "Could not reactivate account"); }
  };

  const handleCreateProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingProf(true);
    try {
      const result = await apiPost<{ emailAccepted: boolean; emailFailure?: { failure: string; providerStatus?: number } }>("/api/admin/professors", profForm);
      toast.success(isDemoMode() ? "Demo faculty member added" : "Faculty account created successfully");
      if (!isDemoMode() && !result.emailAccepted) {
        const detail = result.emailFailure?.failure === "missing_configuration" ? "Email service configuration is missing"
          : result.emailFailure?.failure === "provider_rejected" ? `Email provider rejected it${result.emailFailure.providerStatus ? ` (HTTP ${result.emailFailure.providerStatus})` : ""}`
            : "Email provider could not be reached";
        toast.warning(`Faculty account created. ${detail}; check the server log and Resend Events.`);
      }
      setProfForm({ fullName: "", email: "" });
      await fetchRoster();
    } catch (err: any) {
      toast.error(err.message || "Failed to create faculty account");
    } finally {
      setCreatingProf(false);
    }
  };

  // Compute Roster Filter (MUST BE BEFORE EARLY RETURN)
  const batches = React.useMemo(() => Array.from(new Set(roster?.students.map(s => s.batch).filter(Boolean))).sort(), [roster?.students]);
  const filteredStudents = React.useMemo(() => {
    return (roster?.students || []).filter((s) => {
      const matchesSearch = s.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || s.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBatch = filterBatch === "all" || s.batch === filterBatch;
      const matchesStatus = filterStatus === "all" || s.status === filterStatus;
      return matchesSearch && matchesBatch && matchesStatus;
    });
  }, [roster?.students, searchQuery, filterBatch, filterStatus]);

  if (loading && !analyticsData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full border-4 border-line-soft border-t-forest h-8 w-8"></div>
      </div>
    );
  }

  // AGENTS.md sec 7: a failed load must show a visible error, never an ordinary-looking
  // portal with silently missing data. error covers "not logged in" and any unexpected
  // failure outside the three individually-scoped fetches below; when set, the portal
  // itself does not render at all.
  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-4 text-center" role="alert">
        <p className="text-sm font-medium text-status-foreground">{error}</p>
        <Button onClick={fetchData} variant="outline">Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {analyticsError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-status-border bg-status px-4 py-3">
          <p className="text-sm font-medium text-status-foreground">{analyticsError}</p>
          <Button size="sm" variant="outline" onClick={fetchData}>Try again</Button>
        </div>
      )}

      <div data-tour="hod-overview" className="rounded-2xl bg-deep p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Badge className="bg-white/20 text-white border-forest/30 text-xs font-semibold mb-2">
            Head of Department Dashboard
          </Badge>
          <h2 className="text-2xl font-black">{department.name}</h2>
          <p className="text-xs text-white mt-1">{currentUser?.name} · Department overview</p>
        </div>
        {analyticsData && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-deep/80 border border-forest p-3 rounded-xl text-center">
              <p className="text-lg font-black text-mint"><DemoCount value={analyticsData.totalStudents} /></p>
              <p className="text-[10px] text-white font-semibold uppercase">Residents</p>
            </div>
            {analyticsData.totalStudents > 0 && (
              <div className="bg-deep/80 border border-forest p-3 rounded-xl text-center">
                <p className="text-lg font-black text-white"><DemoCount value={analyticsData.avgCompletion} />%</p>
                <p className="text-[10px] text-white font-semibold uppercase">Average progress</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Tabs value={currentTab} onValueChange={(value) => setLocation(paths[value] ?? "/")}>

        {/* Review Queue tab — reuses ProfessorPortal which accepts HOD role */}
        <TabsContent value="review-queue" className="pt-4">
          <ProfessorPortal activeTab="review-queue" embedded />
        </TabsContent>

        <TabsContent value="mentees" className="pt-4">
          {activeDigest && (
            <Card className="mb-4 border-line-soft bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">This week</CardTitle>
              </CardHeader>
              <CardContent>
                {activeDigest.status === "loading" && (
                  <p role="status" className="text-sm text-helper">
                    Loading this week’s Mochi digest…
                  </p>
                )}
                {activeDigest.status === "pending" && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-sm text-soft-ink">Mochi is preparing this week’s digest.</p>
                    <Button size="sm" variant="outline" onClick={retryWeeklyDigest}>
                      Check again
                    </Button>
                  </div>
                )}
                {activeDigest.status === "error" && (
                  <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-sm font-medium text-status-foreground">
                      This week’s Mochi digest is unavailable.
                    </p>
                    <Button size="sm" variant="outline" onClick={retryWeeklyDigest}>
                      Try again
                    </Button>
                  </div>
                )}
                {activeDigest.status === "ready" && (
                  <div className="space-y-2">
                    <p className="text-sm text-ink leading-relaxed">{activeDigest.summary}</p>
                    <p className="text-xs text-helper">
                      Snapshot from {formatDigestSnapshotDate(activeDigest.generatedAt)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <ProfessorPortal activeTab="mentees" embedded />
        </TabsContent>

        <TabsContent value="assessments" className="pt-4">
          <ProfessorPortal activeTab="assessments" embedded />
        </TabsContent>

        {/* Roster tab */}
        <TabsContent value="roster" className="space-y-6 pt-4">
          {rosterLoading ? (
            <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full border-4 border-line-soft border-t-forest h-8 w-8" /></div>
          ) : rosterError ? (
            <div className="flex h-40 flex-col items-center justify-center space-y-4 text-center" role="alert">
              <p className="text-sm font-medium text-status-foreground">{rosterError}</p>
              <Button onClick={fetchRoster} variant="outline">Try again</Button>
            </div>
          ) : (
            <>
              {isDemoMode() && analyticsData && <DemoLogStatsChart logStats={analyticsData.logStats} />}
              {userToDelete && (
                <Card className="border-status-border bg-status shadow-sm mb-6">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status">
                        <AlertTriangle className="h-4 w-4 text-status-foreground" />
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <h4 className="font-semibold text-status-foreground">Permanently delete {userToDelete.name}?</h4>
                          <p className="text-sm text-status-foreground mt-1 leading-relaxed">
                            This will <strong>permanently delete</strong> the {userToDelete.role} and <strong>all</strong> of their associated data. This action is <strong>irreversible</strong>.
                          </p>
                          {userToDelete.role === "student" ? (
                            <ul className="text-sm text-status-foreground mt-1 ml-4 list-disc space-y-0.5">
                              <li>Their account and profile</li>
                              <li>All of their clinical logs, case logs, and procedures</li>
                              <li>Their assessments, appraisals, and attendance records</li>
                              <li>Their leave records and applications</li>
                              <li>Their thesis milestones and research records</li>
                            </ul>
                          ) : (
                            <ul className="text-sm text-status-foreground mt-1 ml-4 list-disc space-y-0.5">
                              <li>Their account and profile</li>
                              <li>Any assignment types and assignments they created</li>
                              <li><strong>Every clinical and academic record belonging to OTHER students</strong> where this faculty appears as reviewer, verifier, or supervisor</li>
                              <li>Their assessments and appraisals of students</li>
                            </ul>
                          )}
                        </div>

                        {deleteUserError && (
                          <div className="p-3 bg-status border border-status-border rounded-md text-sm text-status-foreground font-medium">
                            {deleteUserError}
                          </div>
                        )}

                        <div className="flex gap-2 justify-end">
                          <Button type="button" variant="outline" onClick={() => { setUserToDelete(null); setDeleteUserError(null); }}>
                            Cancel
                          </Button>
                          <Button
                            onClick={handleHardDeleteUser}
                            disabled={deletingUser}
                            className="bg-destructive hover:bg-deep text-white"
                          >
                            {deletingUser ? "Deleting..." : `Yes, permanently delete ${userToDelete.name}`}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Approved students" value={roster?.students.filter((student) => student.status === "approved").length ?? 0} />
                {(() => {
                  const withProgress = roster?.students.filter((s) => s.completion !== null && s.completion !== undefined) || [];
                  return withProgress.length > 0 ? (
                    <SummaryCard label="Average progress" value={`${Math.round(withProgress.reduce((sum, s) => sum + (s.completion || 0), 0) / withProgress.length)}%`} />
                  ) : null;
                })()}
                <SummaryCard label="Faculty" value={roster?.professors.length ?? 0} />
                <SummaryCard label="Awaiting approval" value={pendingStudents.length} error={studentsError} />
              </div>
              <Card data-tour="hod-student-roster">
                <CardHeader className="border-b border-line-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-forest" />
                    PG Residents ({filteredStudents.length})
                  </CardTitle>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-helper" />
                      <Input
                        placeholder="Search name or reg no..."
                        className="pl-8 h-9 w-full sm:w-64"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={filterBatch}
                      onChange={(e) => setFilterBatch(e.target.value)}
                    >
                      <option value="all">All Batches</option>
                      {batches.map(b => <option key={b as string} value={b as string}>{b}</option>)}
                    </select>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="all">All Status</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {!roster?.students.length ? (
                    <p className="p-6 text-center text-sm text-helper">No students in this department.</p>
                  ) : (
                    <Table>
                      <TableHeader className="bg-mist">
                        <TableRow>
                          <TableHead>Reg. No.</TableHead>
                          <TableHead>Full Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStudents.map((s, index) => (
                          <TableRow key={s.id} className={isDemoMode() ? "demo-stagger-item" : undefined} style={isDemoMode() ? { "--demo-stagger-index": index } as React.CSSProperties : undefined}>
                            <TableCell className="font-mono text-xs font-semibold">{s.registrationNumber}</TableCell>
                            <TableCell className="font-semibold">{s.fullName}</TableCell>
                            <TableCell className="text-xs text-helper">{s.email}</TableCell>
                            <TableCell>{s.batch ?? "—"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {s.completion !== null && s.completion !== undefined && (
                                  <CompletionRing value={s.completion} />
                                )}
                                <div className="text-[11px] leading-5 text-helper">
                                  {!config?.enabledFeatures?.hideCaseLogs && <p>{config?.requiredCases !== null && config?.requiredCases !== undefined ? `${s.verified?.cases ?? 0}/${s.targets?.cases ?? 0} cases` : `${s.verified?.cases ?? 0} cases verified`}</p>}
                                  {!config?.enabledFeatures?.hideProcedureLogs && <p>{config?.requiredProcedures !== null && config?.requiredProcedures !== undefined ? `${s.verified?.procedures ?? 0}/${s.targets?.procedures ?? 0} procedures` : `${s.verified?.procedures ?? 0} procedures verified`}</p>}
                                  {config?.enabledFeatures?.clinicalWorks && <p>{s.targets?.clinicalWork ? `${s.verified?.clinicalWork ?? 0}/${s.targets.clinicalWork} clinical work` : `${s.verified?.clinicalWork ?? 0} clinical work verified`}</p>}
                                  <p>{config?.requiredAcademic !== null && config?.requiredAcademic !== undefined ? `${s.verified?.academics ?? 0}/${s.targets?.academics ?? 0} academics` : `${s.verified?.academics ?? 0} academics verified`}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={s.status === "approved" ? "default" : "secondary"} className="capitalize text-xs">{s.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => s.status === "rejected" ? reactivateUser(s.id, s.fullName) : removeUser(s.id, s.fullName)} className="text-status-foreground border-forest hover:bg-status">
                                  <XCircle className="h-4 w-4 mr-1" /> {s.status === "rejected" ? "Reactivate" : "Deactivate"}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setUserToDelete({ id: s.id, name: s.fullName, role: "student" }); setDeleteUserError(null); }} className="text-status-foreground border-forest hover:bg-status">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b border-line-soft">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-forest" />
                    Faculty ({roster?.professors.length ?? 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!roster?.professors.length ? (
                    <p className="p-6 text-center text-sm text-helper">No faculty in this department.</p>
                  ) : (
                    <Table>
                      <TableHeader className="bg-mist">
                        <TableRow>
                          <TableHead>Full Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roster.professors.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-semibold">{p.fullName}</TableCell>
                            <TableCell className="text-xs text-helper">{p.email}</TableCell>
                            <TableCell>
                              <Badge variant={p.status === "approved" ? "default" : "secondary"} className="capitalize text-xs">{p.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => p.status === "rejected" ? reactivateUser(p.id, p.fullName) : removeUser(p.id, p.fullName)} className="text-status-foreground border-forest hover:bg-status">
                                  <XCircle className="h-4 w-4 mr-1" /> {p.status === "rejected" ? "Reactivate" : "Deactivate"}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setUserToDelete({ id: p.id, name: p.fullName, role: "professor" }); setDeleteUserError(null); }} className="text-status-foreground border-forest hover:bg-status">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="student-access" className="space-y-4 pt-4">
          <Card data-tour="hod-student-approvals">
            <CardHeader className="border-b border-line-soft">
              <CardTitle className="text-xl">Pending Student Approvals</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {studentsError ? (
                <p className="p-6 text-center text-sm text-status-foreground font-medium">{studentsError}</p>
              ) : pendingStudents.length === 0 ? (
                <p className="p-6 text-center text-sm text-helper">No pending student registrations.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Registration No.</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Department / Batch</TableHead>
                      <TableHead>Joining date</TableHead>
                      <TableHead>KUHS ID</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-bold">{student.registrationNumber}</TableCell>
                        <TableCell className="font-semibold">{student.fullName}</TableCell>
                        <TableCell>{student.email}</TableCell>
                        <TableCell><span className="font-medium">{student.department || student.specialty}</span><p className="text-xs text-helper">Batch {student.batch}</p></TableCell>
                        <TableCell>{formatLogbookDate(student.dateOfJoining)}</TableCell>
                        <TableCell className="font-mono text-xs">{student.kuhsId}</TableCell>
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button data-tour="hod-approve-student" size="sm" onClick={() => approveStudent(student.id)}>
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => rejectStudent(student.id)} className="text-status-foreground border-status-border hover:bg-status">
                                <XCircle className="h-4 w-4 mr-2" /> Reject
                              </Button>
                            </div>
                          </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="professors" className="grid items-start gap-4 pt-4 data-[state=inactive]:hidden lg:grid-cols-2">
          <Card data-tour="hod-add-faculty" className="min-w-0">
            <CardHeader className="border-b border-line-soft">
              <CardTitle className="text-xl">Add Faculty</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleCreateProfessor} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prof-name">Full Name</Label>
                  <Input id="prof-name" value={profForm.fullName} onChange={(e) => setProfForm({...profForm, fullName: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prof-email">Email Address</Label>
                  <Input id="prof-email" type="email" value={profForm.email} onChange={(e) => setProfForm({...profForm, email: e.target.value})} required />
                </div>
                <p className="text-sm text-soft-ink">{isDemoMode()
                  ? "Demo faculty appear in this department’s sample roster. No email is sent."
                  : "A secure temporary password will be generated and sent to the faculty member’s email. They can change it after signing in."}</p>
                <Button type="submit" disabled={creatingProf} className="w-full">
                  <UserPlus className="h-4 w-4 mr-2" /> {creatingProf ? "Creating..." : "Create Faculty Account"}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader className="border-b border-line-soft">
              <CardTitle className="text-xl">Existing Faculty</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {rosterError ? <div role="alert" className="space-y-3 p-5 text-sm">
                <p>{rosterError}</p>
                <Button size="sm" variant="outline" onClick={fetchRoster}>Try again</Button>
              </div> : rosterLoading || !roster ? <p role="status" className="p-5 text-sm text-helper">Loading faculty…</p>
                : roster.professors.length === 0 ? <p className="p-5 text-sm text-helper">No faculty in this department.</p>
                : <ul className="max-h-96 divide-y divide-line-soft overflow-y-auto" aria-label="Department faculty">
                  {roster.professors.map((faculty) => <li key={faculty.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
                    <div className="min-w-0 break-words">
                      <p className="text-sm font-medium text-ink">{faculty.fullName}</p>
                      <p className="text-xs text-helper">{faculty.email}</p>
                    </div>
                    {faculty.status && <Badge variant={faculty.status === "approved" ? "default" : "secondary"} className="capitalize">
                      {faculty.status === "rejected" ? "Deactivated" : faculty.status}
                    </Badge>}
                  </li>)}
                </ul>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily-attendance" className="pt-4">
          <ProfessorPortal activeTab="daily-attendance" embedded />
        </TabsContent>

        <TabsContent value="daily-attendance" className="pt-4">

          <ProfessorPortal activeTab="daily-attendance" embedded />

        </TabsContent>



        <TabsContent value="requirements" className="pt-4">
          <DepartmentSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, error }: { label: string; value: string | number; error?: string | null }) {
  return <Card className={`border-line-soft bg-white ${isDemoMode() ? "demo-lift-card" : ""}`}><CardContent className="p-5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-helper">{label}</p>{error ? <p className="mt-2 text-sm font-medium text-status-foreground">{error}</p> : <p className="mt-2 text-3xl font-semibold text-ink">{typeof value === "number" && isDemoMode() ? <DemoCount value={value} /> : value}</p>}</CardContent></Card>;
}

function CompletionRing({ value }: { value: number }) {
  const animatedValue = useDemoAnimatedValue(value);
  const safeValue = Math.max(0, Math.min(Math.round(animatedValue), 100));
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full">
      <ProgressRing value={safeValue} strokeWidth={14.2857} />
      <div className="grid h-10 w-10 place-items-center relative rounded-full bg-white text-[11px] font-bold text-ink">{safeValue}%</div>
    </div>
  );
}

function DemoLogStatsChart({ logStats }: { logStats: AnalyticsData["logStats"] }) {
  const animateChart = useDemoMotionEnabled();
  const rows = [
    { name: "Verified", value: logStats.verified, color: "var(--chart-1)" },
    { name: "Pending", value: logStats.pending, color: "var(--chart-2)" },
    { name: "Returned", value: logStats.rejected, color: "var(--chart-3)" },
  ];
  return (
    <Card data-tour="hod-log-activity" className="mb-6 border-line-soft bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Department log activity</CardTitle>
        <p className="text-sm text-soft-ink">Sample records across the active department.</p>
      </CardHeader>
      <CardContent>
        <div className="h-52 w-full" role="img" aria-label="Sample department log activity by review status">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--gothos-muted)" }} />
              <Tooltip formatter={(value) => [value, "Entries"]} cursor={{ fill: "var(--gothos-mist)" }} />
              <Bar dataKey="value" radius={[7, 7, 0, 0]} isAnimationActive={animateChart} animationDuration={650}>
                {rows.map((row) => <Cell key={row.name} fill={row.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
