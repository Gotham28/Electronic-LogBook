import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { AppLayout, type RoleType } from "@/components/layout/AppLayout";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { Dashboard } from "@/components/Dashboard";
import { ProfessorPortal } from "@/components/ProfessorPortal";
import { HODPortal } from "@/components/HODPortal";
import { AdminPortal } from "@/components/AdminPortal";
import { LoginPage } from "@/components/LoginPage";
import { RegistrationPage } from "@/components/RegistrationPage";
import { CaseLogsPage } from "@/components/pages/CaseLogsPage";
import { ProcedureLogsPage } from "@/components/pages/ProcedureLogsPage";
import { AcademicLogsPage } from "@/components/pages/AcademicLogsPage";
import { ConferencesPage } from "@/components/pages/ConferencesPage";
import { PostingsPage } from "@/components/pages/PostingsPage";
import { AttendancePage } from "@/components/pages/AttendancePage";
import { MilestonesPage } from "@/components/pages/MilestonesPage";
import { ThesisPage } from "@/components/pages/ThesisPage";
import { CertificationsPage } from "@/components/pages/CertificationsPage";
import { AwardsPage } from "@/components/pages/AwardsPage";
import { ClinicalWorksPage } from "@/components/pages/ClinicalWorksPage";
import { AssessmentsPage } from "@/components/pages/AssessmentsPage";
import { PrintableLogbook } from "@/components/pages/PrintableLogbook";
import { PrivacyPolicyPage } from "@/components/pages/PrivacyPolicyPage";
import { GrievanceOfficerPage } from "@/components/pages/GrievanceOfficerPage";
import { DataRightsPage } from "@/components/pages/DataRightsPage";
import { ProfilePage } from "@/components/pages/ProfilePage";
import { NotificationsPage } from "@/components/pages/NotificationsPage";
import { NameChangeNotificationPage } from "@/components/pages/NameChangeNotificationPage";
import { getCurrentUser, clearSession, getToken, saveToken, saveCurrentUser, SESSION_EXPIRED_EVENT, SESSION_USER_CHANGED_EVENT } from "@/lib/session";
import { DEMO_SESSION_CHANGED_EVENT } from "@/lib/demoSession";
import { DEMO_DEPARTMENT_CHANGED_EVENT, getDemoDepartmentProfile } from "@/lib/demoDepartments";
import { apiGet, apiPost } from "@/lib/apiClient";
import { DepartmentProvider, useDepartment } from "@/lib/department-context";
import { startSessionKeepalive } from "@/lib/session-keepalive";

import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

function _resolveComponent(
  mod: Record<string, unknown>,
  name: string,
): ComponentType | undefined {
  const fns = Object.values(mod).filter(
    (v) => typeof v === "function",
  ) as ComponentType[];
  return (
    (mod.default as ComponentType) ||
    (mod.Preview as ComponentType) ||
    (mod[name] as ComponentType) ||
    fns[fns.length - 1]
  );
}

function PreviewRenderer({
  componentPath,
  modules,
}: {
  componentPath: string;
  modules: ModuleMap;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setComponent(null);
    setError(null);

    async function loadComponent(): Promise<void> {
      const key = `./components/mockups/${componentPath}.tsx`;
      const loader = modules[key];
      if (!loader) {
        setError(`No component found at ${componentPath}.tsx`);
        return;
      }

      try {
        const mod = await loader();
        if (cancelled) {
          return;
        }
        const name = componentPath.split("/").pop()!;
        const comp = _resolveComponent(mod, name);
        if (!comp) {
          setError(
            `No exported React component found in ${componentPath}.tsx\n\nMake sure the file has at least one exported function component.`,
          );
          return;
        }
        setComponent(() => comp);
      } catch (e) {
        if (cancelled) {
          return;
        }

        const message = e instanceof Error ? e.message : String(e);
        setError(`Failed to load preview.\n${message}`);
      }
    }

    void loadComponent();

    return () => {
      cancelled = true;
    };
  }, [componentPath, modules]);

  if (error) {
    return (
      <pre style={{ color: "var(--gothos-ink)", padding: "2rem", fontFamily: "system-ui" }}>
        {error}
      </pre>
    );
  }

  if (!Component) return null;

  return <Component />;
}

function getBasePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function getPreviewPath(): string | null {
  const basePath = getBasePath();
  const { pathname } = window.location;
  const local =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;
  const match = local.match(/^\/preview\/(.+)$/);
  return match ? match[1] : null;
}

function App() {
  const [location, setLocation] = useLocation();
  const previewPath = getPreviewPath();
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const sessionGenerationRef = useRef(0);
  
  const activeRole: RoleType = (() => {
    if (currentUser?.role === "hod") return "HOD";
    if (currentUser?.role === "professor") return "Faculty";
    return "Student";
  })();
  
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => window.sessionStorage.getItem("elogbook-authenticated") === "true"
  );
  const [authScreen, setAuthScreen] = useState<"login" | "register">("login");
  const [sessionExpired, setSessionExpired] = useState(false);
  
  const hasTokenInUrl = new URLSearchParams(window.location.search).has("impersonationToken");
  const [checkingSession, setCheckingSession] = useState(!!getToken() || hasTokenInUrl);

  useEffect(() => {
    const syncCurrentUser = () => setCurrentUser(getCurrentUser());
    const syncSessionUser = () => {
      sessionGenerationRef.current += 1;
      setCurrentUser(getCurrentUser());
    };
    window.addEventListener(DEMO_DEPARTMENT_CHANGED_EVENT, syncCurrentUser);
    window.addEventListener(DEMO_SESSION_CHANGED_EVENT, syncCurrentUser);
    window.addEventListener(SESSION_USER_CHANGED_EVENT, syncSessionUser);
    return () => {
      window.removeEventListener(DEMO_DEPARTMENT_CHANGED_EVENT, syncCurrentUser);
      window.removeEventListener(DEMO_SESSION_CHANGED_EVENT, syncCurrentUser);
      window.removeEventListener(SESSION_USER_CHANGED_EVENT, syncSessionUser);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (currentUser?.isDemoMode) {
      const accent = getDemoDepartmentProfile(currentUser.departmentId).accent;
      root.style.setProperty("--demo-accent", accent);
      root.setAttribute("data-demo-mode", "true");
    } else {
      root.style.removeProperty("--demo-accent");
      root.removeAttribute("data-demo-mode");
    }
  }, [currentUser?.departmentId, currentUser?.isDemoMode]);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const impersonationToken = urlParams.get("impersonationToken");
    
    if (impersonationToken) {
      saveToken(impersonationToken);
      sessionStorage.setItem("elogbook-login-summary-pending", "true");
      urlParams.delete("impersonationToken");
      const newUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    }

    if (!getToken()) { setCurrentUser(null); setIsAuthenticated(false); setCheckingSession(false); return; }
    
    apiGet("/api/auth/me").then((user) => {
      sessionStorage.setItem("elogbook-user", JSON.stringify(user));
      window.sessionStorage.setItem("elogbook-authenticated", "true");
      setCurrentUser(user);
      setIsAuthenticated(true);
    }).catch(() => { clearSession(); setCurrentUser(null); setIsAuthenticated(false); }).finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.isDemoMode) return;
    let active = true;
    let inFlight = false;
    const refreshSession = () => {
      if (!active || inFlight || document.visibilityState !== "visible") return;
      const generation = sessionGenerationRef.current;
      const token = getToken();
      const accountId = currentUser.id;
      if (!token) return;
      inFlight = true;
      apiGet("/api/auth/me").then((fresh: any) => {
        if (!active || generation !== sessionGenerationRef.current || getToken() !== token
          || getCurrentUser()?.isDemoMode || fresh?.id !== accountId) return;
        const stored = getCurrentUser();
        if (!stored || stored.name !== fresh.name || stored.role !== fresh.role
          || stored.departmentId !== fresh.departmentId || stored.departmentName !== fresh.departmentName
          || stored.collegeId !== fresh.collegeId || stored.collegeName !== fresh.collegeName
          || stored.studentProfileId !== fresh.studentProfileId) {
          saveCurrentUser(fresh);
        }
      }).catch(() => {
        // The shared API client already handles expired sessions; transient focus refreshes
        // leave the last known identity visible and retry on the next focus.
      }).finally(() => { inFlight = false; });
    };
    window.addEventListener("focus", refreshSession);
    document.addEventListener("visibilitychange", refreshSession);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshSession);
      document.removeEventListener("visibilitychange", refreshSession);
    };
  }, [isAuthenticated, currentUser?.id]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const stopKeepalive = startSessionKeepalive();
    const onExpired = () => {
      setCurrentUser(null);
      setIsAuthenticated(false);
      setSessionExpired(true);
      setLocation("/");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => { stopKeepalive(); window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired); };
  }, [isAuthenticated, setLocation]);

  // Shown from an effect so the sign-in screen's toaster is mounted before the message is sent.
  useEffect(() => {
    if (!sessionExpired || isAuthenticated) return;
    toast.error("Your session expired. Please sign in again.");
    setSessionExpired(false);
  }, [sessionExpired, isAuthenticated]);

  if (previewPath) {
    return (
      <PreviewRenderer
        componentPath={previewPath}
        modules={discoveredModules}
      />
    );
  }

  if (checkingSession) return <p className="p-10" role="status">Checking your session…</p>;

  if (location === "/privacy-policy") return <PrivacyPolicyPage />;
  if (location === "/grievance-officer") return <GrievanceOfficerPage />;
  if (location === "/data-rights") return <DataRightsPage />;

  if (!isAuthenticated) {
    if (authScreen === "register") {
      return (
        <>
          <RegistrationPage
            onBack={() => setAuthScreen("login")}
            onRegistered={() => {
              setAuthScreen("login");
            }}
          />
          <Toaster position="top-right" />
        </>
      );
    }
    return (
      <>
        <LoginPage
          onRegister={() => setAuthScreen("register")}
          onSignIn={() => {
            window.sessionStorage.setItem("elogbook-authenticated", "true");
            setCurrentUser(getCurrentUser());
            setIsAuthenticated(true);
          }}
        />
        <Toaster position="top-right" />
      </>
    );
  }

  if (currentUser?.role === "admin") {
    if (location === "/profile") return <ProfilePage adminShell />;
    if (location === "/notifications" || location.startsWith("/notifications/")) return <AccessDeniedPage />;
    return (
      <>
        <AdminPortal
          onSignOut={() => {
            void apiPost("/api/auth/logout", {}).catch(() => {});
            clearSession();
            setCurrentUser(null);
            setIsAuthenticated(false);
            setLocation("/");
          }}
        />
        <Toaster position="top-right" />
      </>
    );
  }

  if (location === "/print" && activeRole === "Student") {
    return (
      <DepartmentProvider departmentId={currentUser?.departmentId ?? null}>
        {currentUser?.isDemoMode && (
          <div className="print:hidden sticky top-0 z-50 bg-card px-3 py-2 shadow-sm">
            <DemoBanner />
          </div>
        )}
        <PrintableLogbook />
      </DepartmentProvider>
    );
  }

  return (
    <DepartmentProvider departmentId={currentUser?.departmentId ?? null}>
    <AppLayout
      activeRole={activeRole}
      onSignOut={() => {
        void apiPost("/api/auth/logout", {}).catch(() => {});
        clearSession();
        setCurrentUser(null);
        setIsAuthenticated(false);
        setLocation("/");
      }}
    >
      <Switch>
      <Route path="/profile">{() => <ProfilePage />}</Route>
      <Route path="/notifications/name-changes/:notificationId">{(params) => <NameChangeNotificationPage notificationId={params.notificationId} />}</Route>
      <Route path="/notifications">{() => activeRole === "HOD" ? <NotificationsPage /> : <AccessDeniedPage />}</Route>
      <Route>
      {activeRole === "Faculty" && (
        <ProfessorPortal />
      )}
      {activeRole === "HOD" && (
        <HODPortal />
      )}
      {activeRole === "Student" && (
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/cases">{() => <FeatureGate hiddenBy="hideCaseLogs"><CaseLogsPage /></FeatureGate>}</Route>
          <Route path="/procedures">{() => <FeatureGate hiddenBy="hideProcedureLogs"><ProcedureLogsPage /></FeatureGate>}</Route>
          <Route path="/clinical-works">{() => <FeatureGate requires="clinicalWorks"><ClinicalWorksPage /></FeatureGate>}</Route>
          <Route path="/academics/:category">{(params) => <AcademicLogsPage key={`${currentUser?.departmentId}-${params.category}`} categoryId={params.category} />}</Route>
          <Route path="/academics">{() => <AcademicLogsPage key={`${currentUser?.departmentId}-all`} />}</Route>
          <Route path="/conferences" component={ConferencesPage} />
          <Route path="/postings" component={PostingsPage} />
          <Route path="/attendance" component={AttendancePage} />
          <Route path="/assessments" component={AssessmentsPage} />
          <Route path="/milestones" component={MilestonesPage} />
          <Route path="/thesis" component={ThesisPage} />
          <Route path="/certifications" component={CertificationsPage} />
          <Route path="/awards" component={AwardsPage} />
          <Route component={Dashboard} />
        </Switch>
      )}
      </Route>
      </Switch>
    </AppLayout>
    </DepartmentProvider>
  );
}

function AccessDeniedPage() {
  return <main className="mx-auto max-w-3xl p-6"><div role="alert" className="rounded-2xl border border-status-border bg-white p-6"><h1 className="text-xl font-bold text-ink">Access unavailable</h1><p className="mt-2 text-sm text-soft-ink">These saved name-change notices are available to the current department HOD.</p></div></main>;
}

function FeatureGate({ hiddenBy, requires, children }: { hiddenBy?: string; requires?: string; children: ReactNode }) {
  const features = useDepartment().config?.enabledFeatures ?? {};
  if ((hiddenBy && features[hiddenBy]) || (requires && !features[requires])) return <Redirect to="/" />;
  return <>{children}</>;
}

export default App;
