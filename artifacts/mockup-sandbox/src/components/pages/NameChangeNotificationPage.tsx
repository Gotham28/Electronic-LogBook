import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNameChangeNotification, markNameChangeNotificationRead, type NameChangeNoticeDetail } from "@/lib/apiClient";
import { emailStatusLabel } from "@/components/ProfileNameHistory";
import { NAME_CHANGE_NOTIFICATIONS_CHANGED_EVENT } from "@/hooks/use-name-change-notifications";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short", timeZoneName: "short" }).format(new Date(value));
}

export function NameChangeNotificationPage({ notificationId: explicitId }: { notificationId?: string }) {
  const params = useParams<{ notificationId: string }>();
  const notificationId = explicitId ?? params.notificationId;
  const [notice, setNotice] = useState<NameChangeNoticeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    setReadError(null);
    try {
      const result = await getNameChangeNotification(notificationId);
      setNotice(result);
      setLoading(false);
      if (!result.readAt) await acknowledge(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This notice could not be loaded.");
      setLoading(false);
    }
  };

  const acknowledge = async (target: NameChangeNoticeDetail) => {
    if (target.readAt) return;
    setReading(true);
    setReadError(null);
    try {
      const result = await markNameChangeNotificationRead(target.id);
      setNotice((current) => current ? { ...current, readAt: result.readAt, readByUserId: result.readByUserId } : current);
      window.dispatchEvent(new CustomEvent(NAME_CHANGE_NOTIFICATIONS_CHANGED_EVENT));
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "The notice is open, but its read status could not be saved.");
    } finally {
      setReading(false);
    }
  };

  useEffect(() => { void load(); }, [notificationId]);

  if (loading) return <main className="mx-auto max-w-3xl p-2"><p role="status" className="text-sm text-slate-500">Loading notice…</p></main>;
  if (!notice) return <main className="mx-auto max-w-3xl space-y-4 p-2"><Link href="/notifications" className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:underline"><ArrowLeft className="h-4 w-4" />Back to notifications</Link><Card><CardContent className="space-y-3 p-6"><h1 className="text-xl font-bold">Notice could not be loaded</h1><p role="alert" className="text-sm text-rose-700">{error || "This notice is unavailable."}</p><Button onClick={() => void load()}>Retry</Button></CardContent></Card></main>;

  return <main className="mx-auto w-full max-w-3xl space-y-5 p-1 sm:p-2">
    <Link href="/notifications" className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:underline"><ArrowLeft className="h-4 w-4" />Back to notifications</Link>
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">{notice.departmentName}</p><h1 className="mt-1 text-3xl font-bold text-slate-950">Resident profile name updated</h1><p className="mt-2 text-sm text-slate-600">A resident in your department has updated their profile name.</p></header>
    {readError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The notice is open, but its read status could not be saved. {readError}<Button variant="link" className="ml-1 h-auto p-0" disabled={reading} onClick={() => void acknowledge(notice)}>Retry</Button></p> : null}
    <Card className="rounded-2xl border-slate-200/80 shadow-sm"><CardHeader><CardTitle className="text-lg">Name update</CardTitle></CardHeader><CardContent className="space-y-5">
      <dl className="grid gap-5 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous name</dt><dd className="mt-1 font-medium text-slate-950">{notice.previousName}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated name</dt><dd className="mt-1 font-medium text-slate-950">{notice.newName}</dd></div>
        {notice.registrationNumber ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registration number</dt><dd className="mt-1 text-sm text-slate-900">{notice.registrationNumber}</dd></div> : null}
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">KUHS ID</dt><dd className="mt-1 text-sm text-slate-900">{notice.kuhsId}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated on</dt><dd className="mt-1 text-sm text-slate-900">{dateLabel(notice.changedAt)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current account name</dt><dd className="mt-1 text-sm text-slate-900">{notice.currentStudentName}</dd></div>
      </dl>
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">This notice records a resident's profile update. No action is required.</p>
      <div className="flex items-center gap-2 text-xs text-slate-500">{notice.readAt ? <><Check className="h-4 w-4 text-emerald-700" />Read {dateLabel(notice.readAt)}</> : reading ? "Saving read status…" : "Unread"}</div>
      {notice.emailStatus ? <p className="text-xs text-slate-500">Email status: {emailStatusLabel(notice.emailStatus)}</p> : null}
    </CardContent></Card>
  </main>;
}
