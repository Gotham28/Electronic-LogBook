import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Building2, Users, UserCheck, UserX, Plus, GraduationCap, ArrowRight, XCircle, ChevronDown, ChevronRight, Info, UserPlus, Trash2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  getAdminDepartments, 
  createAdminDepartment, 
  getAdminDepartmentRoster, 
  replaceAdminHod, 
  createAdminFaculty, 
  createAdminStudent, 
  deleteAdminDepartment,
  impersonateAdminUser,
  backfillTestDepartments,
  deactivateAdminUser,
  type AdminDepartment,
  type AdminUserRow
} from "@/lib/apiClient";

function generateDefaultResidentForm() {
  return {
    fullName: "",
    email: "",
    password: "",
    registrationNumber: `TEST-${Date.now()}`,
    batch: `${new Date().getFullYear()}`,
    dateOfJoining: new Date().toISOString().slice(0, 10),
    kuhsId: `TEST-KUHS-${Date.now()}`,
  };
}

export function AdminPortal({ onSignOut }: { onSignOut?: () => void }) {
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [showNewDeptPanel, setShowNewDeptPanel] = useState(false);

  const [deptCounts, setDeptCounts] = useState<Map<number, { facultyCount: number, residentCount: number, pendingCount: number }>>(new Map());
  const [failedDepts, setFailedDepts] = useState<Set<number>>(new Set());
  const [loadingCounts, setLoadingCounts] = useState(true);

  // New department form state
  const [newDeptForm, setNewDeptForm] = useState({ name: "", code: "", hodFullName: "", hodEmail: "", hodPassword: "" });
  const [creatingDept, setCreatingDept] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminDepartments();
      setDepartments(data);
      if (data.length > 0 && !selectedDeptId) {
        setSelectedDeptId(data[0].id);
      } else if (selectedDeptId && !data.find((d: any) => d.id === selectedDeptId)) {
        setSelectedDeptId(null);
      }
      
      setLoadingCounts(true);
      const newFailed = new Set<number>();
      const rosters = await Promise.all(
        data.map(async (d) => {
          try {
             return { id: d.id, roster: await getAdminDepartmentRoster(d.id), error: false };
          } catch (e) {
             newFailed.add(d.id);
             return { id: d.id, roster: [], error: true };
          }
        })
      );
      setFailedDepts(newFailed);
      
      const countsMap = new Map();
      rosters.forEach(r => {
         let facultyCount = 0;
         let residentCount = 0;
         let pendingCount = 0;
         
         r.roster.forEach((u: AdminUserRow) => {
            if (u.role === "professor" || u.role === "hod") facultyCount++;
            if (u.role === "student") {
               residentCount++;
               if (u.status === "pending") pendingCount++;
            }
         });
         
         countsMap.set(r.id, { facultyCount, residentCount, pendingCount });
      });
      
      setDeptCounts(countsMap);
      
    } catch (err: any) {
      setError(err.message || "Failed to load departments.");
    } finally {
      setLoading(false);
      setLoadingCounts(false);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptForm.name || !newDeptForm.code || !newDeptForm.hodFullName || !newDeptForm.hodEmail || !newDeptForm.hodPassword) {
      toast.error("Please fill in all fields.");
      return;
    }
    setCreatingDept(true);
    try {
      await createAdminDepartment({
        setup: {
          name: newDeptForm.name,
          code: newDeptForm.code,
          hod: {
            fullName: newDeptForm.hodFullName,
            email: newDeptForm.hodEmail
          }
        },
        hodPassword: newDeptForm.hodPassword
      });
      toast.success("Department and HOD created successfully");
      setShowNewDeptPanel(false);
      setNewDeptForm({ name: "", code: "", hodFullName: "", hodEmail: "", hodPassword: "" });
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.message || "Failed to create department");
    } finally {
      setCreatingDept(false);
    }
  };

  const [backfilling, setBackfilling] = useState(false);

  const handleBackfillTestDepartments = async () => {
    setBackfilling(true);
    try {
      const result = await backfillTestDepartments();
      if (result.provisioned.length > 0) {
        toast.success(`Provisioned ${result.provisioned.length} test department${result.provisioned.length === 1 ? '' : 's'}`);
      } else if (result.failed.length === 0) {
        toast.success("All departments already have a test department");
      }
      
      if (result.failed.length > 0) {
        toast.error(`Failed to provision ${result.failed.length} test department${result.failed.length === 1 ? '' : 's'}`);
      }
      
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.message || "Failed to provision test departments");
    } finally {
      setBackfilling(false);
    }
  };

  const stats = useMemo(() => {
    let deptsWithNoHod = 0;
    let totalFaculty = 0;
    let totalResidents = 0;
    let totalPending = 0;
    let hasFailedCounts = false;

    departments.forEach(d => {
      if (!d.hod || !d.hod.id) deptsWithNoHod++;
      if (failedDepts.has(d.id)) {
        hasFailedCounts = true;
      } else if (deptCounts.has(d.id)) {
         const c = deptCounts.get(d.id)!;
         totalFaculty += c.facultyCount;
         totalResidents += c.residentCount;
         totalPending += c.pendingCount;
      }
    });

    return {
      deptsTotal: departments.length,
      deptsWithNoHod,
      totalFaculty,
      totalResidents,
      totalPending,
      hasFailedCounts
    };
  }, [departments, deptCounts, failedDepts]);

  if (loading && departments.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-4 text-center" role="alert">
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <Button onClick={fetchDepartments} variant="outline">Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8 font-sans">
      {/* Topbar */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white font-bold font-display shadow-sm">
            EL
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-none">E-Logbook</h2>
            <p className="text-sm font-medium text-slate-500">Admin console</p>
          </div>
        </div>
        <div className="flex gap-2">
          {onSignOut && (
            <Button variant="outline" onClick={onSignOut} className="border-slate-200 text-slate-700">
              Sign out
            </Button>
          )}
          <Button variant="outline" onClick={handleBackfillTestDepartments} disabled={backfilling} className="border-slate-200 text-slate-700">
            {backfilling ? "Provisioning..." : "Provision test departments"}
          </Button>
          <Button onClick={() => setShowNewDeptPanel(!showNewDeptPanel)} className="bg-teal-600 hover:bg-teal-700">
            <Plus className="mr-2 h-4 w-4" /> New department
          </Button>
        </div>
      </div>

      {/* Hero */}
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-teal-600">College administration</p>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Departments, faculty and HODs, college-wide</h1>
        <p className="text-sm text-slate-500 max-w-2xl">
          Create and manage departments, appoint HODs, and provision faculty accounts. Students and faculty added through this console bypass the payment gate and are immediately approved.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400"/> Departments</p>
                <p className="text-2xl font-bold text-slate-900">{stats.deptsTotal}</p>
              </div>
            </div>
            <div className="mt-2">
              {stats.deptsWithNoHod > 0 ? (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  {stats.deptsWithNoHod} without a HOD
                </span>
              ) : (
                <span className="text-xs text-slate-500 font-medium">All departments staffed</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><Users className="h-4 w-4 text-slate-400"/> Faculty</p>
              <p className="text-2xl font-bold text-slate-900">
                {loadingCounts ? "—" : (
                  stats.hasFailedCounts ? (
                    <span title="Partial data: Couldn't load counts for some departments">{stats.totalFaculty}*</span>
                  ) : stats.totalFaculty
                )}
              </p>
            </div>
            <div className="mt-2 text-xs text-slate-500 font-medium">
              {stats.hasFailedCounts ? <span className="text-amber-600 font-semibold">*Partial data</span> : `Across ${stats.deptsTotal} departments`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><GraduationCap className="h-4 w-4 text-slate-400"/> Residents</p>
              <p className="text-2xl font-bold text-slate-900">
                {loadingCounts ? "—" : (
                  stats.hasFailedCounts ? (
                    <span title="Partial data: Couldn't load counts for some departments">{stats.totalResidents}*</span>
                  ) : stats.totalResidents
                )}
              </p>
            </div>
            <div className="mt-2 text-xs text-slate-500 font-medium">
              {stats.hasFailedCounts ? <span className="text-amber-600 font-semibold">*Partial data</span> : "Enrolled college-wide"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><UserCheck className="h-4 w-4 text-slate-400"/> Awaiting HOD approval</p>
              <p className="text-2xl font-bold text-slate-900">
                {loadingCounts ? "—" : (
                  stats.hasFailedCounts ? (
                    <span title="Partial data: Couldn't load counts for some departments">{stats.totalPending}*</span>
                  ) : stats.totalPending
                )}
              </p>
            </div>
            <div className="mt-2">
              {stats.hasFailedCounts ? (
                 <span className="text-xs text-amber-600 font-semibold">*Partial data</span>
              ) : stats.totalPending > 0 ? (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Action required by HODs
                </span>
              ) : (
                <span className="text-xs text-slate-500 font-medium">Handled by each department's HOD</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* New department panel */}
      {showNewDeptPanel && (
        <Card className="border-teal-200 bg-teal-50/30 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-teal-900">New Department</CardTitle>
            <CardDescription>Provision a new department and its initial HOD account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateDepartment} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dept-name">Department Name</Label>
                  <Input id="dept-name" placeholder="e.g. Pediatrics" value={newDeptForm.name} onChange={e => setNewDeptForm({...newDeptForm, name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dept-code">Department Code</Label>
                  <Input id="dept-code" placeholder="e.g. PED" value={newDeptForm.code} onChange={e => setNewDeptForm({...newDeptForm, code: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hod-name">HOD Full Name</Label>
                  <Input id="hod-name" placeholder="e.g. Dr. Sarah Smith" value={newDeptForm.hodFullName} onChange={e => setNewDeptForm({...newDeptForm, hodFullName: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hod-email">HOD Email</Label>
                  <Input id="hod-email" type="email" placeholder="sarah.smith@example.com" value={newDeptForm.hodEmail} onChange={e => setNewDeptForm({...newDeptForm, hodEmail: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hod-password">HOD Initial Password</Label>
                  <Input id="hod-password" type="password" placeholder="At least 8 characters" value={newDeptForm.hodPassword} onChange={e => setNewDeptForm({...newDeptForm, hodPassword: e.target.value})} required minLength={8} maxLength={72} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowNewDeptPanel(false)}>Cancel</Button>
                <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={creatingDept}>
                  {creatingDept ? "Creating..." : "Create department + HOD"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-4 lg:gap-6 items-start">
        {/* Left column: Department list */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 px-1">Departments</h3>
          <div className="flex flex-col gap-1.5">
            {departments.map(dept => (
              <button 
                key={dept.id} 
                onClick={() => setSelectedDeptId(dept.id)}
                className={`text-left p-3 rounded-xl border transition-all ${selectedDeptId === dept.id ? 'border-teal-500 ring-1 ring-teal-500 bg-teal-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-teal-200 hover:shadow-sm'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="text-sm font-semibold text-slate-900 leading-tight">{dept.name}</div>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono text-slate-500 tracking-wider bg-slate-50">{dept.code}</Badge>
                </div>
                
                <div className="text-xs mb-1.5">
                  {dept.hod?.id ? (
                    <span className="text-slate-600 font-medium">HOD: {dept.hod.fullName}</span>
                  ) : (
                    <span className="text-rose-600 font-medium flex items-center gap-1"><XCircle className="h-3 w-3" /> No HOD appointed</span>
                  )}
                </div>
                
                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                  {failedDepts.has(dept.id) ? (
                    <span className="text-amber-600 flex items-center gap-1" title="Couldn't load this department's counts">
                      <span className="font-bold">—</span> Data unavailable
                    </span>
                  ) : (
                    <>
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-slate-400" /> {loadingCounts ? "—" : (deptCounts.get(dept.id)?.facultyCount || 0)}</span>
                      <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5 text-slate-400" /> {loadingCounts ? "—" : (deptCounts.get(dept.id)?.residentCount || 0)}</span>
                    </>
                  )}
                </div>
              </button>
            ))}
            {departments.length === 0 && (
              <div className="text-sm text-slate-500 text-center p-8 border border-dashed rounded-xl">
                No departments found.
              </div>
            )}
          </div>
        </div>

        {/* Right column: Department Detail */}
        <div className="min-w-0">
          {selectedDeptId && departments.find(d => d.id === selectedDeptId) ? (
            <DepartmentDetail 
              department={departments.find(d => d.id === selectedDeptId)!} 
              onRefresh={fetchDepartments}
            />
          ) : (
            <div className="h-full min-h-[400px] flex items-center justify-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <p className="text-sm text-slate-500">Select a department to view details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DepartmentDetail({ department, onRefresh }: { department: AdminDepartment, onRefresh: () => void }) {
  const [roster, setRoster] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mirrorRoster, setMirrorRoster] = useState<AdminUserRow[]>([]);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [mirrorError, setMirrorError] = useState<string | null>(null);

  const [showReplaceHod, setShowReplaceHod] = useState(false);
  const [replaceHodEmail, setReplaceHodEmail] = useState("");
  const [replacingHod, setReplacingHod] = useState(false);
  const [replaceHodError, setReplaceHodError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormType, setAddFormType] = useState<"faculty" | "resident">("faculty");
  const [addForm, setAddForm] = useState(() => generateDefaultResidentForm());
  const [addingUser, setAddingUser] = useState(false);
  
  const [activeTab, setActiveTab] = useState("faculty");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoster();
    fetchMirrorRoster();
    setShowReplaceHod(false);
    setReplaceHodError(null);
    setShowAddForm(false);
    setShowDeleteConfirm(false);
    setDeleteError(null);
  }, [department.id, department.mirrorDepartmentId]);

  const fetchRoster = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminDepartmentRoster(department.id);
      setRoster(data);
    } catch (err: any) {
      setError(err.message || "Failed to load roster");
    } finally {
      setLoading(false);
    }
  };

  const fetchMirrorRoster = async () => {
    if (!department.mirrorDepartmentId) {
      setMirrorRoster([]);
      return;
    }
    setMirrorLoading(true);
    setMirrorError(null);
    try {
      const data = await getAdminDepartmentRoster(department.mirrorDepartmentId);
      setMirrorRoster(data);
    } catch (err: any) {
      setMirrorError(err.message || "Failed to load test accounts");
    } finally {
      setMirrorLoading(false);
    }
  };

  const handleReplaceHod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceHodEmail) return;

    const incomingFaculty = roster.find(u => u.email.toLowerCase() === replaceHodEmail.toLowerCase() && u.role === "professor" && u.status === "approved");
    
    if (!incomingFaculty) {
      setReplaceHodError("No approved faculty in this department matches that email");
      return;
    }

    setReplacingHod(true);
    setReplaceHodError(null);
    try {
      await replaceAdminHod(department.id, incomingFaculty.id);
      toast.success("HOD replaced successfully");
      setShowReplaceHod(false);
      setReplaceHodEmail("");
      onRefresh(); // Refresh parent to get updated HOD info
      fetchRoster();
    } catch (err: any) {
      setReplaceHodError(err.message || "Failed to replace HOD");
      toast.error(err.message || "Failed to replace HOD");
    } finally {
      setReplacingHod(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.fullName || !addForm.email || !addForm.password) return;
    
    if (addFormType === "resident") {
      if (!addForm.registrationNumber || !addForm.batch || !addForm.dateOfJoining || !addForm.kuhsId) {
        toast.error("Please fill in all resident fields.");
        return;
      }
    }
    
    setAddingUser(true);
    try {
      if (addFormType === "faculty") {
        await createAdminFaculty(department.id, {
          fullName: addForm.fullName,
          email: addForm.email,
          password: addForm.password
        });
        toast.success("Faculty account created");
      } else {
        await createAdminStudent(department.id, {
          fullName: addForm.fullName,
          email: addForm.email,
          password: addForm.password,
          registrationNumber: addForm.registrationNumber,
          batch: addForm.batch,
          dateOfJoining: addForm.dateOfJoining,
          kuhsId: addForm.kuhsId
        });
        toast.success("Resident account created and approved");
      }
      setAddForm(generateDefaultResidentForm());
      setShowAddForm(false);
      onRefresh(); // Refresh counts
      fetchRoster();
    } catch (err: any) {
      toast.error(err.message || `Failed to create ${addFormType} account`);
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeactivate = async (userId: number, role: string) => {
    if (!window.confirm("Are you sure you want to deactivate this account?")) return;
    try {
      await deactivateAdminUser(userId);
      toast.success("User deactivated");
      onRefresh();
      fetchRoster();
    } catch (err: any) {
      toast.error(err.message || "Failed to deactivate user");
    }
  };

  const handleDeleteDepartment = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAdminDepartment(department.id);
      toast.success(`Department "${department.name}" deleted`);
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete department");
    } finally {
      setDeleting(false);
    }
  };

  const handleImpersonate = async (userId: number) => {
    try {
      const result = await impersonateAdminUser(userId);
      if (result.token) {
        window.open(`/?impersonationToken=${result.token}`, '_blank');
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to log in as user");
    }
  };

  const faculty = roster.filter(u => u.role === "professor" || u.role === "hod");
  const residents = roster.filter(u => u.role === "student");

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-4">
      {/* HOD Strip */}
      <Card className="overflow-hidden border-slate-200">
        <div className="bg-slate-50/80 p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
              <AvatarFallback className={department.hod?.id ? "bg-teal-100 text-teal-800 font-bold" : "bg-slate-100 text-slate-400 font-bold"}>
                {department.hod?.fullName ? getInitials(department.hod.fullName) : "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              {department.hod?.id ? (
                <>
                  <h3 className="font-semibold text-base text-slate-900 leading-tight">{department.hod.fullName}</h3>
                  <p className="text-sm text-slate-500 font-medium">HOD, {department.name} • {department.hod.email}</p>
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-base text-rose-700 leading-tight">No HOD appointed</h3>
                  <p className="text-sm text-slate-500 font-medium">Department of {department.name}</p>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => setShowReplaceHod(!showReplaceHod)} className="bg-white shadow-sm">
              {department.hod?.id ? "Replace HOD" : "Appoint HOD"}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setShowDeleteConfirm(!showDeleteConfirm); setDeleteError(null); }}
              className="text-rose-700 border-rose-200 hover:bg-rose-50 shadow-sm"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        </div>
        
        {/* Replace HOD inline panel */}
        {showReplaceHod && (
          <div className="bg-white p-3 sm:p-4 border-t border-slate-100">
            <form onSubmit={handleReplaceHod} className="space-y-4">
              <p className="text-sm font-medium text-slate-700">
                {department.hod?.id ? "Promote an existing faculty member to Head of Department." : "Promote an existing faculty member to Head of Department."}
              </p>
              
              {replaceHodError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-sm text-rose-700">
                  {replaceHodError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="space-y-2 flex-1 w-full">
                  <Label htmlFor="promote-email">Existing faculty email to promote</Label>
                  <Input id="promote-email" type="email" placeholder="faculty@example.com" value={replaceHodEmail} onChange={e => setReplaceHodEmail(e.target.value)} required />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button type="button" variant="outline" onClick={() => { setShowReplaceHod(false); setReplaceHodError(null); }} className="flex-1 sm:flex-none">Cancel</Button>
                  <Button type="submit" disabled={replacingHod} className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white">
                    {replacingHod ? "Confirming..." : "Confirm swap"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </Card>

      {/* Delete Department confirmation panel */}
      {showDeleteConfirm && (
        <Card className="border-rose-200 bg-rose-50/30 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <AlertTriangle className="h-4 w-4 text-rose-700" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h4 className="font-semibold text-rose-900">Delete {department.name}?</h4>
                  <p className="text-sm text-rose-800 mt-1 leading-relaxed">
                    This will <strong>permanently delete</strong> the department and <strong>all</strong> of its:
                  </p>
                  <ul className="text-sm text-rose-800 mt-1 ml-4 list-disc space-y-0.5">
                    <li>Faculty accounts (professors)</li>
                    <li>Resident accounts (students)</li>
                    <li>Head of Department (HOD) account</li>
                    <li>Department configuration, procedure types, training options, and assignment types</li>
                  </ul>
                  <p className="text-sm text-rose-800 mt-2 leading-relaxed">
                    If any faculty or resident has clinical logs, assessments, or other records that reference them, the delete will be <strong>refused</strong> by the database. This is not an error — remove or reassign those records first.
                  </p>
                </div>

                {deleteError && (
                  <div className="p-3 bg-rose-100 border border-rose-300 rounded-md text-sm text-rose-900 font-medium">
                    {deleteError}
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteDepartment}
                    disabled={deleting}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {deleting ? "Deleting..." : `Yes, delete ${department.name}`}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error ? (
        <div className="flex h-40 flex-col items-center justify-center space-y-4 text-center rounded-xl border border-rose-100 bg-rose-50" role="alert">
          <p className="text-sm font-medium text-rose-700">{error}</p>
          <Button onClick={fetchRoster} variant="outline" size="sm">Try again</Button>
        </div>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center border border-slate-100 rounded-xl bg-white"><div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="border-b border-slate-100 px-3 pt-3 flex justify-between items-center bg-slate-50/50">
              <TabsList className="bg-slate-200/50">
                <TabsTrigger value="faculty" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  Faculty ({faculty.length})
                </TabsTrigger>
                <TabsTrigger value="residents" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  Residents ({residents.length})
                </TabsTrigger>
                <TabsTrigger value="test-accounts" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  Test accounts
                </TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(!showAddForm); setAddFormType(activeTab as any); }} className="text-teal-700 hover:text-teal-800 hover:bg-teal-50">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {showAddForm && (
              <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-100">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-teal-600" />
                  Add {addFormType === "faculty" ? "faculty" : "resident"} to {department.name}
                </h4>
                <form onSubmit={handleAddUser} className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="space-y-2 flex-1 w-full">
                      <Label>Full name</Label>
                      <Input placeholder="John Doe" value={addForm.fullName} onChange={e => setAddForm({...addForm, fullName: e.target.value})} required />
                    </div>
                    <div className="space-y-2 flex-1 w-full">
                      <Label>Email</Label>
                      <Input type="email" placeholder="john@example.com" value={addForm.email} onChange={e => setAddForm({...addForm, email: e.target.value})} required />
                    </div>
                    <div className="space-y-2 flex-1 w-full">
                      <Label>Password</Label>
                      <Input type="password" placeholder="At least 8 characters" value={addForm.password} onChange={e => setAddForm({...addForm, password: e.target.value})} required minLength={8} maxLength={72} />
                    </div>
                  </div>
                  {addFormType === "resident" && (
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                      <div className="space-y-2 flex-1 w-full">
                        <Label>Registration Number</Label>
                        <Input placeholder="Reg No." value={addForm.registrationNumber} onChange={e => setAddForm({...addForm, registrationNumber: e.target.value})} required />
                      </div>
                      <div className="space-y-2 flex-1 w-full">
                        <Label>Batch</Label>
                        <Input placeholder="e.g. 2023" value={addForm.batch} onChange={e => setAddForm({...addForm, batch: e.target.value})} required />
                      </div>
                      <div className="space-y-2 flex-1 w-full">
                        <Label>Date of Joining</Label>
                        <Input type="date" value={addForm.dateOfJoining} onChange={e => setAddForm({...addForm, dateOfJoining: e.target.value})} required />
                      </div>
                      <div className="space-y-2 flex-1 w-full">
                        <Label>KUHS ID</Label>
                        <Input placeholder="KUHS ID" value={addForm.kuhsId} onChange={e => setAddForm({...addForm, kuhsId: e.target.value})} required />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 justify-end mt-2">
                    <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                    <Button type="submit" disabled={addingUser} className="bg-teal-600 hover:bg-teal-700">{addingUser ? "Creating..." : "Create account"}</Button>
                  </div>
                </form>
              </div>
            )}

            <TabsContent value="faculty" className="m-0 border-none outline-none">
              {!faculty.length ? (
                <p className="p-8 text-center text-sm text-slate-500">No faculty in this department.</p>
              ) : (
                <Table>
                  <TableHeader className="bg-white">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {faculty.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-semibold text-slate-900">{u.fullName}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{u.email}</TableCell>
                        <TableCell>
                          {u.role === "hod" ? (
                            <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100 border-none shadow-none rounded-full">HOD</Badge>
                          ) : (
                            <Badge variant={u.status === "approved" ? "default" : "secondary"} className={`rounded-full ${u.status === 'approved' ? 'bg-slate-900' : ''}`}>
                              {u.status === "rejected" ? "Deactivated" : u.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {u.role === "hod" ? (
                              <span className="text-xs text-slate-400 font-medium self-center">Use 'Replace HOD' above</span>
                            ) : u.status === "rejected" ? (
                              <span className="text-xs text-slate-400 font-medium self-center">Deactivated</span>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => handleDeactivate(u.id, u.role)} className="text-rose-700 border-rose-200 hover:bg-rose-50 h-8 px-3">
                                Deactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="residents" className="m-0 border-none outline-none">
              <div className="bg-blue-50/50 border-b border-blue-100 p-3 sm:px-6 flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800 leading-relaxed">
                  <strong>Approval stays with the HOD.</strong> A resident added here appears in {department.name}'s own pending queue — this console never approves a resident directly.
                </p>
              </div>

              {!residents.length ? (
                <p className="p-8 text-center text-sm text-slate-500">No residents in this department.</p>
              ) : (
                <Table>
                  <TableHeader className="bg-white">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {residents.map(u => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-semibold text-slate-900">{u.fullName}</div>
                          {u.status === "pending" && (
                            <div className="text-xs text-amber-600 mt-0.5">Awaiting the {department.name} HOD's approval</div>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={u.status === "approved" ? "default" : "secondary"} className={`rounded-full ${u.status === 'approved' ? 'bg-slate-900' : u.status === 'pending' ? 'bg-amber-100 text-amber-800 border-none' : ''}`}>
                            {u.status === "rejected" ? "Deactivated" : u.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {u.status === "rejected" ? (
                              <span className="text-xs text-slate-400 font-medium self-center">Deactivated</span>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => handleDeactivate(u.id, u.role)} className="text-rose-700 border-rose-200 hover:bg-rose-50 h-8 px-3">
                                Deactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="test-accounts" className="m-0 border-none outline-none">
              {!department.mirrorDepartmentId ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  No test department has been provisioned for {department.name} yet. Use "Provision test departments" above to create one.
                </p>
              ) : mirrorLoading ? (
                <div className="flex h-40 items-center justify-center bg-white"><div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" /></div>
              ) : mirrorError ? (
                <div className="flex h-40 flex-col items-center justify-center space-y-4 text-center rounded-xl border border-rose-100 bg-rose-50" role="alert">
                  <p className="text-sm font-medium text-rose-700">{mirrorError}</p>
                  <Button onClick={fetchMirrorRoster} variant="outline" size="sm">Try again</Button>
                </div>
              ) : !mirrorRoster.length ? (
                <p className="p-8 text-center text-sm text-slate-500">No test accounts in this department.</p>
              ) : (
                <Table>
                  <TableHeader className="bg-white">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mirrorRoster.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-semibold text-slate-900">{u.fullName}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{u.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.status === "approved" ? "default" : "secondary"} className={`rounded-full ${u.status === 'approved' ? 'bg-slate-900' : ''}`}>
                            {u.status === "rejected" ? "Deactivated" : u.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {u.status === "approved" && (
                              <Button size="sm" variant="outline" onClick={() => handleImpersonate(u.id)} className="h-8 px-3">
                                Log in as
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

// Ensure lucide icon UserPlus is imported at the top
