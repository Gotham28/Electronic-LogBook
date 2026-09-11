import { getToken } from './session';
import { handleDemoRequest } from './demoData';

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
  if (userStr) {
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
