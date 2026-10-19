import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOwnNameHistory, type OwnNameHistoryItem, type NameChangeEmailStatus } from "@/lib/apiClient";

const activeEmailStatuses: NameChangeEmailStatus[] = ["queued", "processing", "waiting_for_hod", "waiting_for_subject", "waiting_for_configuration"];

export function emailStatusLabel(status: NameChangeEmailStatus): string {
  const labels: Record<NameChangeEmailStatus, string> = {
    queued: "Email queued",
    processing: "Email is being processed",
    waiting_for_hod: "Waiting for an approved department HOD",
    waiting_for_subject: "Waiting for account approval",
    waiting_for_configuration: "Waiting for the email service",
    accepted: "Accepted by the email provider",
    needs_attention: "Email could not be confirmed; the saved HOD notice remains available",
    cancelled: "Email cancelled because the account or department changed",
    suppressed_test: "Email is disabled for this test department",
  };
  return labels[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ProfileNameHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<OwnNameHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedOlderRef = useRef(false);
  const hasMoreRef = useRef(false);
  const requestRef = useRef(0);

  const refreshFirstPage = useCallback(async () => {
    const request = ++requestRef.current;
    setError(null);
    try {
      const page = await getOwnNameHistory();
      if (request !== requestRef.current) return;
      setItems((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        page.items.forEach((item) => merged.set(item.id, item));
        return [...merged.values()].sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.id.localeCompare(a.id));
      });
      if (!loadedOlderRef.current) setNextCursor(page.nextCursor);
      if (!loadedOlderRef.current) {
        hasMoreRef.current = page.hasMore;
        setHasMore(page.hasMore);
      } else {
        setHasMore(hasMoreRef.current);
      }
    } catch (cause) {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "Name history could not be loaded.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFirstPage();
  }, [refreshFirstPage, refreshKey]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshFirstPage();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requestRef.current += 1;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshFirstPage]);

  useEffect(() => {
    const hasPending = items.some((item) => item.emailStatus && activeEmailStatuses.includes(item.emailStatus));
    if (!hasPending || document.visibilityState !== "visible") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshFirstPage();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [items, refreshFirstPage]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await getOwnNameHistory(nextCursor);
      setItems((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        page.items.forEach((item) => merged.set(item.id, item));
        return [...merged.values()].sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.id.localeCompare(a.id));
      });
      loadedOlderRef.current = true;
      hasMoreRef.current = page.hasMore;
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "More name history could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200/80 shadow-sm">
      <CardHeader><CardTitle className="text-lg">Name history</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p role="status" className="text-sm text-slate-500">Loading name history…</p> : null}
        {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}<Button variant="link" className="ml-2 h-auto p-0" onClick={() => void refreshFirstPage()}>Retry</Button></div> : null}
        {!loading && !error && items.length === 0 ? <p className="text-sm leading-6 text-slate-600">No profile name changes have been recorded. Names changed before this feature launched are not available in this history.</p> : null}
        {items.length > 0 ? <ol className="divide-y divide-slate-100">
          {items.map((item) => <li key={item.id} className="space-y-1 py-4 first:pt-0 last:pb-0">
            <p className="text-sm font-semibold text-slate-900">{item.previousName} <span aria-hidden="true">→</span> {item.newName}</p>
            <p className="text-xs text-slate-500">{item.source === "admin_roster" ? "Updated by an administrator" : "Changed by you"} · {formatDate(item.changedAt)}</p>
            {item.emailStatus ? <p className="text-xs text-slate-600">{emailStatusLabel(item.emailStatus)}</p> : null}
          </li>)}
        </ol> : null}
        {hasMore && nextCursor ? <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</Button> : null}
      </CardContent>
    </Card>
  );
}
