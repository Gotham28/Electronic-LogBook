import { useEffect, useState, type ComponentType } from "react";
import { Route, Switch } from "wouter";
import { AppLayout, type RoleType } from "@/components/layout/AppLayout";
import { Dashboard } from "@/components/Dashboard";
import { ProfessorPortal } from "@/components/ProfessorPortal";
import { HODPortal } from "@/components/HODPortal";
import { LoginPage } from "@/components/LoginPage";
import { RegistrationPage } from "@/components/RegistrationPage";
import { CaseLogsPage } from "@/components/pages/CaseLogsPage";
import { ProcedureLogsPage } from "@/components/pages/ProcedureLogsPage";
import { AcademicLogsPage } from "@/components/pages/AcademicLogsPage";
import { PostingsPage } from "@/components/pages/PostingsPage";
import { AttendancePage } from "@/components/pages/AttendancePage";
import { MilestonesPage } from "@/components/pages/MilestonesPage";
import { AssessmentsPage } from "@/components/pages/AssessmentsPage";
import { PrintableLogbook } from "@/components/pages/PrintableLogbook";
import { getCurrentUser, clearSession } from "@/lib/session";
import { Toaster } from "@/components/ui/sonner";

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
  const previewPath = getPreviewPath();
  const currentUser = getCurrentUser();
  
  const activeRole: RoleType = (() => {
    if (currentUser?.role === "hod") return "HOD";
    if (currentUser?.role === "professor") return "Professor";
    return "Student";
  })();
  
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => window.sessionStorage.getItem("elogbook-authenticated") === "true"
  );
  const [authScreen, setAuthScreen] = useState<"login" | "register">("login");

  if (previewPath) {
    return (
      <PreviewRenderer
        componentPath={previewPath}
        modules={discoveredModules}
      />
    );
  }

  if (window.location.pathname === "/print") {
    return <PrintableLogbook />;
  }

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
            setIsAuthenticated(true);
          }}
        />
        <Toaster position="top-right" richColors />
      </>
    );
  }

  return (
    <AppLayout
      activeRole={activeRole}
      onSignOut={() => {
        clearSession();
        setIsAuthenticated(false);
      }}
    >
      {activeRole === "Professor" && (
        <Switch>
          <Route path="/mentees" component={() => <ProfessorPortal activeTab="mentees" />} />
          <Route path="/assessments" component={() => <ProfessorPortal activeTab="assessments" />} />
          <Route component={() => <ProfessorPortal activeTab="review-queue" />} />
        </Switch>
      )}
      {activeRole === "HOD" && (
        <Switch>
          <Route path="/review-queue" component={() => <HODPortal activeTab="review-queue" />} />
          <Route path="/mentees" component={() => <HODPortal activeTab="mentees" />} />
          <Route path="/assessments" component={() => <HODPortal activeTab="assessments" />} />
          <Route path="/roster" component={() => <HODPortal activeTab="roster" />} />
          <Route path="/student-access" component={() => <HODPortal activeTab="student-access" />} />
          <Route path="/professors" component={() => <HODPortal activeTab="professors" />} />
          <Route path="/leave-approvals" component={() => <HODPortal activeTab="leave-approvals" />} />
          <Route path="/requirements" component={() => <HODPortal activeTab="requirements" />} />
          {/* Legacy routes — redirect to merged Requirements tab */}
          <Route path="/procedures" component={() => <HODPortal activeTab="requirements" />} />
          <Route path="/settings" component={() => <HODPortal activeTab="requirements" />} />
          <Route component={() => <HODPortal activeTab="gap-dashboard" />} />
        </Switch>
      )}
      {activeRole === "Student" && (
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/cases" component={CaseLogsPage} />
          <Route path="/procedures" component={ProcedureLogsPage} />
          <Route path="/academics" component={AcademicLogsPage} />
          <Route path="/postings" component={PostingsPage} />
          <Route path="/attendance" component={AttendancePage} />
          <Route path="/assessments" component={AssessmentsPage} />
          <Route path="/milestones" component={MilestonesPage} />
          <Route component={Dashboard} />
        </Switch>
      )}
    </AppLayout>
  );
}

export default App;
