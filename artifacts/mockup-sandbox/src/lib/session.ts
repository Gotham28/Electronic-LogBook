const TOKEN_KEY = 'elogbook-token';

export interface UserSession {
  id: number;
  name: string;
  role: string;
  departmentId: number | null;
  departmentName: string | null;
  studentProfileId: number | null;
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

export function clearSession(): void {
  window.sessionStorage.removeItem('elogbook-user');
  window.sessionStorage.removeItem('elogbook-authenticated');
  window.sessionStorage.removeItem(TOKEN_KEY);
}
