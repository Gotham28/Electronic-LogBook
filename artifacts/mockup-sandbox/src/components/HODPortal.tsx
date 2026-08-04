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
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACADEMIC_REQUIREMENTS,
  DEPARTMENT_HOD,
  formatLogbookDate,
  REQUIRED_PROCEDURE_COUNT,
} from "@/lib/logbook-config";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
import { ProfessorPortal } from "@/components/ProfessorPortal";

type Registration = {
  id: number;
  fullName: string;
  email: string;
  registrationNumber: string;
  batch: string;
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
  "gap-dashboard": "/",
  "review-queue": "/review-queue",
  "student-access": "/student-access",
  "leave-approvals": "/leave-approvals",
  "professors": "/professors",
  "roster": "/roster",
  "requirements": "/requirements",
  // Legacy aliases so old links still resolve to the merged tab
  "settings": "/requirements",
  "procedures": "/requirements",
};

export function HODPortal({ activeTab = "gap-dashboard" }: { activeTab?: string }) {
  const [, setLocation] = useLocation();
  const [analyticsData, setAnalyticsData] = React.useState<AnalyticsData | null>(null);
  const [pendingStudents, setPendingStudents] = React.useState<Registration[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = React.useState<string | null>(null);
  const [studentsError, setStudentsError] = React.useState<string | null>(null);
  const [leavesError, setLeavesError] = React.useState<string | null>(null);

  const [roster, setRoster] = React.useState<{ students: any[]; professors: any[] } | null>(null);
  const [rosterLoading, setRosterLoading] = React.useState(false);

  // Settings State
  const [deptConfig, setDeptConfig] = React.useState({ requiredCases: 50, requiredProcedures: 101, requiredAcademic: 15 });
  const [savingConfig, setSavingConfig] = React.useState(false);

  // Procedures State
  const [procedures, setProcedures] = React.useState<any[]>([]);
  const [procForm, setProcForm] = React.useState({ name: "", group: "emergency" });
  const [addingProc, setAddingProc] = React.useState(false);

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
        const config = await apiGet<any>("/api/admin/department/config");
        if (config) setDeptConfig(config);
      } catch (err) {
        console.warn("Could not fetch config", err);
      }

      try {
        const procs = await apiGet<any[]>("/api/admin/department/procedures");
        if (procs) setProcedures(procs);
      } catch (err) {
        console.warn("Could not fetch procedures", err);
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
    try {
      const data = await apiGet<{ students: any[]; professors: any[] }>("/api/admin/roster");
      setRoster(data);
    } catch (err: any) {
      toast.error("Failed to load roster");
    } finally {
      setRosterLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lazy-load roster only when that tab is active
  React.useEffect(() => {
    if (activeTab === "roster" && !roster) fetchRoster();
  }, [activeTab, roster, fetchRoster]);

  const approveStudent = async (id: number) => {
    try {
      await apiPost(`/api/admin/students/${id}/approve`, {});
      toast.success("Student approved successfully");
      setPendingStudents((current) => current.filter((s) => s.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Failed to approve student");
    }
  };

  const rejectStudent = async (id: number) => {
    if (!window.confirm("Reject and permanently remove this student registration?")) return;
    try {
      await apiPost(`/api/admin/students/${id}/reject`, {});
      toast.success("Student registration rejected");
      setPendingStudents((current) => current.filter((s) => s.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Failed to reject student");
    }
  };

  const removeUser = async (id: number, name: string) => {
    if (!window.confirm(`Remove ${name} from the department? This cannot be undone.`)) return;
    try {
      await apiDelete(`/api/admin/users/${id}`);
      toast.success(`${name} removed from department`);
      setRoster((current) =>
        current
          ? {
              students: current.students.filter((s) => s.id !== id),
              professors: current.professors.filter((p) => p.id !== id),
            }
          : null
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to remove user");
    }
  };

  const handleCreateProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingProf(true);
    try {
      await apiPost("/api/admin/professors", {
        ...profForm,
        departmentId: getCurrentUser()?.departmentId
      });
      toast.success("Professor created successfully");
      setProfForm({ fullName: "", email: "", password: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to create professor");
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

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await apiPost("/api/admin/department/config", deptConfig);
      toast.success("Settings saved successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingProc(true);
    try {
      const newProc = await apiPost("/api/admin/department/procedures", procForm);
      toast.success("Procedure added successfully");
      setProcedures([...procedures, newProc]);
      setProcForm({ name: "", group: "emergency" });
    } catch (err: any) {
      toast.error(err.message || "Failed to add procedure");
    } finally {
      setAddingProc(false);
    }
  };

  if (loading && !analyticsData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8"></div>
      </div>
    );
  }

  const logStats = analyticsData?.logStats ?? { pending: 0, verified: 0, rejected: 0 };
  const topProcedures = analyticsData?.topProcedures ?? [];
  const totalLogs = logStats.pending + logStats.verified + logStats.rejected;

  return (
    <div className="space-y-6 pb-12">
      <Card className="overflow-hidden border-teal-100 bg-gradient-to-r from-teal-800 via-teal-700 to-cyan-600 text-white">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-100">Department leadership</p>
              <h2 className="mt-2 text-3xl font-bold">{DEPARTMENT_HOD}</h2>
              <p className="mt-2 text-sm text-teal-50">HOD, Department of Pediatrics</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setLocation(paths[value] ?? "/")}>

        <TabsContent value="gap-dashboard" className="space-y-4 pt-4">
          {analyticsError && (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-md border border-rose-200">
              {analyticsError}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <Overview label="Procedure target" value={String(deptConfig.requiredProcedures)} note="Total procedures required" icon={UserCheck} />
            <Overview label="Case discussions" value={String(deptConfig.requiredCases)} note="Total cases required" icon={CheckCircle2} />
            <Overview label="Academic target" value={String(deptConfig.requiredAcademic)} note="Seminars, journals, etc." icon={TrendingUp} />
          </div>
        </TabsContent>

        {/* Review Queue tab — reuses ProfessorPortal which accepts HOD role */}
        <TabsContent value="review-queue" className="pt-4">
          <ProfessorPortal activeTab="review-queue" />
        </TabsContent>

        {/* Roster tab */}
        <TabsContent value="roster" className="space-y-6 pt-4">
          {rosterLoading ? (
            <div className="flex h-40 items-center justify-center"><div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" /></div>
          ) : (
            <>
              <Card>
                <CardHeader className="border-b border-teal-100">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-teal-600" />
                    PG Residents ({roster?.students.length ?? 0})
                  </CardTitle>
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
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roster.students.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono text-xs font-semibold">{s.registrationNumber}</TableCell>
                            <TableCell className="font-semibold">{s.fullName}</TableCell>
                            <TableCell className="text-xs text-slate-500">{s.email}</TableCell>
                            <TableCell>{s.batch ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={s.status === "approved" ? "default" : "secondary"} className="capitalize text-xs">{s.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => removeUser(s.id, s.fullName)} className="text-rose-700 border-rose-200 hover:bg-rose-50">
                                <XCircle className="h-4 w-4 mr-1" /> Remove
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
                    <p className="p-6 text-center text-sm text-slate-500">No professors in this department.</p>
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
                              <Button size="sm" variant="outline" onClick={() => removeUser(p.id, p.fullName)} className="text-rose-700 border-rose-200 hover:bg-rose-50">
                                <XCircle className="h-4 w-4 mr-1" /> Remove
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
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-bold">{student.registrationNumber}</TableCell>
                        <TableCell className="font-semibold">{student.fullName}</TableCell>
                        <TableCell>{student.email}</TableCell>
                        <TableCell>{student.batch}</TableCell>
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
              <CardTitle className="text-xl">Create Professor Account</CardTitle>
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
                  <UserPlus className="h-4 w-4 mr-2" /> {creatingProf ? "Creating..." : "Create Professor Account"}
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

        <TabsContent value="requirements" className="space-y-6 pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left column: Department target settings */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="border-b border-teal-100">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Settings className="h-5 w-5 text-teal-600" /> Department Targets
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <form onSubmit={handleSaveConfig} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Required Case Discussions (per resident)</Label>
                      <Input type="number" min="0" value={deptConfig.requiredCases} onChange={(e) => setDeptConfig({...deptConfig, requiredCases: parseInt(e.target.value, 10) || 0})} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Required Procedures (per resident)</Label>
                      <Input type="number" min="0" value={deptConfig.requiredProcedures} onChange={(e) => setDeptConfig({...deptConfig, requiredProcedures: parseInt(e.target.value, 10) || 0})} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Required Academic Presentations (per resident)</Label>
                      <Input type="number" min="0" value={deptConfig.requiredAcademic} onChange={(e) => setDeptConfig({...deptConfig, requiredAcademic: parseInt(e.target.value, 10) || 0})} required />
                    </div>
                    <Button type="submit" disabled={savingConfig} className="w-full">
                      <Settings className="h-4 w-4 mr-2" /> {savingConfig ? "Saving..." : "Save Settings"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Right column: Procedure management */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="border-b border-teal-100">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Syringe className="h-5 w-5 text-teal-600" /> Add Procedure Type
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <form onSubmit={handleAddProcedure} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Procedure Name</Label>
                      <Input value={procForm.name} onChange={(e) => setProcForm({...procForm, name: e.target.value})} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Procedure Group</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" value={procForm.group} onChange={(e) => setProcForm({...procForm, group: e.target.value})} required>
                        <option value="emergency">Emergency / Core</option>
                        <option value="invasive">Invasive / Specialized</option>
                        <option value="general">General / Routine</option>
                      </select>
                    </div>
                    <Button type="submit" disabled={addingProc} className="w-full">
                      <Syringe className="h-4 w-4 mr-2" /> {addingProc ? "Adding..." : "Add Procedure"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b border-teal-100">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-teal-600" /> Existing Procedures
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {procedures.length === 0 ? (
                    <p className="p-6 text-center text-sm text-slate-500">No custom procedures defined.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Group</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {procedures.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="capitalize">{p.group}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Overview({ label, value, note, icon: Icon }: any) {
  return <Card><CardContent className="p-5"><Icon className="h-5 w-5 text-teal-600" /><p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-teal-700">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></CardContent></Card>;
}
