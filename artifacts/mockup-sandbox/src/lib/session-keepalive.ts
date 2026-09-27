import { apiPost } from './apiClient';
import { getToken, getTokenTimes, isDemoMode, saveToken } from './session';

const CHECK_INTERVAL_MS = 60_000;
const ACTIVE_WINDOW_MS = 10 * 60_000;
const RENEW_WHEN_REMAINING = 0.25;

// Renews the session token shortly before it expires, but only while the user is actually
// using the app. An idle tab is left to expire.
export function startSessionKeepalive(): () => void {
  let lastActivity = Date.now();
  let renewing = false;
  const markActive = () => { lastActivity = Date.now(); };
  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
  events.forEach((name) => window.addEventListener(name, markActive, { passive: true }));
  const onVisible = () => { if (document.visibilityState === 'visible') { markActive(); void check(); } };
  document.addEventListener('visibilitychange', onVisible);

  async function check() {
    if (renewing || isDemoMode()) return;
    const times = getTokenTimes();
    if (!times) return;
    const nowSeconds = Date.now() / 1000;
    const remaining = times.exp - nowSeconds;
    if (remaining <= 0) return;
    if (remaining > (times.exp - times.iat) * RENEW_WHEN_REMAINING) return;
    if (Date.now() - lastActivity > ACTIVE_WINDOW_MS) return;
    const tokenBefore = getToken();
    renewing = true;
    try {
      const result = await apiPost<{ token: string }>('/api/auth/refresh', {});
      if (result?.token && getToken() === tokenBefore) saveToken(result.token);
    } catch {
      // A rejected renewal surfaces through the global session-expired handler.
    } finally {
      renewing = false;
    }
  }

  const timer = window.setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
  return () => {
    window.clearInterval(timer);
    events.forEach((name) => window.removeEventListener(name, markActive));
    document.removeEventListener('visibilitychange', onVisible);
  };
}
