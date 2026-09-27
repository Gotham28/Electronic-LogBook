const TOKEN_KEY = 'elogbook-token';
export const SESSION_EXPIRED_EVENT = 'elogbook:session-expired';

export interface UserSession {
  id: number;
  name: string;
  role: string;
  departmentId: number | null;
  departmentName: string | null;
  studentProfileId: number | null;
  isDemoMode?: boolean;
}

export function isDemoMode(): boolean {
  return Boolean(getCurrentUser()?.isDemoMode);
}

export function getCurrentUser(): UserSession | null {
  const data = window.sessionStorage.getItem('elogbook-user');
  if (!data) return null;
  try {
    return JSON.parse(data) as UserSession;
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function getTokenTimes(token: string | null = getToken()): { iat: number; exp: number } | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return Number.isFinite(decoded.iat) && Number.isFinite(decoded.exp) ? { iat: decoded.iat, exp: decoded.exp } : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  window.sessionStorage.removeItem('elogbook-user');
  window.sessionStorage.removeItem('elogbook-authenticated');
  window.sessionStorage.removeItem(TOKEN_KEY);
}
