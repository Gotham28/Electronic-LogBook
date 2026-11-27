import * as React from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
import { isDemoMode } from "@/lib/session";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useNameChangeNotifications } from "@/hooks/use-name-change-notifications";
import { DEMO_DEPARTMENT_CHANGED_EVENT } from "@/lib/demoDepartments";
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
  ChevronDown,
  ClipboardCheck,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Presentation,
  Printer,
  Stethoscope,
  Trophy,
  UserCheck,
  UserPlus,
  UserRound,
} from "lucide-react";

import { LegalDisclaimerModal } from "@/components/LegalDisclaimerModal";
import { ArogyaPanel } from "@/components/arogya/ArogyaPanel";
import { AROGYA_OPEN_EVENT } from "@/lib/arogya-context";
import { MaintenanceNoticeBubble } from "@/components/arogya/MaintenanceNoticeBubble";
import { useDepartment, defaultDepartmentLabel, resolveDepartmentLabel, type DepartmentLabelKey } from "@/lib/department-context";
import type { AcademicLogbookProfile } from "@/lib/academic-logbook";
import { applyNavOrder, navigationIsActive, profileNavigation, readStudentNavOrder } from "@/lib/academic-navigation";
import { MobileBottomNav, type MobileAddLogOption } from "@/components/layout/MobileBottomNav";
import { attachCreateIntentScopeToHistory, buildCreateIntentHref, dispatchLogCreateIntent, getCurrentLogCreateScope, isLogCreateEligible, type LogCreateActionId } from "@/lib/log-create-navigation";
import { DemoBanner } from "@/components/layout/DemoBanner";

export type RoleType = "Student" | "Faculty" | "HOD";

type MaintenanceAnnouncement = {
  id: number;
  title: string;
  message: string;
  startAt: string;
  endAt: string;
  status: "scheduled" | "active";
  updatedAt: string;
};

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
  activePaths?: string[];
};

export function navigationForRole(role: RoleType, dashboardData?: any, loadingBadges?: boolean, config?: any, demoMode = false, academicLogbook?: AcademicLogbookProfile | null, department?: any, label?: (key: DepartmentLabelKey) => string, overrides?: Record<string, string>): NavigationItem[] {
  // Titles for the two label-driven entries; the registry default applies when no label function is passed.
  const postingsTitle = label ? label("nav.postings") : defaultDepartmentLabel("nav.postings");
  const milestonesTitle = label ? label("nav.milestones") : defaultDepartmentLabel("nav.milestones", { useThesisAndMandatoryCertificationsLabel: Boolean(config?.enabledFeatures?.useThesisAndMandatoryCertificationsLabel) });
  if (role === "Faculty") {
    const items: NavigationItem[] = [
      { title: "Dashboard", icon: LayoutDashboard, href: "/", activePaths: ["/dashboard"] },
      { title: "Evaluation Queue", icon: FileText, href: "/review-queue" },
      { title: "Student Progress", icon: UserCheck, href: "/mentees" },
      { title: "Assessments", icon: ClipboardCheck, href: "/assessments" },
    ];
    if (config?.enabledFeatures?.yearlyAttendance || config?.enabledFeatures?.dailyAttendance) {
      items.push({ title: config?.enabledFeatures?.yearlyAttendance ? "Yearly Attendance" : "Daily Attendance", icon: CalendarDays, href: "/daily-attendance" });
    }
    return items;
  }

  if (role === "HOD") {
    const items: NavigationItem[] = [
      { title: "Dashboard", icon: GraduationCap, href: "/roster" },
      { title: "Student Progress", icon: UserCheck, href: "/mentees" },
      { title: "Review Queue", icon: FileText, href: "/review-queue" },
      { title: "Add Assessment", icon: ClipboardCheck, href: "/assessments" },
      { title: "Pending Students", icon: UserPlus, href: "/student-access" },
      { title: "Add Faculty", icon: UserCheck, href: "/professors" },
    ];
    if (config?.enabledFeatures?.yearlyAttendance || config?.enabledFeatures?.dailyAttendance) {
      items.push({ title: config?.enabledFeatures?.yearlyAttendance ? "Yearly Attendance" : "Daily Attendance", icon: CalendarDays, href: "/daily-attendance" });
    }
    items.push({ title: "Requirements", icon: ClipboardCheck, href: "/requirements" });
    return items;
  }

  const features = config?.enabledFeatures ?? {};
  const attendance: NavigationItem | undefined = features.yearlyAttendance || features.dailyAttendance
    ? { title: features.yearlyAttendance ? "Yearly Attendance" : "Attendance", icon: CalendarDays, href: "/attendance" }
    : undefined;
  const academicNavigation = profileNavigation(academicLogbook);
  if (academicNavigation) {
    const icons: Record<string, NavigationItem["icon"]> = {
      dashboard: LayoutDashboard, teaching: GraduationCap, practicals: Stethoscope,
      research: Presentation, assessments: ClipboardCheck, daily: CalendarDays, certifications: Award,
    };
    return [...academicNavigation.map((item) => ({ ...item, icon: icons[item.icon] })), ...(attendance ? [attendance] : [])];
  }

  const getCount = (id: string) => {
    if (!dashboardData) return undefined;
    const cat = dashboardData.categories?.find((c: any) => c.id === id);
    if (!cat) return undefined;

    const required = id === "cases" ? config?.requiredCases : id === "procedures" ? config?.requiredProcedures : id === "academics" ? config?.requiredAcademic : null;
    
    if (required === null || required === undefined) {
      return `${cat.logged}`;
    }
    return `${cat.logged}/${required}`;
  };

  // A department that lists academic activities before its logs (the academicsFirstInNav setting).
  if (features.academicsFirstInNav) {
    const dermItems: NavigationItem[] = [];
    dermItems.push({ title: "Dashboard", icon: LayoutDashboard, href: "/" });
    dermItems.push({ title: "Academic Activities", icon: GraduationCap, href: "/academics" });
    if (!demoMode || !features.hideCaseLogs) {
      dermItems.push({ title: "Case Logs", icon: FileText, href: "/cases", badge: getCount("cases"), badgeLoading: loadingBadges });
    }
    if (!demoMode || !features.hideProcedureLogs) {
      dermItems.push({ title: "Procedure Logs", icon: Stethoscope, href: "/procedures", badge: getCount("procedures"), badgeLoading: loadingBadges });
    }
    if (demoMode && features.clinicalWorks) {
      dermItems.push({ title: "Clinical Work", icon: Stethoscope, href: "/clinical-works", badge: getCount("clinicalWorks"), badgeLoading: loadingBadges });
    }
    if (config?.enabledFeatures?.attendedConferences) {
      dermItems.push({ title: "Conferences and CME", icon: Presentation, href: "/conferences" });
    }
    if (config?.enabledFeatures?.splitThesisAndCertifications) {
      dermItems.push({ title: (config?.enabledFeatures?.useThesisAndPublicationsLabel || config?.enabledFeatures?.publicationsOnly) ? "Thesis and Publications" : "Thesis", icon: FileText, href: "/thesis" });
    } else {
      // This branch has always shown the fixed "Thesis & Certifications", whatever the wording flag says.
      // An override still applies; with none, resolving without the flag gives that fixed default.
      dermItems.push({ title: resolveDepartmentLabel("nav.milestones", overrides), icon: Award, href: "/milestones" });
    }
    dermItems.push({ title: "Assessments", icon: ClipboardCheck, href: "/assessments" });
    dermItems.push({ title: postingsTitle, icon: CalendarDays, href: "/postings" });
    if (config?.enabledFeatures?.splitThesisAndCertifications) {
      dermItems.push({ title: "Certifications", icon: Award, href: "/certifications" });
    }
    if (config?.enabledFeatures?.awards) {
      dermItems.push({ title: "Awards and Achievements", icon: Trophy, href: "/awards" });
    }
    if (attendance) dermItems.push(attendance);
    return dermItems;
  }

  const items: NavigationItem[] = [
    { title: "Dashboard", icon: LayoutDashboard, href: "/" },
    { title: postingsTitle, icon: CalendarDays, href: "/postings" },
  ];
  if (!features.hideCaseLogs) {
    items.push({ title: "Case Logs", icon: FileText, href: "/cases", badge: getCount("cases"), badgeLoading: loadingBadges });
  }
  if (!features.hideProcedureLogs) {
    items.push({ title: "Procedure Logs", icon: Stethoscope, href: "/procedures", badge: getCount("procedures"), badgeLoading: loadingBadges });
  }
  if (features.clinicalWorks) {
    items.push({ title: "Clinical Work", icon: Stethoscope, href: "/clinical-works", badge: getCount("clinicalWorks"), badgeLoading: loadingBadges });
  }
  items.push({ title: "Academic Activities", icon: GraduationCap, href: "/academics" });

  if (config?.enabledFeatures?.attendedConferences) {
    items.push({ title: "CME and Conferences", icon: Presentation, href: "/conferences" });
  }

  items.push({ title: "Assessments", icon: ClipboardCheck, href: "/assessments" });

  if (config?.enabledFeatures?.splitThesisAndCertifications) {
    items.push({ title: (config?.enabledFeatures?.useThesisAndPublicationsLabel || config?.enabledFeatures?.publicationsOnly) ? "Thesis and Publications" : "Thesis", icon: FileText, href: "/thesis" });
    items.push({ title: "Certifications", icon: Award, href: "/certifications" });
  } else {
    items.push({ title: milestonesTitle, icon: Award, href: "/milestones" });
  }

  if (attendance) items.push(attendance);

  return items;
}

function assistantWorkflowForPath(path: string, role: RoleType): string | undefined {
  const page = path.split("?")[0];
  if (page.startsWith("/academics/")) return "academics";
  if (page === "/" || page === "/dashboard") return role === "Faculty" ? "student-progress" : role === "HOD" ? "department-dashboard" : "dashboard";
  if (page === "/review-queue") return role === "Faculty" ? "evaluation-queue" : "review-queue";
  const map: Record<string, string> = {
    "/cases": "cases", "/procedures": "procedures", "/clinical-works": "clinical-work",
    "/academics": "academics", "/conferences": "conferences", "/postings": "postings",
    "/assessments": role === "Student" ? "assessments" : "quarterly-appraisal",
    "/milestones": "milestones", "/thesis": "thesis", "/certifications": "certifications",
    "/awards": "awards", "/mentees": role === "Faculty" ? "student-progress" : "department-dashboard",
    "/review-queue": "review-queue", "/roster": "department-dashboard", "/student-access": "student-approval",
    "/professors": "faculty-management", "/requirements": "requirements",
  };
  return map[page];
}

export function AppLayout({
  children,
  activeRole,
  onSignOut,
}: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { department, config, academicLogbook, label, labels, clinicalWorkCategories, academics } = useDepartment();
  const demoMode = isDemoMode();
  const reduceMotion = useReducedMotion();
  const [isDepartmentSwitching, setIsDepartmentSwitching] = React.useState(false);
  const [dashboardData, setDashboardData] = React.useState<any>(null);
  const [loadingBadges, setLoadingBadges] = React.useState(activeRole === "Student");

  const [isChangePasswordOpen, setIsChangePasswordOpen] = React.useState(false);
  const [cpForm, setCpForm] = React.useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [changingPassword, setChangingPassword] = React.useState(false);
  const [arogyaOpen, setArogyaOpen] = React.useState(false);
  const [disclaimerBlocksNotice, setDisclaimerBlocksNotice] = React.useState(activeRole === "Student");
  const loginSummaryShownRef = React.useRef(false);
  const [announcements, setAnnouncements] = React.useState<MaintenanceAnnouncement[]>([]);
  const [bubbleNotice, setBubbleNotice] = React.useState<MaintenanceAnnouncement | null>(null);
  const [maintenanceLoadError, setMaintenanceLoadError] = React.useState<string | null>(null);
  const [maintenanceRefreshToken, setMaintenanceRefreshToken] = React.useState(0);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);

  // Notification item type
  type NotifItem = {
    id: string;
    text: string;
    href: string;
    onDismiss?: () => void;
  };

  // Notification state — populated by the effects below, never fabricated (§7)
  const [notifItems, setNotifItems] = React.useState<NotifItem[]>([]);

  React.useEffect(() => {
    const onDepartmentChange = () => setIsDepartmentSwitching(true);
    window.addEventListener(DEMO_DEPARTMENT_CHANGED_EVENT, onDepartmentChange);
    return () => window.removeEventListener(DEMO_DEPARTMENT_CHANGED_EVENT, onDepartmentChange);
  }, []);

  React.useEffect(() => {
    const onOpenArogya = () => setArogyaOpen(true);
    window.addEventListener(AROGYA_OPEN_EVENT, onOpenArogya);
    return () => window.removeEventListener(AROGYA_OPEN_EVENT, onOpenArogya);
  }, []);

  // Fix: Get actual user from session for the sidebar profile
  const currentUser = useCurrentUser();
  const savedNameNotices = useNameChangeNotifications(currentUser, activeRole === "HOD");
  const currentActiveNotice = announcements.find((announcement) => announcement.status === "active") ?? null;
  const panelMaintenanceNotice = currentActiveNotice ?? announcements.find((announcement) => announcement.status === "scheduled") ?? null;
  const allNotifItems = React.useMemo<NotifItem[]>(() => [
    ...notifItems,
    ...announcements.map((announcement) => ({
      id: `maintenance_${announcement.id}`,
      text: `${announcement.title}: ${announcement.message}`,
      href: "#",
    })),
  ], [notifItems, announcements]);
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
          const { caseLogs = [], procedureLogs = [], academicLogs = [], clinicalWorkLogs = [] } = logsRes.value;
          const rejectedCases = caseLogs.filter((l: any) => l.status === "rejected").length;
          const rejectedProcs = procedureLogs.filter((l: any) => l.status === "rejected").length;
          const rejectedAcads = academicLogs.filter((l: any) => l.status === "rejected").length;
          const rejectedClinical = clinicalWorkLogs.filter((l: any) => l.status === "rejected").length;
          const rejectedTotal = rejectedCases + rejectedProcs + rejectedAcads + rejectedClinical;
          const features = config?.enabledFeatures ?? {};
          const rejectedHref = rejectedCases > 0 && !features.hideCaseLogs ? "/cases"
            : rejectedClinical > 0 && features.clinicalWorks ? "/clinical-works"
            : rejectedProcs > 0 && !features.hideProcedureLogs ? "/procedures"
            : rejectedAcads > 0 ? "/academics" : "/";

          if (rejectedTotal > 0) {
            items.push({
              id: "rejected_logs",
              text: `${rejectedTotal} log ${rejectedTotal === 1 ? "entry" : "entries"} returned for revision`,
              href: rejectedHref,
            });
          }
        }

        setNotifItems(items);

        if (sessionStorage.getItem("elogbook-login-summary-pending") === "true" && !loginSummaryShownRef.current) {
          loginSummaryShownRef.current = true;
          sessionStorage.removeItem("elogbook-login-summary-pending");
          if (items.length > 0) {
            toast.info(items.map(i => i.text).join(" · "), { duration: 6000 });
          }
        }
      } catch {
        /* fail silently - no fabricated numbers (§7) */
      }
    })();
    return () => { cancelled = true; };
  }, [activeRole, currentUser?.studentProfileId]);

  // Faculty / HOD: load action-required items
  React.useEffect(() => {
    if (!currentUser) return;
    if (activeRole !== "Faculty" && activeRole !== "HOD") return;
    let cancelled = false;
    (async () => {
      const items: NotifItem[] = [];
      if (activeRole === "Faculty") {
        try {
          // The review queue is an object; the items to review are in pendingReviews.
          const queue = await apiGet<{ pendingReviews?: unknown[] }>(`/api/professors/${currentUser.id}/review-queue`);
          const n = Array.isArray(queue?.pendingReviews) ? queue.pendingReviews.length : 0;
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
        const [ps, queue] = await Promise.allSettled([
          apiGet<any[]>("/api/admin/students/pending"),
          apiGet<{ pendingReviews?: unknown[] }>(`/api/professors/${currentUser.id}/review-queue`),
        ]);
        const sc = ps.status === "fulfilled" && Array.isArray(ps.value) ? ps.value.length : 0;
        const n = queue.status === "fulfilled" && Array.isArray(queue.value?.pendingReviews) ? queue.value.pendingReviews.length : 0;
        if (sc > 0) {
          items.push({
            id: "hod_pending_students",
            text: `${sc} student${sc === 1 ? "" : "s"} awaiting approval`,
            href: "/student-access",
          });
        }
        if (n > 0) {
          items.push({
            id: "faculty_queue",
            text: `${n} log${n === 1 ? "" : "s"} pending your review`,
            href: "/review-queue",
          });
        }
      }
      if (!cancelled) {
        setNotifItems(items);
        if (sessionStorage.getItem("elogbook-login-summary-pending") === "true" && !loginSummaryShownRef.current) {
          loginSummaryShownRef.current = true;
          sessionStorage.removeItem("elogbook-login-summary-pending");
          if (items.length > 0) {
            toast.info(items.map(i => i.text).join(" · "), { duration: 6000 });
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeRole, currentUser?.id]);


  const studentNavOrder = React.useMemo(
    () => (activeRole === "Student" ? readStudentNavOrder(config?.enabledFeatures) : []),
    [activeRole, config?.enabledFeatures],
  );
  const navigationItems = React.useMemo(() => {
    const items = navigationForRole(activeRole, dashboardData, loadingBadges, config, demoMode, academicLogbook, department, label, labels)
      .map((item) => (item.href === "/academics" && academicLogbook ? { ...item, title: academicLogbook.title } : item));
    if ((activeRole === "Faculty" || activeRole === "HOD") && !demoMode && config?.enabledFeatures?.psychiatryWorkspace) {
      items.splice(1, 0, { title: "Psychiatry reviews", icon: FileText, href: "/psychiatry/reviews" });
    }
    return studentNavOrder.length ? applyNavOrder(items, studentNavOrder) : items;
  }, [activeRole, dashboardData, loadingBadges, config, demoMode, academicLogbook, department, label, labels, studentNavOrder]);
  const hasCustomStudentOrder = React.useMemo(
    () => activeRole === "Student" && studentNavOrder.some((href) => href !== "/" && navigationItems.some((item) => item.href === href)),
    [activeRole, studentNavOrder, navigationItems],
  );
  const visibleNavigationItems = isDepartmentSwitching ? [] : navigationItems;
  const studentAddLogOptions = React.useMemo<MobileAddLogOption[]>(() => {
    if (activeRole !== "Student" || isDepartmentSwitching || !config) return [];
    const options: MobileAddLogOption[] = [];
    const seenIds = new Set<string>();

    const pushOption = (option: MobileAddLogOption) => {
      if (seenIds.has(option.id)) return;
      seenIds.add(option.id);
      options.push(option);
    };

    const tryPush = (id: string, labelText: string, href: string, action: LogCreateActionId, icon: React.ComponentType<{ className?: string }>) => {
      if (!isLogCreateEligible({
        action,
        targetPath: href,
        isStudent: true,
        config,
        demoMode,
        academicLogbook,
        academics,
        clinicalWorkCategoriesCount: clinicalWorkCategories.length,
      })) {
        return;
      }
      pushOption({ id, label: labelText, href, action, icon });
    };

    const addForRoute = (href: string, labelText: string, icon: React.ComponentType<{ className?: string }>) => {
      if (href === "/" || href === "/dashboard" || href === "/assessments") return;
      if (href === "/cases") {
        tryPush("case", labelText, href, "case", icon);
        return;
      }
      if (href === "/procedures") {
        tryPush("procedure", labelText, href, "procedure", icon);
        return;
      }
      if (href === "/clinical-works") {
        tryPush("clinical-work", labelText, href, "clinical-work", icon);
        return;
      }
      if (href === "/academics" || href.startsWith("/academics/")) {
        tryPush(href, labelText, href, "academic", icon);
        return;
      }
      if (href === "/conferences") {
        tryPush("conference", labelText, href, "conference", icon);
        return;
      }
      if (href === "/postings") {
        tryPush("posting", labelText, href, "posting", icon);
        return;
      }
      if (href === "/awards") {
        tryPush("award", labelText, href, "award", icon);
        return;
      }
      if (href === "/certifications") {
        tryPush("certification", labelText, href, "certification", icon);
        return;
      }
      if (href === "/thesis") {
        tryPush("thesis", labelText, href, "thesis", icon);
        return;
      }
      if (href === "/milestones") {
        tryPush("milestone-thesis", `${labelText} — Thesis`, href, "milestone-thesis", FileText);
        tryPush("milestone-certification", `${labelText} — Certification`, href, "milestone-certification", Award);
        return;
      }
    };

    for (const item of navigationItems) {
      addForRoute(item.href, item.title, item.icon);
      if (item.href.startsWith("/academics/") && academicLogbook) {
        const categoryId = item.href.slice("/academics/".length);
        const category = academicLogbook.navigationCategories?.find((c) => c.id === categoryId);
        for (const related of category?.relatedPages ?? []) {
          addForRoute(related.href, related.title, item.icon);
        }
      }
    }

    return options;
  }, [activeRole, isDepartmentSwitching, config, demoMode, navigationItems, academicLogbook, academics, clinicalWorkCategories.length]);

  const handleMobileAddLogSelect = React.useCallback((option: MobileAddLogOption) => {
    if (isDepartmentSwitching || !config) return;
    const scope = getCurrentLogCreateScope();
    if (!scope) return;
    const currentPath = typeof window !== "undefined" ? window.location.pathname : location;
    if (currentPath === option.href) {
      if (typeof window !== "undefined") {
        const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.history.replaceState(window.history.state, "", buildCreateIntentHref(currentUrl, option.action));
        attachCreateIntentScopeToHistory(option.action, scope);
      }
      dispatchLogCreateIntent(option.action, option.href, scope);
      return;
    }
    setLocation(buildCreateIntentHref(option.href, option.action));
    attachCreateIntentScopeToHistory(option.action, scope);
  }, [config, isDepartmentSwitching, location, setLocation]);

  
  React.useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const data = await apiGet<MaintenanceAnnouncement[]>("/api/announcements/current");
        if (cancelled) return;
        setAnnouncements(data);
        setMaintenanceLoadError(null);
      } catch {
        if (!cancelled) setMaintenanceLoadError("Maintenance notice status could not be checked. Retry to check again.");
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUser?.id, maintenanceRefreshToken]);

  React.useEffect(() => {
    if (!currentActiveNotice) {
      setBubbleNotice(null);
      return;
    }
    if (!currentUser || disclaimerBlocksNotice || arogyaOpen) return;
    const key = `elogbook-maintenance-notice-shown_${currentUser.id}_${currentActiveNotice.id}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "shown");
    setBubbleNotice(currentActiveNotice);
  }, [currentActiveNotice?.id, currentActiveNotice?.updatedAt, currentUser?.id, disclaimerBlocksNotice, arogyaOpen]);

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
      <div className="h-screen w-full overflow-hidden bg-mist p-0 text-ink md:p-3 lg:p-4">
        <div className="glass-panel mx-auto flex h-[100dvh] w-full max-w-[1600px] overflow-hidden rounded-none border-line-soft bg-mist md:h-[calc(100vh-24px)] md:rounded-[30px] lg:h-[calc(100vh-32px)]">
          <Sidebar collapsible="icon" className="print-hidden border-r border-line-soft bg-white/95 shadow-[0_24px_80px_color-mix(in_srgb,var(--gothos-forest)_6%,transparent)] backdrop-blur-xl">
            <SidebarHeader className="h-[74px] overflow-hidden border-b border-line-soft p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
              <div className="relative flex h-full w-full items-center overflow-hidden group-data-[collapsible=icon]:justify-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--gothos-forest)_20%,transparent)] transition-colors duration-200" style={demoMode ? { backgroundColor: "var(--demo-accent)", color: "var(--demo-accent-foreground)" } : undefined}>
                  <BookOpenCheck className="h-6 w-6" />
                </div>
                <div className="absolute left-[52px] top-1/2 w-[180px] -translate-y-1/2 whitespace-nowrap transition-opacity duration-150 group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
                  <p className="font-display text-lg font-bold leading-tight text-ink">E-Logbook</p>
                  <p className="mt-0.5 text-[11px] font-medium text-helper">Clinical training records</p>
                </div>
              </div>
            </SidebarHeader>

            <SidebarContent className="p-2">
              <SidebarGroup>
                <SidebarGroupLabel className="mb-2 h-8! px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-forest group-data-[collapsible=icon]:mt-0! group-data-[collapsible=icon]:opacity-0" style={demoMode ? { color: "var(--demo-accent)" } : undefined}>
                  {activeRole} workspace
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    <AnimatePresence>
                    {visibleNavigationItems.map((item, index) => {
                      const isActive = navigationIsActive(location, item);
                      const Icon = item.icon;
                      const menuButton = (
                        <SidebarMenuButton
                          data-tour-id={`navigation-${index}`}
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                          className={`h-11 w-full rounded-xl px-3 transition-all duration-200 group-data-[collapsible=icon]:mx-auto! group-data-[collapsible=icon]:h-11! group-data-[collapsible=icon]:w-11! group-data-[collapsible=icon]:p-0! ${
                            isActive
                              ? "border border-card-edge font-semibold shadow-[0_16px_36px_color-mix(in_srgb,var(--gothos-forest)_22%,transparent)] data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:hover:bg-deep data-[active=true]:hover:text-sidebar-primary-foreground"
                              : "text-soft-ink hover:border hover:border-card-edge hover:bg-card hover:text-forest"
                          }`}
                          style={demoMode && isActive ? { backgroundColor: "var(--demo-accent)", color: "var(--demo-accent-foreground)" } : undefined}
                        >
                          <Link href={item.href} aria-current={isActive ? "page" : undefined} data-demo-target={`nav:${item.href}`} data-demo-navigation-href={item.href} className="flex w-full items-center gap-3 group-data-[collapsible=icon]:justify-center">
                            <Icon className={`h-4 w-4 ${isActive ? (demoMode ? "text-[var(--demo-accent-foreground)]" : "text-white") : demoMode ? "text-[var(--demo-accent)]" : "text-forest"}`} />
                            <span className="flex-1 truncate text-[13px] group-data-[collapsible=icon]:hidden">{item.title}</span>

                            {item.badgeLoading ? (
                              <Skeleton className="h-4 w-12 rounded-full bg-sage group-data-[collapsible=icon]:hidden" />
                            ) : item.badge ? (
                              <Badge
                                variant="outline"
                                className={`rounded-full px-1.5 py-0 text-[9px] group-data-[collapsible=icon]:hidden ${
                                  isActive
                                    ? demoMode ? "border-white/25 bg-white/15 text-[var(--demo-accent-foreground)]" : "border-white/25 bg-white/15 text-white"
                                    : item.badgeColor || "border-line-soft bg-mist text-forest"
                                }`}
                              >
                                {item.badge}
                              </Badge>
                            ) : null}
                          </Link>
                        </SidebarMenuButton>
                      );
                      return (
                        demoMode ? (
                          <motion.li
                            key={`${department.id}-${item.href}`}
                            className="group/menu-item relative"
                            initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8, transition: { duration: 0.12 } }}
                            transition={{ duration: reduceMotion ? 0 : 0.16, delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.2) }}
                          >
                            {menuButton}
                          </motion.li>
                        ) : (
                          <SidebarMenuItem key={item.href}>{menuButton}</SidebarMenuItem>
                        )
                      );
                    })}
                    </AnimatePresence>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="sticky bottom-0 z-20 mt-auto border-t border-card-edge bg-card p-3 backdrop-blur-md">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button data-tour-id="account-menu" className="flex w-full items-center gap-3 rounded-2xl border border-card-edge bg-card p-2.5 text-left shadow-[0_14px_30px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)] transition hover:-translate-y-0.5 hover:bg-white">
                    <Avatar className="h-10 w-10 border border-line-soft">
                      <AvatarFallback className="bg-sage text-xs font-bold text-forest">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                      <p className="truncate text-xs font-bold text-ink">{displayName}</p>
                      <p className="truncate text-[10px] font-semibold text-forest">{activeRole} portal</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-forest group-data-[collapsible=icon]:hidden" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 rounded-2xl border-card-edge bg-card p-1 shadow-[0_24px_60px_color-mix(in_srgb,var(--gothos-forest)_12%,transparent)] backdrop-blur-xl">
                  <DropdownMenuItem asChild className="cursor-pointer rounded-xl text-xs"><Link href="/profile"><UserRound className="mr-2 h-4 w-4" />My Profile</Link></DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsChangePasswordOpen(true)} className="cursor-pointer rounded-xl text-xs">
                    <KeyRound className="mr-2 h-4 w-4" /> Change Password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {onSignOut && (
                    <DropdownMenuItem onClick={onSignOut} className="cursor-pointer rounded-xl text-xs text-status-foreground">
                      <LogOut className="mr-2 h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>

          <SidebarInset className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-transparent">
            <header className="print-hidden sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-line-soft bg-white/90 px-4 backdrop-blur-xl md:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger data-demo-sidebar-trigger className="rounded-xl text-forest hover:bg-white" />
                <div className="hidden h-7 w-px bg-sage sm:block" />
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-bold text-ink">
                    Department of {department.name}
                  </p>
                  <p className="truncate text-[11px] font-medium text-helper">
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
                    className="border-card-edge bg-card text-forest shadow-[0_12px_24px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)] h-8 w-8 px-0 sm:w-auto sm:px-3"
                  >
                    <Printer className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Print</span>
                  </Button>
                )}
                <DropdownMenu open={notificationsOpen} onOpenChange={(open) => {
                  setNotificationsOpen(open);
                  if (open && activeRole === "HOD") void savedNameNotices.refresh();
                }}>
                  <DropdownMenuTrigger asChild>
                    <button data-tour-id="notifications" aria-label="Open notifications" className="relative rounded-xl border border-card-edge bg-card p-2 text-forest shadow-[0_12px_24px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)] transition hover:-translate-y-0.5 hover:bg-white">
                      <Bell className="h-4 w-4" />
                      {(allNotifItems.length > 0 || (activeRole === "HOD" && savedNameNotices.unreadCount > 0)) && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive ring-2 ring-white" />
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 rounded-2xl border-card-edge bg-card p-2 shadow-[0_24px_60px_color-mix(in_srgb,var(--gothos-forest)_12%,transparent)] backdrop-blur-xl">
                    <DropdownMenuLabel className="px-3 pt-2">Notifications</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {activeRole === "HOD" ? <>
                      <DropdownMenuLabel className="px-3 py-1 text-[10px] uppercase tracking-wide text-helper">Saved name changes{savedNameNotices.unreadCount > 0 ? ` · ${savedNameNotices.unreadCount} unread` : ""}</DropdownMenuLabel>
                      {savedNameNotices.error ? <div role="alert" className="mx-2 my-1 rounded-lg bg-status p-2 text-xs text-status-foreground">Unable to refresh saved notices. <button type="button" className="ml-1 font-semibold underline" onClick={() => void savedNameNotices.refresh()}>Retry</button></div> : null}
                      {savedNameNotices.loading && !savedNameNotices.hasLoaded ? <p role="status" className="px-3 py-2 text-xs text-helper">Loading saved notices…</p> : null}
                      {savedNameNotices.hasLoaded && savedNameNotices.items.length === 0 && !savedNameNotices.error ? <p className="px-3 py-2 text-xs text-helper">No unread name-change notices.</p> : null}
                      {savedNameNotices.items.map((item) => <DropdownMenuItem key={item.id} onClick={() => setLocation(item.detailHref)} className="cursor-pointer rounded-xl px-3 py-2 text-xs font-medium text-ink hover:bg-mist hover:text-forest">
                        <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-forest" aria-hidden="true" />{item.previousName} → {item.newName}<span className="ml-auto text-[10px] text-helper">View</span>
                      </DropdownMenuItem>)}
                      <DropdownMenuItem onClick={() => setLocation("/notifications")} className="cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold text-forest">View all updates</DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </> : null}
                    {maintenanceLoadError && <div role="alert" className="mx-2 my-1 rounded-lg bg-status p-2 text-xs text-status-foreground">
                      {maintenanceLoadError} <button type="button" className="ml-1 font-semibold underline" onClick={() => setMaintenanceRefreshToken((value) => value + 1)}>Retry</button>
                    </div>}
                    {allNotifItems.length > 0 ? (
                      allNotifItems.map((item) => (
                        <DropdownMenuItem
                          key={item.id}
                          onClick={() => {
                            if (item.id.startsWith("maintenance_")) {
                              setArogyaOpen(true);
                              return;
                            }
                            item.onDismiss?.();
                            setNotifItems((prev) => prev.filter((i) => i.id !== item.id));
                            setLocation(item.href);
                          }}
                          className="cursor-pointer rounded-xl px-3 py-2 text-xs font-medium text-ink hover:bg-mist hover:text-forest transition-colors"
                        >
                          {item.text}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem className="rounded-xl px-3 py-2 text-helper text-xs">{activeRole === "HOD" ? "No other notifications" : "No new notifications"}</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            <main data-demo-page={location} className="mx-auto w-full max-w-[1380px] flex-1 p-4 pb-28 sm:pb-4 md:p-6 lg:p-8">
              {maintenanceLoadError && <div role="alert" className="mb-4 rounded-xl border border-status-border bg-status px-4 py-3 text-sm text-status-foreground">
                {maintenanceLoadError} <button type="button" className="ml-2 font-semibold underline" onClick={() => setMaintenanceRefreshToken((value) => value + 1)}>Retry</button>
              </div>}
                <DemoBanner />
              <div className="print-only mb-6 border-b border-input pb-4">
                <p className="page-eyebrow">Department of {department.name}</p>
                <h1 className="mt-1 text-2xl font-bold">Resident Training Record</h1>
              </div>
              {demoMode && reduceMotion === false ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={location}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              ) : children}
            </main>
          </SidebarInset>
          <MobileBottomNav
            role={activeRole}
            items={navigationItems}
            location={location}
            departmentKey={department.id}
            switching={isDepartmentSwitching}
            hasCustomOrder={hasCustomStudentOrder}
            addLogOptions={studentAddLogOptions}
            onAddLogSelect={handleMobileAddLogSelect}
          />
          <Toaster position="top-right" richColors />

          <ArogyaPanel 
            key={`${currentUser?.id ?? "signed-out"}:${currentUser?.departmentId ?? department.id}:${activeRole}:${demoMode ? "demo" : "live"}`}
            open={arogyaOpen}
            onOpenChange={setArogyaOpen}
            role={activeRole}
            actorKey={`${currentUser?.id ?? "signed-out"}:${currentUser?.departmentId ?? department.id}:${activeRole}:${demoMode ? "demo" : "live"}`}
            workflowId={assistantWorkflowForPath(location, activeRole)}
            studentProfileId={currentUser?.studentProfileId ?? undefined}
            notifItems={allNotifItems}
            maintenanceNotice={panelMaintenanceNotice}
            onNavigate={(href) => setLocation(href)}
          />

          {bubbleNotice && !arogyaOpen && !disclaimerBlocksNotice && <MaintenanceNoticeBubble
            heading={bubbleNotice.title}
            message={bubbleNotice.message}
            onOpen={() => setArogyaOpen(true)}
            onDismiss={() => setBubbleNotice(null)}
          />}

          {maintenanceLoadError && !arogyaOpen && !bubbleNotice && <div role="alert" className="print:hidden fixed bottom-[calc(144px+env(safe-area-inset-bottom))] right-4 z-40 max-w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-status-border bg-white p-3 text-xs text-status-foreground shadow-lg sm:bottom-24 sm:right-6">
            {maintenanceLoadError} <button type="button" className="ml-1 font-semibold underline" onClick={() => setMaintenanceRefreshToken((value) => value + 1)}>Retry</button>
          </div>}

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
          <LegalDisclaimerModal activeRole={activeRole} onBlockingChange={setDisclaimerBlocksNotice} />
        </div>
      </div>
    </SidebarProvider>
  );
}

