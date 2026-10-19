import { useEffect, useState } from "react";
import { DEMO_DEPARTMENT_CHANGED_EVENT } from "@/lib/demoDepartments";
import { DEMO_SESSION_CHANGED_EVENT } from "@/lib/demoSession";
import { getCurrentUser, SESSION_USER_CHANGED_EVENT, type UserSession } from "@/lib/session";

export function useCurrentUser(): UserSession | null {
  const [user, setUser] = useState<UserSession | null>(() => getCurrentUser());

  useEffect(() => {
    const sync = () => setUser(getCurrentUser());
    window.addEventListener(SESSION_USER_CHANGED_EVENT, sync);
    window.addEventListener(DEMO_SESSION_CHANGED_EVENT, sync);
    window.addEventListener(DEMO_DEPARTMENT_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(SESSION_USER_CHANGED_EVENT, sync);
      window.removeEventListener(DEMO_SESSION_CHANGED_EVENT, sync);
      window.removeEventListener(DEMO_DEPARTMENT_CHANGED_EVENT, sync);
    };
  }, []);

  return user;
}
