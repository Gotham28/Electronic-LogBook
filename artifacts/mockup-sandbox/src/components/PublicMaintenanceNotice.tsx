import * as React from "react";
import { AlertTriangle, X } from "lucide-react";
import { apiGet } from "@/lib/apiClient";

type PublicMaintenanceNoticeItem = {
  id: number;
  title: string;
  message: string;
};

export function PublicMaintenanceNotice() {
  const [notices, setNotices] = React.useState<PublicMaintenanceNoticeItem[]>([]);
  const [dismissedIds, setDismissedIds] = React.useState<number[]>([]);
  const [loadError, setLoadError] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const data = await apiGet<PublicMaintenanceNoticeItem[]>("/api/announcements/public-current");
        if (cancelled) return;
        setNotices(data);
        setLoadError(false);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };

    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [refreshToken]);

  const visibleNotices = notices.filter((notice) => !dismissedIds.includes(notice.id));
  if (!visibleNotices.length && !loadError) return null;

  return (
    <div className="sticky top-0 z-[100] print:hidden">
      {visibleNotices.map((notice) => (
        <section key={notice.id} role="status" aria-label={notice.title} className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm sm:px-6">
          <div className="mx-auto flex max-w-7xl items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">{notice.title}</h2>
              <p className="mt-0.5 text-sm leading-5">{notice.message}</p>
            </div>
            <button
              type="button"
              aria-label={`Dismiss maintenance notice: ${notice.title}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-amber-800 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700"
              onClick={() => setDismissedIds((ids) => [...ids, notice.id])}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </section>
      ))}
      {loadError && (
        <div role="alert" className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950 sm:px-6">
          Maintenance notice status could not be checked.
          <button type="button" className="ml-2 font-semibold underline" onClick={() => setRefreshToken((value) => value + 1)}>Retry</button>
        </div>
      )}
    </div>
  );
}
