import { getActiveDemoDepartmentId } from "./demoDepartments";
import { clearMaintenanceNoticeSession, saveToken } from "./session";

export type DemoRole = "student" | "faculty" | "hod";

export const DEMO_SESSION_CHANGED_EVENT = "arogya-demo-session-changed";
export const DEMO_MOVIE_CHANGED_EVENT = "arogya-demo-movie-changed";
export const DEMO_MOVIE_REPLAY_EVENT = "arogya-demo-movie-replay";

export function startDemoSession(role: DemoRole, options?: { skipLoginSummary?: boolean }): void {
  const roleMap: Record<string, string> = { "student": "student", "faculty": "professor", "hod": "hod" };
  const emailMap: Record<string, string> = { "student": "resident1.demo@example.com", "faculty": "vivek.menon.demo@example.com", "hod": "priya.sharma.demo@example.com" };
  const nameMap: Record<string, string> = { "student": "Demo Resident 01", "faculty": "Dr. Vivek Menon", "hod": "Dr. Priya Sharma" };
  
  const user = {
    id: 999,
    name: nameMap[role] || "Demo User",
    fullName: nameMap[role] || "Demo User",
    email: emailMap[role] || "demo@example.com",
    role: roleMap[role] || "student",
    departmentId: getActiveDemoDepartmentId(),
    studentProfileId: role === "student" ? 1 : undefined,
    token: "demo-token",
    isDemoMode: true
  };
  
  clearMaintenanceNoticeSession();
  saveToken(user.token);
  window.sessionStorage.setItem("elogbook-user", JSON.stringify(user));
  if (options?.skipLoginSummary) {
    window.sessionStorage.removeItem("elogbook-login-summary-pending");
  } else {
    window.sessionStorage.setItem("elogbook-login-summary-pending", "true");
  }

  window.dispatchEvent(new CustomEvent(DEMO_SESSION_CHANGED_EVENT, { detail: role }));
}

export function setDemoMovieActive(): void {
  try {
    window.sessionStorage.setItem("elogbook-demo-movie", "true");
  } catch {
    // Fail quietly
  }
  window.dispatchEvent(new CustomEvent(DEMO_MOVIE_CHANGED_EVENT));
}

export function isDemoMovieActive(): boolean {
  try {
    return window.sessionStorage.getItem("elogbook-demo-movie") === "true";
  } catch {
    return false;
  }
}

export function clearDemoMovie(): void {
  try {
    window.sessionStorage.removeItem("elogbook-demo-movie");
  } catch {
    // Fail quietly
  }
  window.dispatchEvent(new CustomEvent(DEMO_MOVIE_CHANGED_EVENT));
}

export function requestDemoMovieReplay(): void {
  setDemoMovieActive();
  window.dispatchEvent(new CustomEvent(DEMO_MOVIE_REPLAY_EVENT));
}

export function demoPortalHome(role: DemoRole): string {
  if (role === "hod") return "/roster";
  return "/";
}
