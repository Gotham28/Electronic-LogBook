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
import { useDepartment } from "@/lib/department-context";
import { DepartmentSettings } from "@/components/DepartmentSettings";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
import { ProfessorPortal } from "@/components/ProfessorPortal";

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

type AnalyticsData = {
  totalStudents: number;
  avgCompletion: number;
  logStats: { pending: number; verified: number; rejected: number };
  topProcedures: { name: string; count: number }[];
};

type LeaveRequest = {
  id: string;
  number: string;
  residentName: string;
  type: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
};

const paths: Record<string, string> = {
  "roster": "/roster",
  "review-queue": "/review-queue",
  "mentees": "/",
  "assessments": "/assessments",
  "student-access": "/student-access",
  "leave-approvals": "/leave-approvals",
  "professors": "/professors",
  "requirements": "/requirements",
  // Legacy aliases so old links still resolve to the merged tab
  "settings": "/requirements",
  "procedures": "/requirements",
};

export function HODPortal({ activeTab }: { activeTab?: string }) {
  const [location, setLocation] = useLocation();
  const { department, hod } = useDepartment();
  const currentTab = React.useMemo(() => {
    if (activeTab) return activeTab;
    if (location === "/" || location === "/mentees") return "mentees";
    if (location === "/review-queue") return "review-queue";
    if (location === "/assessments") return "assessments";
    if (location === "/roster") return "roster";
    if (location === "/student-access") return "student-access";
    if (location === "/professors") return "professors";
    if (location === "/leave-approvals") return "leave-approvals";
    return "requirements";
  }, [activeTab, location]);
  const [analyticsData, setAnalyticsData] = React.useState<AnalyticsData | null>(null);
  const [pendingStudents, setPendingStudents] = React.useState<Registration[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = React.useState<string | null>(null);
  const [studentsError, setStudentsError] = React.useState<string | null>(null);
  const [leavesError, setLeavesError] = React.useState<string | null>(null);

  const [roster, setRoster] = React.useState<{ students: any[]; professors: any[] } | null>(null);
  const [rosterLoading, setRosterLoading] = React.useState(false);
  const [rosterError, setRosterError] = React.useState<string | null>(null);

  // Roster Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterBatch, setFilterBatch] = React.useState("all");
  const [filterStatus, setFilterStatus] = React.useState("all");

  // Professor Form State
  const [profForm, setProfForm] = React.useState({ fullName: "", email: "", password: "" });
  const [creatingProf, setCreatingProf] = React.useState(false);

  // Leave approvals
  const [leaves, setLeaves] = React.useState<LeaveRequest[]>([]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnalyticsError(null);
    setStudentsError(null);
    setLeavesError(null);
    try {
      const user = getCurrentUser();
      if (!user) {
        setError("Not logged in");
        return;
      }
      
      try {
        const students = await apiGet<Registration[]>("/api/admin/students/pending");
        setPendingStudents(students);
      } catch (err) {
        console.warn("Could not fetch pending students", err);
        setStudentsError("Could not load pending students");
      }

      try {
        const pendingLeaves = await apiGet<LeaveRequest[]>("/api/admin/leaves/pending");
        setLeaves(pendingLeaves);
      } catch (err) {
        console.warn("Could not fetch pending leaves", err);
        setLeavesError("Could not load pending leaves");
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
    setRosterLoading(true);
    setRosterError(null);
    try {
      const data = await apiGet<{ students: any[]; professors: any[] }>("/api/admin/roster");
      setRoster(data);
    } catch (err: any) {
      // AGENTS.md sec 7: this file has regressed on the fallback-numbers rule twice
      // already (SEC-10, the analytics panel; SEC-15, this roster tab). A toast alone
      // fades - the summary cards and tables below must not fall back to "?? 0" /
      // "no students" while rosterError is set, or a failed load looks identical to a
      // real, empty department.
      setRosterError(err.message || "Could not load the department roster");
    } finally {
      setRosterLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lazy-load roster only when that tab is active
  React.useEffect(() => {
    if (currentTab === "roster" && !roster) fetchRoster();
  }, [currentTab, roster, fetchRoster]);

  const approveStudent = async (id: number) => {
    try {
      await apiPost(`/api/admin/students/${id}/approve`, {});
      toast.success("Student approved successfully");
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
      await apiPost("/api/admin/professors", {
        ...profForm
      });
      toast.success("Faculty account created successfully");
      setProfForm({ fullName: "", email: "", password: "" });
      setRoster(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to create faculty account");
    } finally {
      setCreatingProf(false);
    }
  };

  const decideLeave = async (id: string, approved: boolean) => {
    try {
      const action = approved ? "approve" : "reject";
      await apiPost(`/api/admin/leaves/${id}/action`, { action });
      setLeaves((current) => current.filter((leave) => leave.id !== id));
      toast.success(approved ? "Leave approved" : "Leave returned");
    } catch (err: any) {
      toast.error(err.message || "Failed to process leave request");
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
        <div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8"></div>
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
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <Button onClick={fetchData} variant="outline">Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <Card className="overflow-hidden border-teal-100 bg-gradient-to-r from-teal-800 via-teal-700 to-cyan-600 text-white">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-100">Department leadership</p>
              <h2 className="mt-2 text-3xl font-bold">{hod?.name || getCurrentUser()?.name}</h2>
              <p className="mt-2 text-sm text-teal-50">HOD, Department of {department.name}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {analyticsError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-medium text-rose-700">{analyticsError}</p>
          <Button size="sm" variant="outline" onClick={fetchData}>Try again</Button>
        </div>
      )}

      <Tabs value={currentTab} onValueChange={(value) => setLocation(paths[value] ?? "/")}>

        {/* Review Queue tab — reuses ProfessorPortal which accepts HOD role */}
        <TabsContent value="review-queue" className="pt-4">
          <ProfessorPortal activeTab="review-queue" embedded />
        </TabsContent>

        <TabsContent value="mentees" className="pt-4">
          <ProfessorPortal activeTab="mentees" embedded />
        </TabsContent>

        <TabsContent value="assessments" className="pt-4">
          <ProfessorPortal activeTab="assessments" embedded />
        </TabsContent>

        {/* Roster tab */}
        <TabsContent value="roster" className="space-y-6 pt-4">
          {rosterLoading ? (
            <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" /></div>
          ) : rosterError ? (
            <div className="flex h-40 flex-col items-center justify-center space-y-4 text-center" role="alert">
              <p className="text-sm font-medium text-rose-700">{rosterError}</p>
              <Button onClick={fetchRoster} variant="outline">Try again</Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Approved students" value={roster?.students.filter((student) => student.status === "approved").length ?? 0} />
                <SummaryCard label="Average progress" value={`${Math.round((roster?.students.reduce((sum, student) => sum + (student.completion || 0), 0) ?? 0) / Math.max(roster?.students.length ?? 0, 1))}%`} />
                <SummaryCard label="Faculty" value={roster?.professors.length ?? 0} />
                <SummaryCard label="Awaiting approval" value={pendingStudents.length} />
              </div>
              <Card>
                <CardHeader className="border-b border-teal-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-teal-600" />
                    PG Residents ({filteredStudents.length})
                  </CardTitle>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
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
                    <p className="p-6 text-center text-sm text-slate-500">No students in this department.</p>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50">
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
                        {filteredStudents.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono text-xs font-semibold">{s.registrationNumber}</TableCell>
                            <TableCell className="font-semibold">{s.fullName}</TableCell>
                            <TableCell className="text-xs text-slate-500">{s.email}</TableCell>
                            <TableCell>{s.batch ?? "—"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <CompletionRing value={s.completion ?? 0} />
                                <div className="text-[11px] leading-5 text-slate-500">
                                  <p>{s.verified?.cases ?? 0}/{s.targets?.cases ?? 0} cases</p>
                                  <p>{s.verified?.procedures ?? 0}/{s.targets?.procedures ?? 0} procedures</p>
                                  <p>{s.verified?.academics ?? 0}/{s.targets?.academics ?? 0} academics</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={s.status === "approved" ? "default" : "secondary"} className="capitalize text-xs">{s.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => s.status === "rejected" ? reactivateUser(s.id, s.fullName) : removeUser(s.id, s.fullName)} className="text-rose-700 border-rose-200 hover:bg-rose-50">
                                <XCircle className="h-4 w-4 mr-1" /> {s.status === "rejected" ? "Reactivate" : "Deactivate"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b border-teal-100">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-teal-600" />
                    Faculty ({roster?.professors.length ?? 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!roster?.professors.length ? (
                    <p className="p-6 text-center text-sm text-slate-500">No faculty in this department.</p>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50">
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
                            <TableCell className="text-xs text-slate-500">{p.email}</TableCell>
                            <TableCell>
                              <Badge variant={p.status === "approved" ? "default" : "secondary"} className="capitalize text-xs">{p.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => p.status === "rejected" ? reactivateUser(p.id, p.fullName) : removeUser(p.id, p.fullName)} className="text-rose-700 border-rose-200 hover:bg-rose-50">
                                <XCircle className="h-4 w-4 mr-1" /> {p.status === "rejected" ? "Reactivate" : "Deactivate"}
                              </Button>
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
          <Card>
            <CardHeader className="border-b border-teal-100">
              <CardTitle className="text-xl">Pending Student Approvals</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {studentsError ? (
                <p className="p-6 text-center text-sm text-red-500 font-medium">{studentsError}</p>
              ) : pendingStudents.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">No pending student registrations.</p>
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
                        <TableCell><span className="font-medium">{student.department || student.specialty}</span><p className="text-xs text-slate-500">Batch {student.batch}</p></TableCell>
                        <TableCell>{formatLogbookDate(student.dateOfJoining)}</TableCell>
                        <TableCell className="font-mono text-xs">{student.kuhsId}</TableCell>
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" onClick={() => approveStudent(student.id)}>
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => rejectStudent(student.id)} className="text-rose-700 border-rose-200 hover:bg-rose-50">
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

        <TabsContent value="professors" className="space-y-4 pt-4">
          <Card className="max-w-xl">
            <CardHeader className="border-b border-teal-100">
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
                <div className="space-y-2">
                  <Label htmlFor="prof-pass">Initial Password</Label>
                  <Input id="prof-pass" type="password" value={profForm.password} onChange={(e) => setProfForm({...profForm, password: e.target.value})} minLength={8} required />
                </div>
                <Button type="submit" disabled={creatingProf} className="w-full">
                  <UserPlus className="h-4 w-4 mr-2" /> {creatingProf ? "Creating..." : "Create Faculty Account"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave-approvals" className="pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-teal-100">
              <CardTitle className="text-xl">Pending leave requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {leavesError ? (
                <p className="p-6 text-center text-sm text-red-500 font-medium">{leavesError}</p>
              ) : leaves.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">No pending leave requests.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Resident</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Decision</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {leaves.map((leave, idx) => (
                      <TableRow key={leave.id}>
                        <TableCell className="font-bold">{idx + 1}</TableCell>
                        <TableCell className="font-semibold">{leave.residentName}</TableCell>
                        <TableCell>{leave.type}</TableCell>
                        <TableCell>{leave.reason}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => decideLeave(leave.id, false)} className="text-rose-700"><XCircle className="h-4 w-4" /> Return</Button>
                            <Button size="sm" onClick={() => decideLeave(leave.id, true)}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
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

        <TabsContent value="requirements" className="pt-4"><DepartmentSettings /></TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return <Card className="border-slate-200 bg-white"><CardContent className="p-5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p></CardContent></Card>;
}

function CompletionRing({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(value, 100));
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#0d9488 ${safeValue * 3.6}deg, #e2e8f0 0deg)` }}>
      <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-900">{safeValue}%</div>
    </div>
  );
}
