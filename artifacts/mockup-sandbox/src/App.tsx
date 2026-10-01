import { useEffect, useState, type ComponentType, type ReactNode } from "react";
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
import { getCurrentUser, clearSession, getToken, saveToken, SESSION_EXPIRED_EVENT } from "@/lib/session";
import { DEMO_DEPARTMENT_CHANGED_EVENT, getDemoDepartmentProfile } from "@/lib/demoDepartments";
import { apiGet, apiPost } from "@/lib/apiClient";
import { DepartmentProvider, useDepartment } from "@/lib/department-context";
import { startSessionKeepalive } from "@/lib/session-keepalive";

import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

function relativeLuminance(hex: string): number | null {
  const match = hex.match(/^#?([\da-f]{6})$/i);
  if (!match) return null;

  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixHexWithBlack(hex: string, amount: number): string {
  const match = hex.match(/^#?([\da-f]{6})$/i);
  if (!match) return hex;
  const channels = [0, 2, 4].map((offset) => Math.round(parseInt(match[1].slice(offset, offset + 2), 16) * (1 - amount)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getDemoAccentTextColors(accent: string) {
  const accentLuminance = relativeLuminance(accent);
  if (accentLuminance === null) return { readable: "#0f766e", foreground: "#ffffff" };

  const whiteLuminance = 1;
  const inkLuminance = relativeLuminance("#0f172a")!;
  let readable = accent;
  if (contrastRatio(accentLuminance, whiteLuminance) < 4.5) {
    for (let amount = 0.02; amount <= 0.9; amount += 0.02) {
      const candidate = mixHexWithBlack(accent, amount);
      const candidateLuminance = relativeLuminance(candidate);
      if (candidateLuminance !== null && contrastRatio(candidateLuminance, whiteLuminance) >= 4.5) {
        readable = candidate;
        break;
      }
    }
  }

  return {
    readable,
    foreground: contrastRatio(accentLuminance, whiteLuminance) >= contrastRatio(accentLuminance, inkLuminance)
      ? "#ffffff"
      : "#0f172a",
  };
}

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
      <pre style={{ color: "red", padding: "2rem", fontFamily: "system-ui" }}>
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
  const [, setLocation] = useLocation();
  const previewPath = getPreviewPath();
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  
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
    window.addEventListener(DEMO_DEPARTMENT_CHANGED_EVENT, syncCurrentUser);
    return () => window.removeEventListener(DEMO_DEPARTMENT_CHANGED_EVENT, syncCurrentUser);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (currentUser?.isDemoMode) {
      const accent = getDemoDepartmentProfile(currentUser.departmentId).accent;
      const { readable, foreground } = getDemoAccentTextColors(accent);
      root.style.setProperty("--demo-accent", accent);
      root.style.setProperty("--demo-accent-readable", readable);
      root.style.setProperty("--demo-accent-foreground", foreground);
      root.setAttribute("data-demo-mode", "true");
    } else {
      root.style.removeProperty("--demo-accent");
      root.style.removeProperty("--demo-accent-readable");
      root.style.removeProperty("--demo-accent-foreground");
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

  if (window.location.pathname === "/privacy-policy") return <PrivacyPolicyPage />;
  if (window.location.pathname === "/grievance-officer") return <GrievanceOfficerPage />;
  if (window.location.pathname === "/data-rights") return <DataRightsPage />;

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
          <Toaster position="top-right" richColors />
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
        <Toaster position="top-right" richColors />
      </>
    );
  }

  if (currentUser?.role === "admin") {
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
        <Toaster position="top-right" richColors />
      </>
    );
  }

  if (window.location.pathname === "/print" && activeRole === "Student") {
    return (
      <DepartmentProvider departmentId={currentUser?.departmentId ?? null}>
        {currentUser?.isDemoMode && (
          <div className="print:hidden sticky top-0 z-50 bg-white/90 px-3 py-2 shadow-sm">
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
          <Route path="/academics" component={AcademicLogsPage} />
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

function FeatureGate({ hiddenBy, requires, children }: { hiddenBy?: string; requires?: string; children: ReactNode }) {
  const features = useDepartment().config?.enabledFeatures ?? {};
  if ((hiddenBy && features[hiddenBy]) || (requires && !features[requires])) return <Redirect to="/" />;
  return <>{children}</>;
}

export default App;
