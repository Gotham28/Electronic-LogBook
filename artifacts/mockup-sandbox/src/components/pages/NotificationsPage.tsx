import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNameChangeNotifications, markNameChangeNotificationRead, type NameChangeNotice } from "@/lib/apiClient";
import { NAME_CHANGE_NOTIFICATIONS_CHANGED_EVENT } from "@/hooks/use-name-change-notifications";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function NotificationsPage() {
  const [items, setItems] = useState<NameChangeNotice[]>([]);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
  const [reading, setReading] = useState<string | null>(null);

  const loadFirstPage = async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await getNameChangeNotifications();
      setItems(page.items);
      setUnreadCount(page.unreadCount);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saved notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadFirstPage(); }, []);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await getNameChangeNotifications({ cursor });
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setUnreadCount(page.unreadCount);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "More saved notifications could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (item: NameChangeNotice) => {
    setReading(item.id);
    setReadErrors((current) => ({ ...current, [item.id]: "" }));
    try {
      const result = await markNameChangeNotificationRead(item.id);
      setItems((current) => current.map((notice) => notice.id === item.id ? { ...notice, readAt: result.readAt } : notice));
      setUnreadCount(result.unreadCount);
      window.dispatchEvent(new CustomEvent(NAME_CHANGE_NOTIFICATIONS_CHANGED_EVENT));
    } catch (cause) {
      setReadErrors((current) => ({ ...current, [item.id]: cause instanceof Error ? cause.message : "This notice could not be marked as read." }));
    } finally {
      setReading(null);
    }
  };

  return <main className="mx-auto w-full max-w-5xl space-y-6 p-1 sm:p-2">
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Department inbox</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-slate-950"><Bell className="h-7 w-7 text-teal-700" />Name-change notices</h1><p className="mt-2 text-sm text-slate-600">Saved updates from residents in your department. {unreadCount !== null ? `${unreadCount} unread` : ""}</p></header>
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<Button variant="link" className="ml-2 h-auto p-0" onClick={() => void loadFirstPage()}>Retry</Button></div> : null}
    {loading ? <p role="status" className="text-sm text-slate-500">Loading saved notices…</p> : null}
    {!loading && !error && items.length === 0 ? <Card><CardContent className="p-8 text-center"><p className="font-semibold text-slate-900">No saved name-change notices</p><p className="mt-1 text-sm text-slate-600">New notices from residents in your department will appear here.</p></CardContent></Card> : null}
    {items.length > 0 ? <Card className="rounded-2xl border-slate-200/80 shadow-sm"><CardHeader><CardTitle className="text-lg">Recent updates</CardTitle></CardHeader><CardContent className="divide-y divide-slate-100 p-0">
      {items.map((item) => <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0 space-y-1"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${item.readAt ? "bg-slate-300" : "bg-teal-600"}`} aria-hidden="true" /><p className="font-semibold text-slate-950">{item.previousName} <span aria-hidden="true">→</span> {item.newName}</p></div>
          <p className="text-sm text-slate-600">{item.registrationNumber ? `Registration ${item.registrationNumber}` : `KUHS ID ${item.kuhsId}`} · {dateLabel(item.createdAt)}</p><p className="text-xs text-slate-500">{item.readAt ? "Read" : "Unread"} · {item.departmentName}</p>
          {readErrors[item.id] ? <p role="alert" className="text-xs text-rose-700">{readErrors[item.id]} <button className="underline" onClick={() => void markRead(item)}>Retry</button></p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={item.detailHref}>View name change</Link></Button>{!item.readAt ? <Button size="sm" variant="ghost" disabled={reading === item.id} onClick={() => void markRead(item)}><Check className="mr-1 h-4 w-4" />{reading === item.id ? "Saving…" : "Mark as read"}</Button> : null}</div>
      </article>)}
    </CardContent></Card> : null}
    {hasMore && cursor ? <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more"}</Button> : null}
  </main>;
}
