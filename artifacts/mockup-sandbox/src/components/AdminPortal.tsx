import { MaintenanceAnnouncements } from './MaintenanceAnnouncements';
import { SupportTicketsAdmin } from './SupportTicketsAdmin';
import { SUPPORT_FEATURE_ENABLED } from './SupportWidget';
import { Link } from "wouter";
import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Building2, Users, UserCheck, UserX, Plus, GraduationCap, ArrowRight, XCircle, ChevronDown, ChevronRight, Info, UserPlus, Trash2, AlertTriangle, Pencil, LifeBuoy } from "lucide-react";
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
  getAdminColleges,
  getAdminConfigurationSources,
  createAdminCollege,
  deleteAdminCollege,
  updateAdminCollege,
  createAdminDepartment, 
  getAdminDepartmentRoster, 
  replaceAdminHod, 
  createAdminFaculty, 
  createAdminStudent, 
  deleteAdminDepartment,
  impersonateAdminUser,
  backfillTestDepartments,
  restoreTestFaculty,
  resetTestCredentials,
  deactivateAdminUser,
  reactivateAdminUser,
  hardDeleteAdminUser,
  updateAdminDepartmentUserName,
  getAdminOpenSupportTicketsCount,
  type AdminDepartment,
  type AdminCollege,
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
  const [colleges, setColleges] = useState<AdminCollege[]>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState<number | null>(null);
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [copySourceDepartments, setCopySourceDepartments] = useState<Array<{ id: number; name: string; code: string; collegeId: number; collegeName: string }>>([]);
  const [loadingCopySources, setLoadingCopySources] = useState(false);
  const [copySourceError, setCopySourceError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [showNewDeptPanel, setShowNewDeptPanel] = useState(false);
  const [showNewCollegePanel, setShowNewCollegePanel] = useState(false);
  const [newCollegeForm, setNewCollegeForm] = useState({ name: "", acceptingRegistrations: false });
  const [collegeSettings, setCollegeSettings] = useState({ name: "", acceptingRegistrations: false });
  const [savingCollegeSettings, setSavingCollegeSettings] = useState(false);
  const [deletingCollege, setDeletingCollege] = useState(false);

  const [deptCounts, setDeptCounts] = useState<Map<number, { facultyCount: number, residentCount: number, pendingCount: number }>>(new Map());
  const [failedDepts, setFailedDepts] = useState<Set<number>>(new Set());
  const [loadingCounts, setLoadingCounts] = useState(true);
  const departmentLoadVersion = useRef(0);
  const adminMountedRef = useRef(true);
  const activeCollegeIdRef = useRef<number | null>(selectedCollegeId);
  activeCollegeIdRef.current = selectedCollegeId;

  // New department form state
  const [newDeptForm, setNewDeptForm] = useState({ name: "", code: "", hodFullName: "", hodEmail: "", copyFromDepartmentId: "" });
  const [creatingDept, setCreatingDept] = useState(false);

  const [adminTab, setAdminTab] = useState<"departments" | "support">("departments");
  const [openTicketCount, setOpenTicketCount] = useState<number>(0);

  useEffect(() => {
    adminMountedRef.current = true;
    return () => {
      adminMountedRef.current = false;
      departmentLoadVersion.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!SUPPORT_FEATURE_ENABLED) return;
    getAdminOpenSupportTicketsCount()
      .then((res) => setOpenTicketCount(res.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    getAdminColleges().then((data) => {
      if (!active) return;
      setColleges(data);
      if (data.length) {
        sessionStorage.setItem("admin.selectedCollegeId", String(data[0].id));
        setSelectedCollegeId(data[0].id);
      }
      else setLoading(false);
    }).catch((err: any) => {
      if (!active) return;
      setError(err.message || "Failed to load colleges.");
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedCollegeId !== null) void fetchDepartments(selectedCollegeId);
  }, [selectedCollegeId]);

  useEffect(() => {
    const college = colleges.find((item) => item.id === selectedCollegeId);
    if (college) setCollegeSettings({ name: college.name, acceptingRegistrations: college.acceptingRegistrations });
  }, [colleges, selectedCollegeId]);

  useEffect(() => {
    if (!showNewDeptPanel || !colleges.length) return;
    let current = true;
    setLoadingCopySources(true);
    setCopySourceError("");
    setCopySourceDepartments([]);
    getAdminConfigurationSources()
      .then((sources) => { if (current) setCopySourceDepartments(sources); })
      .catch((err: any) => { if (current) setCopySourceError(err.message || "Could not load settings sources"); })
      .finally(() => { if (current) setLoadingCopySources(false); });
    return () => { current = false; };
  }, [colleges, showNewDeptPanel]);

  const fetchDepartments = async (collegeId: number | null = selectedCollegeId) => {
    if (collegeId === null || !adminMountedRef.current || activeCollegeIdRef.current !== collegeId) return;
    const loadVersion = ++departmentLoadVersion.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminDepartments(collegeId);
      if (loadVersion !== departmentLoadVersion.current || !adminMountedRef.current || activeCollegeIdRef.current !== collegeId) return;
      setDepartments(data);
      setSelectedDeptId((currentSelected) => {
        if (data.length > 0 && !currentSelected) {
          return data[0].id;
        }
        if (currentSelected && !data.find((d: any) => d.id === currentSelected)) {
          return null;
        }
        return currentSelected;
      });
      
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
      if (loadVersion !== departmentLoadVersion.current || !adminMountedRef.current || activeCollegeIdRef.current !== collegeId) return;
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
      if (loadVersion === departmentLoadVersion.current && adminMountedRef.current && activeCollegeIdRef.current === collegeId) {
        setError(err.message || "Failed to load departments.");
      }
    } finally {
      if (loadVersion === departmentLoadVersion.current && adminMountedRef.current && activeCollegeIdRef.current === collegeId) {
        setLoading(false);
        setLoadingCounts(false);
      }
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptForm.name || !newDeptForm.code || !newDeptForm.hodFullName || !newDeptForm.hodEmail) {
      toast.error("Please fill in all fields.");
      return;
    }
    const targetCollegeId = selectedCollegeId;
    setCreatingDept(true);
    try {
      if (targetCollegeId === null) throw new Error("Select a college first");
      const result = await createAdminDepartment({
        setup: {
          collegeId: targetCollegeId,
          ...(newDeptForm.copyFromDepartmentId ? { copyFromDepartmentId: Number(newDeptForm.copyFromDepartmentId) } : {}),
          name: newDeptForm.name,
          code: newDeptForm.code,
          hod: {
            fullName: newDeptForm.hodFullName,
            email: newDeptForm.hodEmail
          }
        }
      });
      toast.success("Department and HOD created successfully");
      if (!result.emailAccepted) toast.warning("The HOD account was created, but the onboarding email could not be accepted by the email provider. Ask the HOD to use Forgot password if needed.");
      if (adminMountedRef.current && activeCollegeIdRef.current === targetCollegeId) {
        setShowNewDeptPanel(false);
        setNewDeptForm({ name: "", code: "", hodFullName: "", hodEmail: "", copyFromDepartmentId: "" });
        void fetchDepartments(targetCollegeId);
      }
    } catch (err: any) {
      if (adminMountedRef.current) toast.error(err.message || "Failed to create department");
    } finally {
      if (adminMountedRef.current) setCreatingDept(false);
    }
  };

  const [backfilling, setBackfilling] = useState(false);

  const handleCreateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const college = await createAdminCollege(newCollegeForm);
      setColleges((current) => [...current, college]);
      setShowNewCollegePanel(false);
      setNewCollegeForm({ name: "", acceptingRegistrations: false });
      sessionStorage.setItem("admin.selectedCollegeId", String(college.id));
      setLoading(true);
      setSelectedCollegeId(college.id);
      toast.success("College created. Add its first department to continue.");
    } catch (err: any) {
      toast.error(err.message || "Failed to create college");
    }
  };

  const handleDeleteCollege = async () => {
    const college = colleges.find((item) => item.id === selectedCollegeId);
    if (!college || selectedCollegeId === null || loading || departments.length > 0) return;
    if (!window.confirm(`Delete ${college.name}? This cannot be undone.`)) return;

    setDeletingCollege(true);
    try {
      await deleteAdminCollege(college.id);
      const remaining = colleges.filter((item) => item.id !== college.id);
      const nextCollege = remaining[0] ?? null;
      departmentLoadVersion.current++;
      setColleges(remaining);
      setDepartments([]);
      setSelectedDeptId(null);
      setDeptCounts(new Map());
      setFailedDepts(new Set());
      setShowNewDeptPanel(false);
      setSelectedCollegeId(nextCollege?.id ?? null);
      if (nextCollege) {
        sessionStorage.setItem("admin.selectedCollegeId", String(nextCollege.id));
        setLoading(true);
      } else {
        sessionStorage.removeItem("admin.selectedCollegeId");
        setLoading(false);
        setLoadingCounts(false);
      }
      toast.success("College deleted");
    } catch (err: any) {
      toast.error(err.message || "Could not delete college");
    } finally {
      setDeletingCollege(false);
    }
  };

  const handleUpdateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCollegeId === null) return;
    setSavingCollegeSettings(true);
    try {
      const updated = await updateAdminCollege(selectedCollegeId, collegeSettings);
      setColleges((current) => current.map((college) => college.id === updated.id ? updated : college));
      toast.success("College settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save college settings");
    } finally {
      setSavingCollegeSettings(false);
    }
  };

  const handleBackfillTestDepartments = async () => {
    const targetCollegeId = selectedCollegeId;
    if (targetCollegeId === null) return;
    setBackfilling(true);
    try {
      const result = await backfillTestDepartments(targetCollegeId);
      if (!adminMountedRef.current) return;
      if (result.provisioned.length > 0) {
        toast.success(`Provisioned ${result.provisioned.length} test department${result.provisioned.length === 1 ? '' : 's'}`);
      } else if (result.failed.length === 0) {
        toast.success("All departments already have a test department");
      }
      
      if (result.failed.length > 0) {
        toast.error(`Failed to provision ${result.failed.length} test department${result.failed.length === 1 ? '' : 's'}`);
      }
      
      if (activeCollegeIdRef.current === targetCollegeId) {
        void fetchDepartments(targetCollegeId);
      }
    } catch (err: any) {
      if (adminMountedRef.current) toast.error(err.message || "Failed to provision test departments");
    } finally {
      if (adminMountedRef.current) setBackfilling(false);
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
        <div className="animate-spin rounded-full border-4 border-line-soft border-t-forest h-8 w-8"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-4 text-center" role="alert">
        <p className="text-sm font-medium text-status-foreground">{error}</p>
        <Button onClick={() => void fetchDepartments()} variant="outline">Try again</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-4 px-4 pb-8 pt-3 font-sans md:p-6 lg:p-8">
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest text-white font-bold font-display shadow-sm">
            EL
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink leading-none">E-Logbook</h2>
            <p className="text-sm font-medium text-helper">Admin console</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            College
            <select aria-label="Select college" className="h-9 rounded-md border border-input bg-white px-3" value={selectedCollegeId ?? ""}
              onChange={(event) => { const id = Number(event.target.value); departmentLoadVersion.current++; sessionStorage.setItem("admin.selectedCollegeId", String(id)); setShowNewDeptPanel(false); setDepartments([]); setSelectedDeptId(null); setDeptCounts(new Map()); setFailedDepts(new Set()); setSelectedCollegeId(id); }}>
              {colleges.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}
            </select>
          </label>
          <Button variant="outline" onClick={() => setShowNewCollegePanel((value) => !value)}>New college</Button>
          <Button asChild variant="outline" className="text-ink"><Link href="/profile">My Profile</Link></Button>
          {onSignOut && (
            <Button variant="outline" onClick={onSignOut} className="text-ink">
              Sign out
            </Button>
          )}
          <Button variant="outline" onClick={handleBackfillTestDepartments} disabled={backfilling} className="text-ink">
            {backfilling ? "Provisioning..." : "Provision test departments"}
          </Button>
          <Button onClick={() => setShowNewDeptPanel(!showNewDeptPanel)} className="bg-forest hover:bg-deep">
            <Plus className="mr-2 h-4 w-4" /> New department
          </Button>
        </div>
      </div>

      {/* Admin Top-Level Navigation */}
      <Tabs value={adminTab} onValueChange={(val) => setAdminTab(val as "departments" | "support")}>
        {SUPPORT_FEATURE_ENABLED && (
          <TabsList className="bg-sage p-1">
            <TabsTrigger value="departments" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Building2 className="mr-2 h-4 w-4" />
              Departments & Roster
            </TabsTrigger>
            <TabsTrigger value="support" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <LifeBuoy className="mr-2 h-4 w-4 text-forest" />
              Support
              {openTicketCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white leading-none">
                  {openTicketCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="departments" className={SUPPORT_FEATURE_ENABLED ? "space-y-4 mt-3" : "space-y-4"}>
          {/* Hero */}
          <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-forest">College administration</p>
        <h1 className="text-xl font-bold text-ink tracking-tight">Departments, faculty and HODs, college-wide</h1>
        <p className="text-sm text-helper max-w-2xl">
          Create and manage departments, appoint HODs, and provision faculty accounts. Students added through this console bypass the payment gate and are immediately approved; faculty accounts are created pre-approved.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-sm font-medium text-helper flex items-center gap-2"><Building2 className="h-4 w-4 text-helper"/> Departments</p>
                <p className="text-2xl font-bold text-ink">{stats.deptsTotal}</p>
              </div>
            </div>
            <div className="mt-2">
              {stats.deptsWithNoHod > 0 ? (
                <span className="inline-flex items-center rounded-full bg-status px-2 py-1 text-xs font-medium text-status-foreground ring-1 ring-inset ring-ring">
                  {stats.deptsWithNoHod} without a HOD
                </span>
              ) : (
                <span className="text-xs text-helper font-medium">All departments staffed</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-helper flex items-center gap-2"><Users className="h-4 w-4 text-helper"/> Faculty</p>
              <p className="text-2xl font-bold text-ink">
                {loadingCounts ? "—" : (
                  stats.hasFailedCounts ? (
                    <span title="Partial data: Couldn't load counts for some departments">{stats.totalFaculty}*</span>
                  ) : stats.totalFaculty
                )}
              </p>
            </div>
            <div className="mt-2 text-xs text-helper font-medium">
              {stats.hasFailedCounts ? <span className="text-status-foreground font-semibold">*Partial data</span> : `Across ${stats.deptsTotal} departments`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-helper flex items-center gap-2"><GraduationCap className="h-4 w-4 text-helper"/> Residents</p>
              <p className="text-2xl font-bold text-ink">
                {loadingCounts ? "—" : (
                  stats.hasFailedCounts ? (
                    <span title="Partial data: Couldn't load counts for some departments">{stats.totalResidents}*</span>
                  ) : stats.totalResidents
                )}
              </p>
            </div>
            <div className="mt-2 text-xs text-helper font-medium">
              {stats.hasFailedCounts ? <span className="text-status-foreground font-semibold">*Partial data</span> : "Enrolled college-wide"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-helper flex items-center gap-2"><UserCheck className="h-4 w-4 text-helper"/> Awaiting HOD approval</p>
              <p className="text-2xl font-bold text-ink">
                {loadingCounts ? "—" : (
                  stats.hasFailedCounts ? (
                    <span title="Partial data: Couldn't load counts for some departments">{stats.totalPending}*</span>
                  ) : stats.totalPending
                )}
              </p>
            </div>
            <div className="mt-2">
              {stats.hasFailedCounts ? (
                 <span className="text-xs text-status-foreground font-semibold">*Partial data</span>
              ) : stats.totalPending > 0 ? (
                <span className="inline-flex items-center rounded-full bg-status px-2 py-1 text-xs font-medium text-status-foreground ring-1 ring-inset ring-ring">
                  Action required by HODs
                </span>
              ) : (
                <span className="text-xs text-helper font-medium">Handled by each department's HOD</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <MaintenanceAnnouncements />

      {selectedCollegeId !== null && <Card><CardHeader><CardTitle>College settings</CardTitle><CardDescription>Update the selected college’s name and public registration availability.</CardDescription></CardHeader>
        <CardContent className="space-y-4"><form onSubmit={handleUpdateCollege} className="flex flex-wrap items-end gap-3">
          <div className="space-y-2"><Label htmlFor="selected-college-name">College name</Label><Input id="selected-college-name" value={collegeSettings.name} onChange={(event) => setCollegeSettings({ ...collegeSettings, name: event.target.value })} required /></div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink"><input type="checkbox" checked={collegeSettings.acceptingRegistrations} onChange={(event) => setCollegeSettings({ ...collegeSettings, acceptingRegistrations: event.target.checked })} />Allow public registration</label>
          <Button type="submit" disabled={savingCollegeSettings} variant="outline">{savingCollegeSettings ? "Saving…" : "Save college settings"}</Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
          <div>
            <p className="text-sm font-medium text-ink">Delete college</p>
            {departments.length > 0
              ? <p className="mt-1 flex items-center gap-1.5 text-sm text-status-foreground"><XCircle className="h-4 w-4" />Delete all {departments.length} department{departments.length === 1 ? "" : "s"} first.</p>
              : <p className="mt-1 text-sm text-helper">A college can be deleted only when it has no departments.</p>}
          </div>
          <Button type="button" variant={departments.length > 0 ? "outline" : "destructive"}
            disabled={loading || deletingCollege || departments.length > 0} onClick={() => void handleDeleteCollege()}>
            {departments.length > 0 ? <><XCircle className="h-4 w-4" />Cannot delete yet</> : <><Trash2 className="h-4 w-4" />{deletingCollege ? "Deleting…" : "Delete college"}</>}
          </Button>
        </div>
        </CardContent></Card>}

      {showNewCollegePanel && <Card><CardHeader><CardTitle>New College</CardTitle><CardDescription>Create a college, then add departments under it.</CardDescription></CardHeader>
        <CardContent><form onSubmit={handleCreateCollege} className="flex flex-wrap items-end gap-3">
          <div className="space-y-2"><Label htmlFor="college-name">College name</Label><Input id="college-name" value={newCollegeForm.name} onChange={(event) => setNewCollegeForm({ ...newCollegeForm, name: event.target.value })} required /></div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink"><input type="checkbox" checked={newCollegeForm.acceptingRegistrations} onChange={(event) => setNewCollegeForm({ ...newCollegeForm, acceptingRegistrations: event.target.checked })} />Allow public registration</label>
          <Button type="submit" className="bg-forest hover:bg-deep">Create college</Button>
        </form></CardContent></Card>}

      {/* New department panel */}
      {showNewDeptPanel && (
        <Card className="border-line-soft bg-mist shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-forest">New Department</CardTitle>
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
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="dept-config-source">Copy settings from (optional)</Label>
                  <select id="dept-config-source" className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                    value={newDeptForm.copyFromDepartmentId} onChange={(e) => setNewDeptForm({ ...newDeptForm, copyFromDepartmentId: e.target.value })}>
                    <option value="">Start with default settings</option>
                      {copySourceDepartments.map((department) => <option key={department.id} value={department.id}>
                        {department.collegeName} · {department.name}
                      </option>)}
                  </select>
                    {loadingCopySources && <p role="status" className="text-xs text-helper">Loading settings sources…</p>}
                    {copySourceError && <p role="alert" className="text-xs text-status-foreground">{copySourceError}</p>}
                    <p className="text-xs text-helper">Copies settings, catalogs, schedules and logbook sections from any college. Accounts and records are not copied.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hod-name">HOD Full Name</Label>
                  <Input id="hod-name" placeholder="e.g. Dr. Sarah Smith" value={newDeptForm.hodFullName} onChange={e => setNewDeptForm({...newDeptForm, hodFullName: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hod-email">HOD Email</Label>
                  <Input id="hod-email" type="email" placeholder="sarah.smith@example.com" value={newDeptForm.hodEmail} onChange={e => setNewDeptForm({...newDeptForm, hodEmail: e.target.value})} required />
                </div>
                <p className="text-sm text-soft-ink md:col-span-2">A secure initial password will be generated and emailed to the HOD. They can change it after signing in.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowNewDeptPanel(false)}>Cancel</Button>
                <Button type="submit" className="bg-forest hover:bg-deep" disabled={creatingDept}>
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
          <h3 className="text-sm font-semibold text-ink px-1">Departments</h3>
          <div className="flex flex-col gap-1.5">
            {departments.map(dept => (
              <button 
                key={dept.id} 
                onClick={() => setSelectedDeptId(dept.id)}
                className={`text-left p-3 rounded-xl border transition-all ${selectedDeptId === dept.id ? 'border-forest ring-1 ring-ring bg-mist shadow-sm' : 'border-line-soft bg-white hover:border-line-soft hover:shadow-sm'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="text-sm font-semibold text-ink leading-tight">{dept.name}</div>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono text-helper tracking-wider bg-mist">{dept.code}</Badge>
                </div>
                
                <div className="text-xs mb-1.5">
                  {dept.hod?.id ? (
                    <span className="text-soft-ink font-medium">HOD: {dept.hod.fullName}</span>
                  ) : (
                    <span className="text-status-foreground font-medium flex items-center gap-1"><XCircle className="h-3 w-3" /> No HOD appointed</span>
                  )}
                </div>
                
                <div className="flex items-center gap-3 text-xs text-helper font-medium">
                  {failedDepts.has(dept.id) ? (
                    <span className="text-status-foreground flex items-center gap-1" title="Couldn't load this department's counts">
                      <span className="font-bold">—</span> Data unavailable
                    </span>
                  ) : (
                    <>
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-helper" /> {loadingCounts ? "—" : (deptCounts.get(dept.id)?.facultyCount || 0)}</span>
                      <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5 text-helper" /> {loadingCounts ? "—" : (deptCounts.get(dept.id)?.residentCount || 0)}</span>
                    </>
                  )}
                </div>
              </button>
            ))}
            {departments.length === 0 && (
              <div className="text-sm text-helper text-center p-8 border border-dashed rounded-xl">
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
            <div className="h-full min-h-[400px] flex items-center justify-center border border-dashed border-line-soft rounded-xl bg-mist">
              <p className="text-sm text-helper">Select a department to view details.</p>
            </div>
          )}
        </div>
      </div>
        </TabsContent>

        {SUPPORT_FEATURE_ENABLED && (
          <TabsContent value="support" className="space-y-4 mt-3">
            <SupportTicketsAdmin onOpenCountChange={setOpenTicketCount} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function DepartmentDetail({ department, onRefresh }: { department: AdminDepartment, onRefresh: () => void }) {
  type ViewSnapshot = {
    epoch: number;
    deptId: number;
    mirrorId: number | null;
    mirrorKey: string | null;
    viewKey: string;
  };

  const currentMirrorId = !department.mirrorAmbiguous && department.mirrorDepartmentId
    ? department.mirrorDepartmentId
    : null;
  const currentMirrorKey = currentMirrorId !== null
    ? `${department.id}:${currentMirrorId}`
    : null;
  const currentViewKey = `${department.id}:${currentMirrorId ?? "none"}:${Boolean(department.mirrorAmbiguous)}`;

  const [roster, setRoster] = useState<AdminUserRow[]>([]);
  const [loadedRosterDeptId, setLoadedRosterDeptId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mirrorRoster, setMirrorRoster] = useState<AdminUserRow[]>([]);
  const [loadedMirror, setLoadedMirror] = useState<{ key: string; mirrorDepartmentId: number } | null>(null);
  const [mirrorLoading, setMirrorLoading] = useState(Boolean(currentMirrorKey));
  const [mirrorError, setMirrorError] = useState<string | null>(null);

  const [showReplaceHod, setShowReplaceHod] = useState(false);
  const [replaceHodEmail, setReplaceHodEmail] = useState("");
  const [replacingHod, setReplacingHod] = useState(false);
  const [replaceHodError, setReplaceHodError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormType, setAddFormType] = useState<"faculty" | "resident">("faculty");
  const [addTarget, setAddTarget] = useState<{ id: number; name: string; isTest: boolean } | null>(null);
  const [approvalMode, setApprovalMode] = useState<"hod" | "automatic">("automatic");
  const [addForm, setAddForm] = useState(() => generateDefaultResidentForm());
  const [addingUser, setAddingUser] = useState(false);
  
  const [activeTab, setActiveTab] = useState<"faculty" | "residents" | "test-accounts">("faculty");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [userToDelete, setUserToDelete] = useState<{ id: number; name: string; role: string; isTest: boolean; departmentName: string } | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [changingUserId, setChangingUserId] = useState<number | null>(null);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingUserName, setSavingUserName] = useState(false);
  const [restoringTestFaculty, setRestoringTestFaculty] = useState(false);
  const [restoreFacultyError, setRestoreFacultyError] = useState<string | null>(null);
  const [resettingCredentials, setResettingCredentials] = useState(false);
  const [resetCredentialsError, setResetCredentialsError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const activeDeptIdRef = useRef(department.id);
  activeDeptIdRef.current = department.id;
  const activeMirrorKeyRef = useRef(currentMirrorKey);
  activeMirrorKeyRef.current = currentMirrorKey;
  const activeViewKeyRef = useRef(currentViewKey);
  activeViewKeyRef.current = currentViewKey;
  const rosterRequestIdRef = useRef(0);
  const mirrorRequestIdRef = useRef(0);
  const actionEpochRef = useRef(0);

  const captureViewSnapshot = (): ViewSnapshot => ({
    epoch: actionEpochRef.current,
    deptId: department.id,
    mirrorId: currentMirrorId,
    mirrorKey: currentMirrorKey,
    viewKey: currentViewKey,
  });

  const isViewSnapshotCurrent = (snapshot: ViewSnapshot): boolean =>
    mountedRef.current &&
    actionEpochRef.current === snapshot.epoch &&
    activeDeptIdRef.current === snapshot.deptId &&
    activeMirrorKeyRef.current === snapshot.mirrorKey &&
    activeViewKeyRef.current === snapshot.viewKey;

  useEffect(() => {
    mountedRef.current = true;
    const initialSnapshot: ViewSnapshot = {
      epoch: actionEpochRef.current,
      deptId: department.id,
      mirrorId: currentMirrorId,
      mirrorKey: currentMirrorKey,
      viewKey: currentViewKey,
    };
    rosterRequestIdRef.current += 1;
    mirrorRequestIdRef.current += 1;

    setRoster([]);
    setLoadedRosterDeptId(null);
    setLoading(true);
    setError(null);

    setMirrorRoster([]);
    setLoadedMirror(null);
    setMirrorError(null);
    setMirrorLoading(Boolean(currentMirrorKey));

    setShowReplaceHod(false);
    setReplaceHodEmail("");
    setReplacingHod(false);
    setReplaceHodError(null);
    setShowAddForm(false);
    setAddTarget(null);
    setAddingUser(false);
    setShowDeleteConfirm(false);
    setDeleting(false);
    setDeleteError(null);
    setUserToDelete(null);
    setDeletingUser(false);
    setChangingUserId(null);
    setDeleteUserError(null);
    setEditingUserId(null);
    setEditingName("");
    setSavingUserName(false);
    setRestoringTestFaculty(false);
    setRestoreFacultyError(null);
    setResettingCredentials(false);
    setResetCredentialsError(null);

    void fetchRoster(initialSnapshot);
    void fetchMirrorRoster(initialSnapshot);

    return () => {
      mountedRef.current = false;
      actionEpochRef.current += 1;
      rosterRequestIdRef.current += 1;
      mirrorRequestIdRef.current += 1;
    };
  }, [department.id, department.mirrorDepartmentId, department.mirrorAmbiguous]);

  const fetchRoster = async (snapshot: ViewSnapshot = captureViewSnapshot()): Promise<boolean> => {
    if (!isViewSnapshotCurrent(snapshot)) return false;
    const requestId = ++rosterRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminDepartmentRoster(snapshot.deptId);
      if (!isViewSnapshotCurrent(snapshot) || rosterRequestIdRef.current !== requestId) return false;
      setRoster(data);
      setLoadedRosterDeptId(snapshot.deptId);
      return true;
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot) || rosterRequestIdRef.current !== requestId) return false;
      setRoster([]);
      setLoadedRosterDeptId(null);
      setError(err.message || "Failed to load roster");
      return false;
    } finally {
      if (isViewSnapshotCurrent(snapshot) && rosterRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  const fetchMirrorRoster = async (snapshot: ViewSnapshot = captureViewSnapshot()): Promise<boolean> => {
    if (!isViewSnapshotCurrent(snapshot)) return false;
    const { mirrorId, mirrorKey } = snapshot;
    if (!mirrorId || !mirrorKey) {
      mirrorRequestIdRef.current += 1;
      setMirrorRoster([]);
      setLoadedMirror(null);
      setMirrorError(null);
      setMirrorLoading(false);
      return false;
    }
    const requestId = ++mirrorRequestIdRef.current;
    setMirrorLoading(true);
    setMirrorError(null);
    try {
      const data = await getAdminDepartmentRoster(mirrorId);
      if (!isViewSnapshotCurrent(snapshot) || mirrorRequestIdRef.current !== requestId) return false;
      setMirrorRoster(data);
      setLoadedMirror({ key: mirrorKey, mirrorDepartmentId: mirrorId });
      return true;
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot) || mirrorRequestIdRef.current !== requestId) return false;
      setMirrorRoster([]);
      setLoadedMirror(null);
      setMirrorError(err.message || "Failed to load test accounts");
      return false;
    } finally {
      if (isViewSnapshotCurrent(snapshot) && mirrorRequestIdRef.current === requestId) {
        setMirrorLoading(false);
      }
    }
  };

  const hasLoadedCurrentRoster = !loading && !error && loadedRosterDeptId === department.id;
  const hasLoadedCurrentMirror =
    currentMirrorKey !== null &&
    !mirrorLoading &&
    !mirrorError &&
    loadedMirror?.key === currentMirrorKey;

  const handleRestoreTestFaculty = async () => {
    if (restoringTestFaculty || !hasLoadedCurrentMirror || !loadedMirror) return;
    const snapshot = captureViewSnapshot();
    const expectedMirrorDepartmentId = loadedMirror.mirrorDepartmentId;
    setRestoringTestFaculty(true);
    setRestoreFacultyError(null);
    try {
      const result = await restoreTestFaculty(snapshot.deptId, expectedMirrorDepartmentId);
      if (!isViewSnapshotCurrent(snapshot)) return;
      const refreshed = await fetchMirrorRoster(snapshot);
      if (!isViewSnapshotCurrent(snapshot)) return;
      if (refreshed) {
        toast.success(result.status === "created" ? "Test faculty restored" : "Test faculty is already present");
      }
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      const message = err?.message || "Failed to restore test faculty";
      setRestoreFacultyError(message);
      toast.error(message);
    } finally {
      if (isViewSnapshotCurrent(snapshot)) setRestoringTestFaculty(false);
    }
  };

  const handleResetTestCredentials = async () => {
    if (resettingCredentials || !hasLoadedCurrentMirror || !loadedMirror || defaultTestAccounts.length === 0) return;
    const snapshot = captureViewSnapshot();
    const expectedMirrorDepartmentId = loadedMirror.mirrorDepartmentId;
    setResettingCredentials(true);
    setResetCredentialsError(null);
    try {
      await resetTestCredentials(snapshot.deptId, expectedMirrorDepartmentId);
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.success("Default test passwords reset");
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      const message = err?.message || "Failed to reset default test passwords";
      setResetCredentialsError(message);
      toast.error(message);
    } finally {
      if (isViewSnapshotCurrent(snapshot)) setResettingCredentials(false);
    }
  };

  const startNameEdit = (user: AdminUserRow) => {
    setEditingUserId(user.id);
    setEditingName(user.fullName);
  };

  const cancelNameEdit = () => {
    setEditingUserId(null);
    setEditingName("");
  };

  const handleSaveName = async (userId: number) => {
    if (savingUserName) return;
    const fullName = editingName.trim();
    if (!fullName) {
      toast.error("Enter a name before saving");
      return;
    }

    const snapshot = captureViewSnapshot();
    setSavingUserName(true);
    try {
      const updatedUser = await updateAdminDepartmentUserName(snapshot.deptId, userId, fullName);
      if (!isViewSnapshotCurrent(snapshot)) return;
      setRoster(current => current.map(user => user.id === updatedUser.id ? updatedUser : user));
      toast.success("Name updated");
      cancelNameEdit();
      onRefresh();
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.error(err.message || "Failed to update name");
    } finally {
      if (isViewSnapshotCurrent(snapshot)) setSavingUserName(false);
    }
  };

  const handleReplaceHod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (replacingHod || !replaceHodEmail || !hasLoadedCurrentRoster) return;

    const incomingFaculty = roster.find(u => u.email.toLowerCase() === replaceHodEmail.toLowerCase() && u.role === "professor" && u.status === "approved");
    
    if (!incomingFaculty) {
      setReplaceHodError("No approved faculty in this department matches that email");
      return;
    }

    const snapshot = captureViewSnapshot();
    setReplacingHod(true);
    setReplaceHodError(null);
    try {
      const result = await replaceAdminHod(snapshot.deptId, incomingFaculty.id);
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.success("HOD replaced successfully");
      if (!result.emailAccepted) toast.warning("The HOD role changed, but the appointment email could not be accepted by the email provider.");
      setShowReplaceHod(false);
      setReplaceHodEmail("");
      onRefresh(); // Refresh parent to get updated HOD info
      void fetchRoster(snapshot);
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      setReplaceHodError(err.message || "Failed to replace HOD");
      toast.error(err.message || "Failed to replace HOD");
    } finally {
      if (isViewSnapshotCurrent(snapshot)) setReplacingHod(false);
    }
  };

  const openAddForm = () => {
    if (activeTab === "faculty") {
      setAddFormType("faculty");
      setAddTarget({ id: department.id, name: department.name, isTest: false });
    } else if (activeTab === "residents") {
      setAddFormType("resident");
      setAddTarget({ id: department.id, name: department.name, isTest: false });
    } else if (hasLoadedCurrentMirror && loadedMirror && department.mirrorDepartmentName) {
      setAddFormType("resident");
      setAddTarget({ id: loadedMirror.mirrorDepartmentId, name: department.mirrorDepartmentName, isTest: true });
    } else {
      toast.error("Test department details are unavailable. Reload departments and try again.");
      return;
    }
    setApprovalMode("automatic");
    setAddForm(generateDefaultResidentForm());
    setShowAddForm(true);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingUser || !addTarget || !addForm.fullName || !addForm.email || (addFormType === "resident" && !addForm.password)) return;
    
    if (addFormType === "resident") {
      if (!addForm.batch || !addForm.dateOfJoining || !addForm.kuhsId) {
        toast.error("Please fill in all resident fields.");
        return;
      }
    }

    const target = addTarget;
    const formType = addFormType;
    const snapshot = captureViewSnapshot();
    setAddingUser(true);
    try {
      if (formType === "faculty") {
        const result = await createAdminFaculty(target.id, {
          fullName: addForm.fullName,
          email: addForm.email
        });
        if (!isViewSnapshotCurrent(snapshot)) return;
        toast.success("Faculty account created");
        if (!result.emailAccepted) {
          const detail = result.emailFailure?.failure === "missing_configuration" ? "Email service configuration is missing"
            : result.emailFailure?.failure === "provider_rejected" ? `Email provider rejected it${result.emailFailure.providerStatus ? ` (HTTP ${result.emailFailure.providerStatus})` : ""}`
              : "Email provider could not be reached";
          toast.warning(`Faculty account created. ${detail}; ask the faculty member to use Forgot password if needed.`);
        }
      } else {
        const result = await createAdminStudent(target.id, {
          fullName: addForm.fullName,
          email: addForm.email,
          password: addForm.password,
          registrationNumber: addForm.registrationNumber,
          batch: addForm.batch,
          dateOfJoining: addForm.dateOfJoining,
          kuhsId: addForm.kuhsId,
          approvalMode,
        });
        if (!isViewSnapshotCurrent(snapshot)) return;
        if (result.student.status === "pending") {
          toast.success(`Resident account created and is awaiting the ${target.name} HOD's approval`);
          if (!result.hodEmailAccepted) toast.warning("The resident is awaiting HOD approval, but the notification email could not be accepted by the email provider.");
        } else if (result.approvalFallback === "no_active_hod") {
          toast.success(`Resident account approved automatically because no active HOD is assigned to ${target.name}`);
        } else {
          toast.success("Resident account created and approved");
        }
      }
      setAddForm(generateDefaultResidentForm());
      setShowAddForm(false);
      setAddTarget(null);
      onRefresh(); // Refresh counts
      if (target.isTest) await fetchMirrorRoster(snapshot);
      else await fetchRoster(snapshot);
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.error(err.message || `Failed to create ${formType} account`);
    } finally {
      if (isViewSnapshotCurrent(snapshot)) setAddingUser(false);
    }
  };

  const handleDeactivate = async (userId: number, role: string, isTest = false) => {
    if (changingUserId === userId) return;
    const targetDepartmentName = isTest ? department.mirrorDepartmentName || "test department" : department.name;
    if (!window.confirm(`Deactivate this ${role === "student" ? "resident" : "faculty"} account in ${targetDepartmentName}? Their records will be retained.`)) return;
    const snapshot = captureViewSnapshot();
    setChangingUserId(userId);
    try {
      await deactivateAdminUser(userId);
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.success("User deactivated");
      onRefresh();
      if (isTest) await fetchMirrorRoster(snapshot);
      else await fetchRoster(snapshot);
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.error(err.message || "Failed to deactivate user");
    } finally {
      if (isViewSnapshotCurrent(snapshot)) {
        setChangingUserId((current) => current === userId ? null : current);
      }
    }
  };

  const handleReactivate = async (userId: number, name: string, isTest = false) => {
    if (changingUserId === userId) return;
    const targetDepartmentName = isTest ? department.mirrorDepartmentName || "test department" : department.name;
    if (!window.confirm(`Reactivate ${name} in ${targetDepartmentName}? They will be able to sign in again.`)) return;
    const snapshot = captureViewSnapshot();
    setChangingUserId(userId);
    try {
      await reactivateAdminUser(userId);
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.success(`${name} reactivated`);
      onRefresh();
      if (isTest) await fetchMirrorRoster(snapshot);
      else await fetchRoster(snapshot);
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.error(err.message || "Failed to reactivate user");
    } finally {
      if (isViewSnapshotCurrent(snapshot)) {
        setChangingUserId((current) => current === userId ? null : current);
      }
    }
  };

  const handleHardDeleteUser = async () => {
    if (!userToDelete || deletingUser) return;
    const targetUser = userToDelete;
    const snapshot = captureViewSnapshot();
    setDeletingUser(true);
    setDeleteUserError(null);
    try {
      const res = await hardDeleteAdminUser(targetUser.id);
      if (!isViewSnapshotCurrent(snapshot)) return;
      const deletedCount = Object.values(res?.deletedRecords ?? {}).reduce((acc, val) => acc + (typeof val === "number" ? val : 0), 0);
      const summary = deletedCount > 0 ? ` (${deletedCount} related records removed)` : "";
      toast.success(`${targetUser.name} permanently deleted from ${targetUser.departmentName}${summary}`);
      setUserToDelete(null);
      onRefresh();
      if (targetUser.isTest) await fetchMirrorRoster(snapshot);
      else await fetchRoster(snapshot);
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      setDeleteUserError(err.message || "Failed to permanently delete user");
    } finally {
      if (isViewSnapshotCurrent(snapshot)) setDeletingUser(false);
    }
  };

  const handleDeleteDepartment = async () => {
    if (deleting) return;
    const snapshot = captureViewSnapshot();
    const targetDeptName = department.name;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAdminDepartment(snapshot.deptId);
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.success(`Department "${targetDeptName}" deleted`);
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      setDeleteError(err.message || "Failed to delete department");
    } finally {
      if (isViewSnapshotCurrent(snapshot)) setDeleting(false);
    }
  };

  const handleImpersonate = async (userId: number) => {
    const snapshot = captureViewSnapshot();
    try {
      const result = await impersonateAdminUser(userId);
      if (!isViewSnapshotCurrent(snapshot)) return;
      if (result.token) {
        window.open(`/?impersonationToken=${result.token}`, '_blank');
      }
    } catch (err: any) {
      if (!isViewSnapshotCurrent(snapshot)) return;
      toast.error(err.message || "Failed to log in as user");
    }
  };

  const faculty = roster.filter(u => u.role === "professor" || u.role === "hod");
  const residents = roster.filter(u => u.role === "student");
  const isCanonicalDefaultAccount = (user: AdminUserRow): boolean => {
    const defaults = department.mirrorDefaultEmails;
    if (!defaults) return false;
    if (user.role === "hod") return user.email === defaults.hod;
    if (user.role === "professor") return user.email === defaults.professor;
    if (user.role === "student") return user.email === defaults.student;
    return false;
  };
  const defaultTestAccounts = hasLoadedCurrentMirror ? mirrorRoster.filter(isCanonicalDefaultAccount) : [];
  const customTestAccounts = hasLoadedCurrentMirror ? mirrorRoster.filter((user) => !isCanonicalDefaultAccount(user)) : [];
  const mirrorHasProfessor = hasLoadedCurrentMirror && mirrorRoster.some((user) => user.role === "professor");

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-4">
      {/* HOD Strip */}
      <Card className="overflow-hidden border-line-soft">
        <div className="bg-mist p-3 sm:p-4 border-b border-line-soft flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
              <AvatarFallback className={department.hod?.id ? "bg-sage text-forest font-bold" : "bg-sage text-helper font-bold"}>
                {department.hod?.fullName ? getInitials(department.hod.fullName) : "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              {department.hod?.id ? (
                <>
                  <h3 className="font-semibold text-base text-ink leading-tight">{department.hod.fullName}</h3>
                  <p className="text-sm text-helper font-medium">HOD, {department.name} • {department.hod.email}</p>
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-base text-status-foreground leading-tight">No HOD appointed</h3>
                  <p className="text-sm text-helper font-medium">Department of {department.name}</p>
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
              className="text-status-foreground border-status-border hover:bg-status shadow-sm"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        </div>
        
        {/* Replace HOD inline panel */}
        {showReplaceHod && (
          <div className="bg-white p-3 sm:p-4 border-t border-line-soft">
            <form onSubmit={handleReplaceHod} className="space-y-4">
              <p className="text-sm font-medium text-ink">
                {department.hod?.id ? "Promote an existing faculty member to Head of Department." : "Promote an existing faculty member to Head of Department."}
              </p>
              
              {replaceHodError && (
                <div className="p-3 bg-status border border-status-border rounded-md text-sm text-status-foreground">
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
                  <Button type="submit" disabled={replacingHod} className="flex-1 sm:flex-none bg-deep hover:bg-deep text-white">
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
        <Card className="border-status-border bg-status shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status">
                <AlertTriangle className="h-4 w-4 text-status-foreground" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h4 className="font-semibold text-status-foreground">Delete {department.name}?</h4>
                  <p className="text-sm text-status-foreground mt-1 leading-relaxed">
                    This will <strong>permanently delete</strong> the department and <strong>all</strong> of its:
                  </p>
                  <ul className="text-sm text-status-foreground mt-1 ml-4 list-disc space-y-0.5">
                    <li>Faculty accounts (professors)</li>
                    <li>Resident accounts (students)</li>
                    <li>Head of Department (HOD) account</li>
                    <li>Department configuration, procedure types, training options, and assignment types</li>
                  </ul>
                  <p className="text-sm text-status-foreground mt-2 leading-relaxed">
                    If any faculty or resident has clinical logs, assessments, or other records that reference them, the delete will be <strong>refused</strong> by the database. This is not an error — remove or reassign those records first.
                  </p>
                </div>

                {deleteError && (
                  <div className="p-3 bg-status border border-status-border rounded-md text-sm text-status-foreground font-medium">
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
                    className="bg-destructive hover:bg-deep text-white"
                  >
                    {deleting ? "Deleting..." : `Yes, delete ${department.name}`}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Permanently delete a faculty member or resident: confirmation panel */}
                    {userToDelete && (
        <Card className="border-status-border bg-status shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status">
                <AlertTriangle className="h-4 w-4 text-status-foreground" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                          <h4 className="font-semibold text-status-foreground">Permanently delete {userToDelete.name} from {userToDelete.departmentName}?</h4>
                  <p className="text-sm text-status-foreground mt-1 leading-relaxed">
                    This will <strong>permanently delete</strong> the {userToDelete.role === "student" ? "resident" : "faculty member"} and <strong>all</strong> of their associated data. This action is <strong>irreversible</strong>.
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
                      <li>Any assignments they created (assignment types pass to {userToDelete.isTest
                        ? department.mirrorHod?.fullName ? `${department.mirrorHod.fullName}, the ${userToDelete.departmentName} HOD` : "the acting admin because the test department has no active HOD"
                        : department.hod?.fullName ? `${department.hod.fullName}, the ${userToDelete.departmentName} HOD` : "the acting admin because the department has no active HOD"})</li>
                      <li><strong>Every clinical and academic record belonging to residents</strong> where this faculty member appears as reviewer, verifier, or supervisor</li>
                      <li>Their assessments and appraisals of residents</li>
                    </ul>
                  )}
                  <p className="text-sm text-status-foreground mt-2 leading-relaxed">
                    To remove access but keep all records, use <strong>Deactivate</strong> instead.
                  </p>
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

      {error ? (
        <div className="flex h-40 flex-col items-center justify-center space-y-4 text-center rounded-xl border border-status-border bg-status" role="alert">
          <p className="text-sm font-medium text-status-foreground">{error}</p>
          <Button onClick={() => void fetchRoster()} variant="outline" size="sm">Try again</Button>
        </div>
      ) : !hasLoadedCurrentRoster ? (
        <div className="flex h-40 items-center justify-center border border-line-soft rounded-xl bg-white"><div className="animate-spin rounded-full border-4 border-line-soft border-t-forest h-8 w-8" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-line-soft overflow-hidden shadow-sm">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
            <div className="border-b border-line-soft px-3 pt-3 flex flex-wrap justify-between items-center gap-2 bg-mist">
              <TabsList className="h-auto flex-wrap bg-sage">
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
              <Button variant="ghost" size="sm" onClick={() => showAddForm ? (setShowAddForm(false), setAddTarget(null)) : openAddForm()}
                disabled={activeTab === "test-accounts" && !hasLoadedCurrentMirror}
                className="text-forest hover:text-forest hover:bg-mist">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {showAddForm && (
              <div className="p-3 sm:p-4 bg-mist border-b border-line-soft">
                <h4 className="font-semibold text-ink mb-3 flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-forest" />
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
                    {addFormType === "resident" ? (
                      <div className="space-y-2 flex-1 w-full">
                        <Label>Password</Label>
                        <Input type="password" placeholder="At least 8 characters" value={addForm.password} onChange={e => setAddForm({...addForm, password: e.target.value})} required minLength={8} maxLength={72} />
                      </div>
                    ) : (
                      <p className="flex-1 text-sm text-soft-ink">A secure initial password will be generated and emailed to the faculty member. They can change it after signing in.</p>
                    )}
                  </div>
                  {addFormType === "resident" && (
                    <>
                    <div className="rounded-md border border-line-soft bg-mist p-3 text-sm text-forest" role="status">
                      Adding this resident to <strong>{addTarget?.name}</strong>{addTarget?.isTest ? " (test department)" : ""}.
                    </div>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-ink">Approval</legend>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <label className="flex items-start gap-2 rounded-md border bg-white p-3 text-sm">
                          <input type="radio" name="resident-approval" value="hod" checked={approvalMode === "hod"} onChange={() => setApprovalMode("hod")} />
                          <span><strong>Approve by HOD</strong><br />{(addTarget?.isTest ? department.mirrorHod : department.hod)?.fullName
                            ? `The ${addTarget?.name} HOD will review this resident.`
                            : "If there is no active HOD in this department, the resident will be approved automatically."}</span>
                        </label>
                        <label className="flex items-start gap-2 rounded-md border bg-white p-3 text-sm">
                          <input type="radio" name="resident-approval" value="automatic" checked={approvalMode === "automatic"} onChange={() => setApprovalMode("automatic")} />
                          <span><strong>Automatic</strong><br />The resident is approved immediately.</span>
                        </label>
                      </div>
                    </fieldset>
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                      <div className="space-y-2 flex-1 w-full">
                        <Label>Registration Number</Label>
                        <Input placeholder="Reg No." value={addForm.registrationNumber} onChange={e => setAddForm({...addForm, registrationNumber: e.target.value})} />
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
                    </>
                  )}
                  <div className="flex gap-2 justify-end mt-2">
                    <Button type="button" variant="outline" onClick={() => { setShowAddForm(false); setAddTarget(null); }}>Cancel</Button>
                    <Button type="submit" disabled={addingUser} className="bg-forest hover:bg-deep">{addingUser ? "Creating..." : "Create account"}</Button>
                  </div>
                </form>
              </div>
            )}

            <TabsContent value="faculty" className="m-0 border-none outline-none">
              {!faculty.length ? (
                <p className="p-8 text-center text-sm text-helper">No faculty in this department.</p>
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
                        <TableCell className="font-semibold text-ink">
                          {editingUserId === u.id ? (
                            <div>
                              <Input
                                autoFocus
                                required
                                maxLength={160}
                                aria-label={`Name for ${u.fullName}`}
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="h-9 min-w-40"
                              />
                            </div>
                          ) : u.fullName}
                        </TableCell>
                        <TableCell className="text-helper text-sm">{u.email}</TableCell>
                        <TableCell>
                          {u.role === "hod" ? (
                            <Badge className="bg-sage text-forest hover:bg-sage border-none shadow-none rounded-full">HOD</Badge>
                          ) : (
                            <Badge variant={u.status === "approved" ? "default" : "secondary"} className={`rounded-full ${u.status === 'approved' ? 'bg-deep' : ''}`}>
                              {u.status === "rejected" ? "Deactivated" : u.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {editingUserId === u.id ? (
                              <>
                                <Button type="button" onClick={() => handleSaveName(u.id)} size="sm" disabled={savingUserName || !editingName.trim()} className="h-8 px-3">
                                  {savingUserName ? "Saving..." : "Save"}
                                </Button>
                                <Button type="button" size="sm" variant="outline" disabled={savingUserName} onClick={cancelNameEdit} className="h-8 px-3">
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button type="button" size="sm" variant="outline" title={`Edit ${u.fullName}'s name`} aria-label={`Edit ${u.fullName}'s name`} onClick={() => startNameEdit(u)} className="h-8 px-3">
                                  <Pencil className="h-4 w-4" /> Edit name
                                </Button>
                                {u.role === "hod" ? (
                                  <span className="text-xs text-helper font-medium self-center">Use 'Replace HOD' above</span>
                                ) : (
                                  <>
                                    {u.status === "rejected" ? (
                                      <Button size="sm" variant="outline" onClick={() => handleReactivate(u.id, u.fullName)} className="h-8 px-3">
                                        Reactivate
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant="outline" onClick={() => handleDeactivate(u.id, u.role)} className="text-status-foreground border-status-border hover:bg-status h-8 px-3">
                                        Deactivate
                                      </Button>
                                    )}
                                    <Button size="sm" variant="outline" onClick={() => { setUserToDelete({ id: u.id, name: u.fullName, role: u.role, isTest: false, departmentName: department.name }); setDeleteUserError(null); }} className="text-status-foreground border-status-border hover:bg-status h-8 px-3">
                                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                                    </Button>
                                  </>
                                )}
                              </>
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
              <div className="bg-mist border-b border-line-soft p-3 sm:px-6 flex items-start gap-3">
                <Info className="h-5 w-5 text-forest shrink-0 mt-0.5" />
                <p className="text-sm text-forest leading-relaxed">
                  <strong>Immediately approved.</strong> A resident added here is created with approved status and does not enter {department.name}'s HOD queue. Self-registered students still go through the HOD's approval flow.
                </p>
              </div>

              {!residents.length ? (
                <p className="p-8 text-center text-sm text-helper">No residents in this department.</p>
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
                          {editingUserId === u.id ? (
                            <div>
                              <Input
                                autoFocus
                                required
                                maxLength={160}
                                aria-label={`Name for ${u.fullName}`}
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="h-9 min-w-40"
                              />
                            </div>
                          ) : (
                            <div className="font-semibold text-ink">{u.fullName}</div>
                          )}
                          {u.status === "pending" && (
                            <div className="text-xs text-status-foreground mt-0.5">Awaiting the {department.name} HOD's approval</div>
                          )}
                        </TableCell>
                        <TableCell className="text-helper text-sm">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={u.status === "approved" ? "default" : "secondary"} className={`rounded-full ${u.status === 'approved' ? 'bg-deep' : u.status === 'pending' ? 'bg-status text-status-foreground border-none' : ''}`}>
                            {u.status === "rejected" ? "Deactivated" : u.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {editingUserId === u.id ? (
                              <>
                                <Button type="button" onClick={() => handleSaveName(u.id)} size="sm" disabled={savingUserName || !editingName.trim()} className="h-8 px-3">
                                  {savingUserName ? "Saving..." : "Save"}
                                </Button>
                                <Button type="button" size="sm" variant="outline" disabled={savingUserName} onClick={cancelNameEdit} className="h-8 px-3">
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button type="button" size="sm" variant="outline" title={`Edit ${u.fullName}'s name`} aria-label={`Edit ${u.fullName}'s name`} onClick={() => startNameEdit(u)} className="h-8 px-3">
                                  <Pencil className="h-4 w-4" /> Edit name
                                </Button>
                                {u.status === "rejected" ? (
                                  <Button size="sm" variant="outline" onClick={() => handleReactivate(u.id, u.fullName)} className="h-8 px-3">
                                    Reactivate
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => handleDeactivate(u.id, u.role)} className="text-status-foreground border-status-border hover:bg-status h-8 px-3">
                                    Deactivate
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => { setUserToDelete({ id: u.id, name: u.fullName, role: u.role, isTest: false, departmentName: department.name }); setDeleteUserError(null); }} className="text-status-foreground border-status-border hover:bg-status h-8 px-3">
                                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                                </Button>
                              </>
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
              {department.mirrorAmbiguous ? (
                <div className="p-8 text-center text-sm font-medium text-status-foreground" role="alert">
                  Multiple test departments are linked to {department.name}. Resolve the duplicate mirror link before managing test accounts.
                </div>
              ) : !department.mirrorDepartmentId ? (
                <p className="p-8 text-center text-sm text-helper">
                  No test department has been provisioned for {department.name} yet. Use "Provision test departments" above to create one.
                </p>
              ) : mirrorError ? (
                <div className="flex h-40 flex-col items-center justify-center space-y-4 text-center rounded-xl border border-status-border bg-status" role="alert">
                  <p className="text-sm font-medium text-status-foreground">{mirrorError}</p>
                  <Button onClick={() => void fetchMirrorRoster()} variant="outline" size="sm">Try again</Button>
                </div>
              ) : !hasLoadedCurrentMirror ? (
                <div className="flex h-40 items-center justify-center bg-white"><div className="animate-spin rounded-full border-4 border-line-soft border-t-forest h-8 w-8" /></div>
              ) : (
                <div className="space-y-4 p-4">
                  {!mirrorHasProfessor && (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-3 rounded-lg border border-status-border bg-status p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-status-foreground">No test professor in this test department</p>
                          <p className="text-xs text-soft-ink">Restore the default test professor account without modifying existing HOD, resident, or custom accounts.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleRestoreTestFaculty()}
                          disabled={restoringTestFaculty || !hasLoadedCurrentMirror}
                          className="shrink-0 border-status-border bg-white text-status-foreground hover:bg-mist"
                        >
                          {restoringTestFaculty ? "Restoring..." : "Restore test faculty"}
                        </Button>
                      </div>
                      {restoreFacultyError && (
                        <div role="alert" className="rounded-md border border-status-border bg-status p-3 text-sm font-medium text-status-foreground">
                          {restoreFacultyError}
                        </div>
                      )}
                    </div>
                  )}

                  {!mirrorRoster.length ? (
                    <p className="p-8 text-center text-sm text-helper">No test accounts in this department.</p>
                  ) : (
                    <>
                      {/* Credentials card */}
                      <div className="space-y-3 rounded-lg border border-line-soft bg-mist p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-forest">Default Test Login Credentials</p>
                            <p className="text-xs text-forest">
                              Default password <span className="font-mono font-bold text-forest bg-white px-2 py-0.5 rounded border border-line-soft">{department.mirrorCode}</span> applies only to the canonical auto-provisioned test accounts listed below. Custom test accounts keep their own passwords.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleResetTestCredentials()}
                            disabled={resettingCredentials || !hasLoadedCurrentMirror || defaultTestAccounts.length === 0}
                            className="shrink-0 border-line bg-white text-forest hover:bg-sage"
                          >
                            {resettingCredentials ? "Resetting..." : "Reset default passwords"}
                          </Button>
                        </div>
                        {resetCredentialsError && (
                          <div role="alert" className="rounded-md border border-status-border bg-status p-2.5 text-xs font-medium text-status-foreground">
                            {resetCredentialsError}
                          </div>
                        )}
                        {defaultTestAccounts.length > 0 ? (
                          <div className="grid gap-2">
                            {defaultTestAccounts.map(u => (
                              <div key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 bg-white rounded border border-line-soft px-3 py-2 text-sm">
                                <Badge variant="outline" className="capitalize w-fit shrink-0">{u.role}</Badge>
                                <span className="font-mono text-ink text-xs break-all">{u.email}</span>
                                <span className="text-helper text-xs shrink-0 sm:ml-auto">default password: <span className="font-mono font-medium text-ink">{department.mirrorCode}</span></span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded border border-line-soft bg-white px-3 py-2 text-xs text-soft-ink">
                            No canonical default test accounts are present in this roster.
                          </p>
                        )}
                        {customTestAccounts.length > 0 && (
                          <p className="text-xs text-soft-ink">
                            {customTestAccounts.length} custom test account{customTestAccounts.length === 1 ? "" : "s"} in the roster below use custom login credentials and are preserved during default password resets.
                          </p>
                        )}
                      </div>

                      {/* Roster table */}
                      <Table>
                        <TableHeader className="bg-white">
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Name</TableHead>
                            <TableHead>Email (login ID)</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mirrorRoster.map(u => {
                            const isDefaultAccount = isCanonicalDefaultAccount(u);
                            return (
                              <TableRow key={u.id}>
                                <TableCell>
                                  <div className="font-semibold text-ink">{u.fullName}</div>
                                  {u.status === "pending" && <div className="text-xs text-status-foreground mt-0.5">Awaiting the {department.mirrorDepartmentName || "test department"} HOD's approval</div>}
                                </TableCell>
                                <TableCell className="text-helper text-sm">
                                  <div className="font-mono">{u.email}</div>
                                  <div className="mt-1">
                                    <Badge variant="outline" className={isDefaultAccount ? "border-line bg-sage text-forest text-[10px]" : "border-line-soft bg-white text-helper text-[10px]"}>
                                      {isDefaultAccount ? "Default login" : "Custom login"}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="capitalize">{u.role}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={u.status === "approved" ? "default" : "secondary"} className={`rounded-full ${u.status === 'approved' ? 'bg-deep' : u.status === 'pending' ? 'bg-status text-status-foreground border-none' : ''}`}>
                                    {u.status === "rejected" ? "Deactivated" : u.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-wrap justify-end gap-2">
                                    {u.role === "hod" ? (
                                      u.status === "approved" && <Button size="sm" variant="outline" onClick={() => handleImpersonate(u.id)} className="h-8 px-3">Log in as</Button>
                                    ) : (
                                      <>
                                        {u.status === "approved" && (
                                          <Button size="sm" variant="outline" onClick={() => handleImpersonate(u.id)} className="h-8 px-3">Log in as</Button>
                                        )}
                                        {u.status === "rejected" ? (
                                          <Button size="sm" variant="outline" onClick={() => handleReactivate(u.id, u.fullName, true)} disabled={changingUserId === u.id} className="h-8 px-3">Reactivate</Button>
                                        ) : (
                                          <Button size="sm" variant="outline" onClick={() => handleDeactivate(u.id, u.role, true)} disabled={changingUserId === u.id} className="text-status-foreground border-status-border hover:bg-status h-8 px-3">Deactivate</Button>
                                        )}
                                        <Button size="sm" variant="outline" onClick={() => { setUserToDelete({
                                          id: u.id, name: u.fullName, role: u.role, isTest: true,
                                          departmentName: department.mirrorDepartmentName || "test department",
                                        }); setDeleteUserError(null); }} className="text-status-foreground border-status-border hover:bg-status h-8 px-3">
                                          <Trash2 className="h-4 w-4 mr-1" /> Delete
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

// Ensure lucide icon UserPlus is imported at the top
