import { useCallback, useEffect, useRef, useState } from "react";
import { getNameChangeNotifications, type NameChangeNotice } from "@/lib/apiClient";
import type { UserSession } from "@/lib/session";

export const NAME_CHANGE_NOTIFICATIONS_CHANGED_EVENT = "elogbook:name-change-notifications-changed";

export function useNameChangeNotifications(user: UserSession | null, enabled: boolean) {
  const [items, setItems] = useState<NameChangeNotice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const identity = user?.id + ":" + user?.departmentId;

  const refresh = useCallback(async () => {
    if (!enabled || user?.role !== "hod" || typeof user.departmentId !== "number") return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getNameChangeNotifications({ unreadOnly: true });
      if (requestId !== requestIdRef.current) return;
      setItems(page.items.slice(0, 5));
      setUnreadCount(page.unreadCount);
      setHasLoaded(true);
    } catch (cause) {
      if (requestId === requestIdRef.current) setError(cause instanceof Error ? cause.message : "Saved notifications could not be refreshed.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [enabled, identity, user?.role, user?.departmentId]);

  useEffect(() => {
    requestIdRef.current += 1;
    setItems([]);
    setUnreadCount(0);
    setError(null);
    setHasLoaded(false);
    if (!enabled || user?.role !== "hod") return;
    if (typeof user.departmentId !== "number") {
      setLoading(false);
      setError("Your HOD department could not be loaded.");
      return;
    }
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onChanged = () => { void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(NAME_CHANGE_NOTIFICATIONS_CHANGED_EVENT, onChanged);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NAME_CHANGE_NOTIFICATIONS_CHANGED_EVENT, onChanged);
      window.clearInterval(timer);
    };
  }, [enabled, identity, user?.role, user?.departmentId, refresh]);

  return { items, unreadCount, loading, hasLoaded, error, refresh };
}
