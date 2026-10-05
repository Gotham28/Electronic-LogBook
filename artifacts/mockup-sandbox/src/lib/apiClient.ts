import { clearSession, getToken, SESSION_EXPIRED_EVENT } from './session';
import { handleDemoRequest } from './demoData';

// A 401 from these means wrong credentials, not an expired session.
const SESSION_CHECK_EXEMPT = ["/api/auth/login", "/api/auth/change-password", "/api/auth/logout", "/api/payments"];

export class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export interface ArogyaAction { id: string; label: string; href: string }
export interface ArogyaAnswer {
  reply: string;
  kind: "help" | "diagnostic" | "clarification" | "unsupported";
  steps: string[];
  sources: Array<{ id: string; title: string }>;
  facts: Array<{ id: string; label: string; value: string | number | null }>;
  actions: ArogyaAction[];
  clarification?: { type: "workflow" | "student" | "appraisal_period" | "log"; choices?: Array<{ id: string; label: string }> };
  checkedAt?: string;
  knowledgeVersion: string;
  capabilitySignature: string;
}
export interface ArogyaContextResponse {
  mode: "legacy" | "v2";
  role: "student" | "professor" | "hod";
  departmentLabel: string;
  workflows: Array<{ id: string; title: string; available: boolean }>;
  actions: ArogyaAction[];
  knowledgeVersion: string;
  capabilitySignature: string;
}

if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
  console.error("VITE_API_URL is not set — API requests will fail in production");
}

/**
 * Retrieves the JWT stored in sessionStorage after login.
 * Sent as an Authorization: Bearer header on every request so auth works
 * in all browsers (including Samsung Browser and Safari) regardless of
 * whether cross-site cookies are blocked.
 */
function getAuthToken(): string | null {
  return getToken();
}

async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  // --- DEMO MODE INTERCEPTION ---
  const userStr = window.sessionStorage.getItem("elogbook-user");
  if (userStr && endpoint !== "/api/announcements/public-current") {
    try {
      const user = JSON.parse(userStr);
      if (user.isDemoMode) {
        return handleDemoRequest(options.method || "GET", endpoint, options.body ? JSON.parse(options.body as string) : undefined);
      }
    } catch (e) { /* ignore parse error */ }
  }
  // ------------------------------

  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = new Headers(options.headers || {});

  // Send JWT as Bearer token — works in all browsers regardless of cookie policy
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Automatically set Content-Type to JSON for requests with body, if not already set
  if (options.method && !["GET", "HEAD"].includes(options.method) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "include", // kept for backward compat in browsers that do support cookies
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      throw new ApiError(response.status, `Non-JSON response: ${text.slice(0, 200)}`, null);
    }

    try {
      errorData = await response.json();
    } catch {
      // Not JSON, ignore
    }
    const errorMessage = errorData?.message || response.statusText || "An API error occurred";
    if (response.status === 401 && token && !SESSION_CHECK_EXEMPT.some((path) => endpoint.startsWith(path))) {
      clearSession();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(response.status, errorMessage, errorData);
  }

  // Allow empty responses (e.g. 204 No Content)
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new ApiError(response.status, `Non-JSON response: ${text.slice(0, 200)}`, null);
  }

  return response.json();
}

export function apiGet<T = any>(path: string, options?: RequestInit): Promise<T> {
  return fetchWithAuth(path, { ...options, method: "GET" });
}

export function apiPost<T = any>(path: string, body?: any, options?: RequestInit): Promise<T> {
  return fetchWithAuth(path, {
    ...options,
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T = any>(path: string, body?: any, options?: RequestInit): Promise<T> {
  return fetchWithAuth(path, {
    ...options,
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T = any>(path: string, options?: RequestInit): Promise<T> {
  return fetchWithAuth(path, { ...options, method: "DELETE" });
}

export type AdminDepartment = {
  id: number;
  name: string;
  code: string;
  hod: { id: number; fullName: string; email: string } | null;
  facultyCount?: number;
  residentCount?: number;
  pendingCount?: number;
  mirrorDepartmentId: number | null;
  mirrorDepartmentName: string | null;
  mirrorHod: { id: number; fullName: string; email: string } | null;
  mirrorCode: string | null;
};

export type AdminUserRow = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  status: string;
};

export function getAdminDepartments(): Promise<AdminDepartment[]> {
  return apiGet("/api/superadmin/departments");
}

export function createAdminDepartment(data: { setup: { name: string; code: string; description?: string; hod: { fullName: string; email: string } }; hodPassword: string }) {
  return apiPost("/api/superadmin/departments", data);
}

export function getAdminDepartmentRoster(id: number): Promise<AdminUserRow[]> {
  return apiGet(`/api/superadmin/departments/${id}/roster`);
}

export function replaceAdminHod(departmentId: number, incomingUserId: number) {
  return apiPost(`/api/superadmin/departments/${departmentId}/replace-hod`, { incomingUserId });
}

export function createAdminFaculty(departmentId: number, data: { fullName: string; email: string; password: string }) {
  return apiPost(`/api/superadmin/departments/${departmentId}/faculty`, data);
}

export function createAdminStudent(departmentId: number, data: { fullName: string; email: string; password: string; registrationNumber: string; batch: string; dateOfJoining: string; kuhsId: string; approvalMode: "hod" | "automatic" }): Promise<{
  message: string;
  student: { id: number; fullName: string; email: string; departmentId: number; status: "approved" | "pending" };
  approvalMode: "hod" | "automatic";
  approvalFallback: "no_active_hod" | null;
  hodEmailAccepted: boolean | null;
}> {
  return apiPost(`/api/superadmin/departments/${departmentId}/students`, data);
}

export function deactivateAdminUser(userId: number) {
  return apiPost(`/api/superadmin/users/${userId}/deactivate`);
}

export function reactivateAdminUser(userId: number) {
  return apiPost(`/api/superadmin/users/${userId}/reactivate`, {});
}

export function hardDeleteAdminUser(userId: number): Promise<{ message: string; deletedRecords?: Record<string, number> }> {
  return apiDelete(`/api/superadmin/users/${userId}/hard`);
}

export function impersonateAdminUser(userId: number) {
  return apiPost(`/api/superadmin/users/${userId}/impersonate`);
}

export function backfillTestDepartments(): Promise<{ provisioned: number[]; skipped: number[]; failed: { departmentId: number; message: string }[] }> {
  return apiPost("/api/superadmin/departments/backfill-test-departments");
}

export function resetTestCredentials(departmentId: number): Promise<{ mirrorCode: string }> {
  return apiPost(`/api/superadmin/departments/${departmentId}/reset-test-credentials`);
}

export function deleteAdminDepartment(id: number) {
  return apiDelete(`/api/superadmin/departments/${id}`);
}
