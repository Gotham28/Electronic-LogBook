import * as React from "react";
import { Link, useLocation } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarRail,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPost } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
import { GuidedTour, type TourStep } from "@/components/GuidedTour";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Award,
  Bell,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Printer,
  Stethoscope,
  UserCheck,
  UserPlus,
} from "lucide-react";

import { useDepartment } from "@/lib/department-context";

export type RoleType = "Student" | "Faculty" | "HOD";

interface AppLayoutProps {
  children: React.ReactNode;
  activeRole: RoleType;
  onSignOut?: () => void;
}

type NavigationItem = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
  badgeColor?: string;
  badgeLoading?: boolean;
};

const navigationDescriptions: Record<string, string> = {
  Dashboard: "See your overall training progress, recent activity, and the requirements that need your attention.",
  "Postings & Rotations": "Review your clinical rotations, posting dates, and current department assignment.",
  "Case Logs": "Record and review the clinical cases you have observed, assisted with, or managed.",
  "Procedure Logs": "Track procedures, supervision levels, verification status, and required totals.",
  "Academic Activities": "Document seminars, journal clubs, presentations, teaching sessions, and other academic work.",
  Assessments: "View assessment records and feedback entered during your training.",
  "Thesis & Certifications": "Keep thesis milestones, certifications, and supporting academic requirements together.",
  "Leave Records": "Check your leave balance, previous requests, and approval status.",
  "Evaluation Queue": "Open student log entries that are waiting for your review and verification.",
  "Student Progress": "Follow the training progress and completion status of the students assigned to you.",
  Students: "View every student in the department and open their detailed training progress.",
  "Review Queue": "Review pending case and procedure entries submitted across the department.",
  "Add Assessment": "Create and manage assessments for postgraduate trainees.",
  "Pending Students": "Review new student registrations before granting access to the logbook.",
  "Add Faculty": "Add faculty accounts and manage their department access.",
  "Leave Approvals": "Review leave requests and record approval decisions.",
  Requirements: "Configure the case, procedure, and academic requirements used to measure progress.",
};

function navigationForRole(role: RoleType, dashboardData?: any, loadingBadges?: boolean): NavigationItem[] {
  if (role === "Faculty") {
    return [
      { title: "Evaluation Queue", icon: FileText, href: "/" },
      { title: "Student Progress", icon: UserCheck, href: "/mentees" },
      { title: "Assessments", icon: ClipboardCheck, href: "/assessments" },
    ];
  }

  if (role === "HOD") {
    return [
      { title: "Students", icon: GraduationCap, href: "/roster" },
      { title: "Review Queue", icon: FileText, href: "/review-queue" },
      { title: "Add Assessment", icon: ClipboardCheck, href: "/assessments" },
      { title: "Pending Students", icon: UserPlus, href: "/student-access" },
      { title: "Add Faculty", icon: UserCheck, href: "/professors" },
      { title: "Leave Approvals", icon: CheckCircle2, href: "/leave-approvals" },
      { title: "Requirements", icon: ClipboardCheck, href: "/requirements" },
    ];
  }

  const getCount = (id: string) => {
    if (!dashboardData) return undefined;
    const cat = dashboardData.categories?.find((c: any) => c.id === id);
    if (!cat) return undefined;
    return `${cat.logged}/${cat.required}`;
  };

  return [
    { title: "Dashboard", icon: LayoutDashboard, href: "/" },
    { title: "Postings & Rotations", icon: CalendarDays, href: "/postings" },
    { title: "Case Logs", icon: FileText, href: "/cases", badge: getCount("cases"), badgeLoading: loadingBadges },
    { title: "Procedure Logs", icon: Stethoscope, href: "/procedures", badge: getCount("procedures"), badgeLoading: loadingBadges },
    { title: "Academic Activities", icon: GraduationCap, href: "/academics" },
    { title: "Assessments", icon: ClipboardCheck, href: "/assessments" },
    { title: "Thesis & Certifications", icon: Award, href: "/milestones" },
    { title: "Leave Records", icon: CalendarDays, href: "/attendance" },
  ];
}

export function AppLayout({
  children,
  activeRole,
  onSignOut,
}: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { department } = useDepartment();
  const [dashboardData, setDashboardData] = React.useState<any>(null);
  const [loadingBadges, setLoadingBadges] = React.useState(activeRole === "Student");

  const [isChangePasswordOpen, setIsChangePasswordOpen] = React.useState(false);
  const [cpForm, setCpForm] = React.useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [changingPassword, setChangingPassword] = React.useState(false);
  const [isTourOpen, setIsTourOpen] = React.useState(false);
  const tourButtonRef = React.useRef<HTMLButtonElement>(null);

  // Notification item type
  type NotifItem = {
    id: string;
    text: string;
    href: string;
    onDismiss?: () => void;
  };

  // Notification state — populated by the effects below, never fabricated (§7)
  const [notifItems, setNotifItems] = React.useState<NotifItem[]>([]);

  // Fix: Get actual user from session for the sidebar profile
  const currentUser = getCurrentUser();
  const displayName = currentUser?.name || "";
  const initials = currentUser?.name 
    ? currentUser.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    : "";

  React.useEffect(() => {
    if (activeRole !== "Student") return;
    if (!currentUser?.studentProfileId) return;

    apiGet(`/api/students/${currentUser.studentProfileId}/dashboard`)
      .then(data => setDashboardData(data))
      .catch(err => console.error("Failed to load nav badges", err))
      .finally(() => setLoadingBadges(false));
  }, [activeRole, currentUser?.studentProfileId]);

  // Student: fetch assessments & logs to build notification items
  React.useEffect(() => {
    if (!currentUser || activeRole !== "Student" || !currentUser.studentProfileId) return;
    let cancelled = false;
    (async () => {
      try {
        const [assessmentsRes, logsRes] = await Promise.allSettled([
          apiGet<any[]>(`/api/students/${currentUser.studentProfileId}/assessments`),
          apiGet<any>(`/api/students/${currentUser.studentProfileId}/logs`),
        ]);
        if (cancelled) return;

        const items: NotifItem[] = [];

        if (assessmentsRes.status === "fulfilled" && Array.isArray(assessmentsRes.value)) {
          const totalAssessments = assessmentsRes.value.length;
          const key = `seen_assessments_${currentUser.studentProfileId}`;
          const seenStr = sessionStorage.getItem(key);
          const seenCount = seenStr ? parseInt(seenStr, 10) : totalAssessments;
          if (!seenStr) {
            sessionStorage.setItem(key, String(totalAssessments));
          }
          const newAssess = Math.max(0, totalAssessments - seenCount);
          if (newAssess > 0) {
            items.push({
              id: "assessments",
              text: `${newAssess} new assessment${newAssess === 1 ? "" : "s"} recorded`,
              href: "/assessments",
              onDismiss: () => sessionStorage.setItem(key, String(totalAssessments)),
            });
          }
        }

        if (logsRes.status === "fulfilled" && logsRes.value) {
          const { caseLogs = [], procedureLogs = [], academicLogs = [] } = logsRes.value;
          const rejectedCases = caseLogs.filter((l: any) => l.status === "rejected").length;
          const rejectedProcs = procedureLogs.filter((l: any) => l.status === "rejected").length;
          const rejectedAcads = academicLogs.filter((l: any) => l.status === "rejected").length;
          const rejectedTotal = rejectedCases + rejectedProcs + rejectedAcads;

          const rejKey = `dismissed_rejected_${currentUser.studentProfileId}`;
          const dismissedStr = sessionStorage.getItem(rejKey);
          if (rejectedTotal > 0 && dismissedStr !== String(rejectedTotal)) {
            items.push({
              id: "rejected_logs",
              text: `${rejectedTotal} log ${rejectedTotal === 1 ? "entry" : "entries"} returned for revision`,
              href: "/cases",
              onDismiss: () => sessionStorage.setItem(rejKey, String(rejectedTotal)),
            });
          }
        }

        setNotifItems(items);
      } catch {
        /* fail silently - no fabricated numbers (§7) */
      }
    })();
    return () => { cancelled = true; };
  }, [activeRole, currentUser]);

  // Faculty / HOD: load action-required items
  React.useEffect(() => {
    if (!currentUser) return;
    if (activeRole !== "Faculty" && activeRole !== "HOD") return;
    let cancelled = false;
    (async () => {
      const items: NotifItem[] = [];
      if (activeRole === "Faculty") {
        try {
          const queue = await apiGet<any[]>(`/api/professors/${currentUser.id}/review-queue`);
          const n = Array.isArray(queue) ? queue.length : 0;
          if (n > 0) {
            items.push({
              id: "faculty_queue",
              text: `${n} log${n === 1 ? "" : "s"} pending your review`,
              href: "/",
            });
          }
        } catch { /* fail silently — no fabricated data (§7) */ }
      }
      if (activeRole === "HOD") {
        const [ps, pl] = await Promise.allSettled([
          apiGet<any[]>("/api/admin/students/pending"),
          apiGet<any[]>("/api/admin/leaves/pending"),
        ]);
        const sc = ps.status === "fulfilled" && Array.isArray(ps.value) ? ps.value.length : 0;
        const lc = pl.status === "fulfilled" && Array.isArray(pl.value) ? pl.value.length : 0;
        if (sc > 0) {
          items.push({
            id: "hod_pending_students",
            text: `${sc} student${sc === 1 ? "" : "s"} awaiting approval`,
            href: "/student-access",
          });
        }
        if (lc > 0) {
          items.push({
            id: "hod_pending_leaves",
            text: `${lc} leave request${lc === 1 ? "" : "s"} pending`,
            href: "/leave-approvals",
          });
        }
      }
      if (!cancelled) setNotifItems(items);
    })();
    return () => { cancelled = true; };
  }, [activeRole, currentUser?.id]);


  const navigationItems = React.useMemo(
    () => navigationForRole(activeRole, dashboardData, loadingBadges),
    [activeRole, dashboardData, loadingBadges],
  );
  const closeTour = React.useCallback(() => {
    setIsTourOpen(false);
    window.requestAnimationFrame(() => tourButtonRef.current?.focus());
  }, []);
  const tourSteps = React.useMemo<TourStep[]>(() => {
    const navigationSteps = navigationItems.map((item, index) => ({
      target: `navigation-${index}`,
      title: item.title,
      description: navigationDescriptions[item.title] || `Open ${item.title} from the sidebar.`,
    }));

    return [
      ...navigationSteps,
      ...(activeRole === "Student"
        ? [{
            target: "print-logbook",
            title: "Print your logbook",
            description: "Open a consolidated, print-ready version of your training record for review or PDF export.",
          }]
        : []),
      {
        target: "notifications",
        title: "Notifications",
        description: "Check reminders, pending reviews, due requirements, and other important updates.",
      },
      {
        target: "account-menu",
        title: "Account menu",
        description: "Open your profile menu to change your password or securely sign out.",
      },
    ];
  }, [activeRole, navigationItems]);

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cpForm.newPassword !== cpForm.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      await apiPost("/api/auth/change-password", { 
        currentPassword: cpForm.currentPassword, 
        newPassword: cpForm.newPassword 
      });
      toast.success("Password changed successfully");
      setIsChangePasswordOpen(false);
      setCpForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      onSignOut?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <SidebarProvider defaultOpen style={{ "--sidebar-width": "17rem", "--sidebar-width-icon": "5rem" } as React.CSSProperties}>
      <div className="medical-grid h-screen w-full overflow-hidden p-0 text-slate-900 md:p-3 lg:p-4">
        <div className="glass-panel mx-auto flex h-[100dvh] w-full max-w-[1600px] overflow-hidden rounded-none border-white/70 md:h-[calc(100vh-24px)] md:rounded-[30px] lg:h-[calc(100vh-32px)]">
          <Sidebar collapsible="icon" className="print-hidden border-r border-slate-200/80 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <SidebarHeader className="h-[74px] overflow-hidden border-b border-slate-100 p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
              <div className="relative flex h-full w-full items-center overflow-hidden group-data-[collapsible=icon]:justify-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-[0_12px_28px_rgba(13,148,136,0.2)]">
                  <BookOpenCheck className="h-6 w-6" />
                </div>
                <div className="absolute left-[52px] top-1/2 w-[180px] -translate-y-1/2 whitespace-nowrap transition-opacity duration-150 group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
                  <p className="font-display text-lg font-bold leading-tight text-slate-900">E-Logbook</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Clinical training records</p>
                </div>
              </div>
            </SidebarHeader>

            <SidebarContent className="p-2">
              <SidebarGroup>
                <SidebarGroupLabel className="mb-2 h-8! px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-900/45 group-data-[collapsible=icon]:mt-0! group-data-[collapsible=icon]:opacity-0">
                  {activeRole} workspace
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {navigationItems.map((item, index) => {
                      const isActive =
                        location === item.href ||
                        (item.href !== "/" && location.startsWith(item.href));
                      const Icon = item.icon;
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            data-tour-id={`navigation-${index}`}
                            asChild
                            isActive={isActive}
                            tooltip={item.title}
                            className={`h-11 w-full rounded-xl px-3 transition-all duration-200 group-data-[collapsible=icon]:mx-auto! group-data-[collapsible=icon]:h-11! group-data-[collapsible=icon]:w-11! group-data-[collapsible=icon]:p-0! ${
                              isActive
                                ? "border border-white/60 bg-gradient-to-r from-teal-600 to-cyan-500 font-semibold text-white shadow-[0_16px_36px_rgba(13,148,136,0.22)] hover:text-white"
                                : "text-slate-600 hover:border hover:border-white/70 hover:bg-white/80 hover:text-teal-900"
                            }`}
                          >
                            <Link href={item.href} className="flex w-full items-center gap-3 group-data-[collapsible=icon]:justify-center">
                              <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-teal-600"}`} />
                              <span className="flex-1 truncate text-[13px] group-data-[collapsible=icon]:hidden">{item.title}</span>
                              
                              {item.badgeLoading ? (
                                <Skeleton className="h-4 w-12 rounded-full bg-teal-100/50 group-data-[collapsible=icon]:hidden" />
                              ) : item.badge ? (
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-1.5 py-0 text-[9px] group-data-[collapsible=icon]:hidden ${
                                    isActive
                                      ? "border-white/25 bg-white/15 text-white"
                                      : item.badgeColor || "border-teal-100 bg-teal-50 text-teal-700"
                                  }`}
                                >
                                  {item.badge}
                                </Badge>
                              ) : null}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="sticky bottom-0 z-20 mt-auto border-t border-white/70 bg-white/92 p-3 backdrop-blur-md">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button data-tour-id="account-menu" className="flex w-full items-center gap-3 rounded-2xl border border-white/70 bg-white/75 p-2.5 text-left shadow-[0_14px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:bg-white">
                    <Avatar className="h-10 w-10 border border-teal-100">
                      <AvatarFallback className="bg-gradient-to-br from-teal-100 to-cyan-100 text-xs font-bold text-teal-800">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                      <p className="truncate text-xs font-bold text-slate-900">{displayName}</p>
                      <p className="truncate text-[10px] font-semibold text-teal-700">{activeRole} portal</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-teal-700/50 group-data-[collapsible=icon]:hidden" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 rounded-2xl border-white/70 bg-white/92 p-1 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                  <DropdownMenuItem onClick={() => setIsChangePasswordOpen(true)} className="cursor-pointer rounded-xl text-xs">
                    <KeyRound className="mr-2 h-4 w-4" /> Change Password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {onSignOut && (
                    <DropdownMenuItem onClick={onSignOut} className="cursor-pointer rounded-xl text-xs text-rose-700">
                      <LogOut className="mr-2 h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>

          <SidebarInset className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-transparent">
            <header className="print-hidden sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-white/70 bg-white/62 px-4 backdrop-blur-xl md:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger className="rounded-xl text-teal-800 hover:bg-white" />
                <div className="hidden h-7 w-px bg-teal-100 sm:block" />
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-bold text-slate-900">
                    Department of {department.name}
                  </p>
                  <p className="truncate text-[11px] font-medium text-slate-500">
                    {activeRole} workspace
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeRole === "Student" && (
                  <Button
                    data-tour-id="print-logbook"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/print', '_blank')}
                    title="Print the complete consolidated record."
                    className="hidden border-white/70 bg-white/75 text-teal-800 shadow-[0_12px_24px_rgba(15,23,42,0.05)] sm:inline-flex"
                  >
                    <Printer className="h-4 w-4 mr-2" /> Print PDF
                  </Button>
                )}
                <Button
                  ref={tourButtonRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTourOpen(true)}
                  aria-label="Take a guided tour"
                  title="Take a guided tour"
                  className="h-8 w-8 border-white/70 bg-white/75 px-0 text-sm font-bold text-teal-800 shadow-[0_12px_24px_rgba(15,23,42,0.05)]"
                >
                  ?
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button data-tour-id="notifications" aria-label="Open notifications" className="relative rounded-xl border border-white/70 bg-white/72 p-2 text-teal-800 shadow-[0_12px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:bg-white">
                      <Bell className="h-4 w-4" />
                      {notifItems.length > 0 && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 rounded-2xl border-white/70 bg-white/92 p-2 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                    <DropdownMenuLabel className="px-3 pt-2">Notifications</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {notifItems.length > 0 ? (
                      notifItems.map((item) => (
                        <DropdownMenuItem
                          key={item.id}
                          onClick={() => {
                            item.onDismiss?.();
                            setNotifItems((prev) => prev.filter((i) => i.id !== item.id));
                            setLocation(item.href);
                          }}
                          className="cursor-pointer rounded-xl px-3 py-2 text-xs font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-900 transition-colors"
                        >
                          {item.text}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem className="rounded-xl px-3 py-2 text-slate-500 text-xs">No new notifications</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            <main className="mx-auto w-full max-w-[1380px] flex-1 p-4 md:p-6 lg:p-8">
              <div className="print-only mb-6 border-b border-slate-300 pb-4">
                <p className="page-eyebrow">Department of {department.name}</p>
                <h1 className="mt-1 text-2xl font-bold">Resident Training Record</h1>
              </div>
              {children}
            </main>
          </SidebarInset>
          <Toaster position="top-right" richColors />

          <Dialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen}>
            <DialogContent className="sm:max-w-md rounded-[20px]">
              <DialogHeader>
                <DialogTitle>Change Password</DialogTitle>
                <DialogDescription>Update your account password securely.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleChangePasswordSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input type="password" value={cpForm.currentPassword} onChange={e => setCpForm({...cpForm, currentPassword: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" minLength={8} value={cpForm.newPassword} onChange={e => setCpForm({...cpForm, newPassword: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input type="password" minLength={8} value={cpForm.confirmPassword} onChange={e => setCpForm({...cpForm, confirmPassword: e.target.value})} required />
                </div>
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsChangePasswordOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={changingPassword}>{changingPassword ? "Saving..." : "Change Password"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <GuidedTour open={isTourOpen} steps={tourSteps} onClose={closeTour} />
        </div>
      </div>
    </SidebarProvider>
  );
}

