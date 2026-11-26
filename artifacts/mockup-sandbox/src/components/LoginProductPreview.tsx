import * as React from "react";
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MousePointer2,
  Stethoscope,
} from "lucide-react";

const moments = [
  { caption: "Opening the resident dashboard", cursor: { left: "12%", top: "24%" }, scroll: 0 },
  { caption: "Reviewing the resident summary", cursor: { left: "61%", top: "35%" }, scroll: 0 },
  { caption: "Checking completion targets", cursor: { left: "78%", top: "65%" }, scroll: 0 },
  { caption: "Viewing recent dashboard activity", cursor: { left: "65%", top: "80%" }, scroll: -42 },
] as const;

const navigation = [
  ["Dashboard", LayoutDashboard], ["Postings", CalendarDays], ["Case Logs", FileText],
  ["Procedures", Stethoscope], ["Academics", GraduationCap],
] as const;

function ProgressBar({ value, visible }: { value: number; visible: boolean }) {
  return <div className="h-1 overflow-hidden rounded-full bg-sage"><div className="h-full rounded-full bg-forest transition-[width] duration-1000" style={{ width: visible ? `${value}%` : "0%" }} /></div>;
}

function Dashboard({ phase }: { phase: number }) {
  return <div className="space-y-2 p-2 transition-transform duration-1000 ease-in-out" style={{ transform: `translateY(${moments[phase].scroll}px)` }}>
    <div className="grid grid-cols-[.8fr_1.2fr] gap-2 overflow-hidden rounded-xl border border-line-soft bg-white p-2 shadow-sm">
      <div className="rounded-[10px] bg-deep p-2.5 text-white"><p className="text-[4px] font-bold uppercase tracking-[.18em] text-white">Resident dashboard</p><p className="mt-1.5 text-[12px] font-semibold">Welcome back!</p><p className="mt-2 text-[4.5px] leading-2 text-white">Your clinical record and verification status are summarised here.</p></div>
      {/* Illustrative preview only, not real data - every department sees this same login screen, so no
          specific department name or resident identifier is shown here (AGENTS.md sec 5 and sec 7). */}
      <div className="rounded-[10px] border border-line-soft bg-mist p-2"><p className="text-[4px] font-bold uppercase tracking-[.15em] text-forest">Resident profile</p><div className="mt-2 grid grid-cols-2 gap-1">{[["Registration", "—"], ["Department", "—"], ["Joined", "—"], ["Completion", "—"]].map(([label, value]) => <div key={label} className="rounded bg-white p-1"><p className="text-[3.5px] font-bold uppercase text-forest">{label}</p><p className="mt-0.5 truncate text-[4.5px] font-semibold text-ink">{value}</p></div>)}</div></div>
    </div>
    <div className="grid grid-cols-[1.05fr_.95fr] gap-2 rounded-xl border border-line-soft bg-white p-2 shadow-sm"><div><p className="text-[4px] font-bold uppercase tracking-[.14em] text-forest">Dashboard insights</p><p className="mt-1 text-[7px] font-bold text-ink">194 entries remain to complete core targets.</p><span className="mt-2 inline-block rounded-full bg-mist px-1.5 py-0.5 text-[4px] font-bold text-forest">Getting started</span></div><div className="space-y-1.5">{[["Clinical cases", 2], ["Procedures", 3], ["Academic activities", 6]].map(([label, value]) => <div key={String(label)}><div className="mb-0.5 flex justify-between text-[4px] font-semibold text-soft-ink"><span>{label}</span><span className="text-forest">{value}%</span></div><ProgressBar value={Number(value)} visible={phase >= 2} /></div>)}</div></div>
    <div className="overflow-hidden rounded-xl border border-line-soft bg-white shadow-sm"><div className="flex items-center justify-between border-b border-line-soft px-2 py-1.5"><div><p className="text-[3.5px] font-bold uppercase text-forest">Student activity</p><p className="text-[6px] font-bold text-ink">Recent entries</p></div><Bell className="h-2.5 w-2.5 text-forest" /></div>{[["Academic", "Cerebral palsy", "Pending"], ["Procedure", "Arterial blood gas", "Verified"], ["Procedure", "Intubation", "Verified"]].map(([type, entry, status]) => <div key={entry} className="grid grid-cols-[.7fr_1.5fr_.65fr] gap-1 border-t border-line-soft px-2 py-1.5 text-[4px]"><span className="font-semibold text-forest">{type}</span><span className="truncate font-semibold text-ink">{entry}</span><span className={status === "Verified" ? "text-status-foreground" : "text-status-foreground"}>{status}</span></div>)}</div>
  </div>;
}

export function LoginProductPreview() {
  const [phase, setPhase] = React.useState(0);
  const moment = moments[phase];
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setPhase((current) => (current + 1) % moments.length), 1900);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="mt-8" role="img" aria-label="Looping preview of a resident using the E-Logbook dashboard">
    <div className="overflow-hidden rounded-[22px] border border-white/25 bg-deep/90 shadow-[0_28px_70px_color-mix(in_srgb,var(--gothos-forest)_30%,transparent)] ring-1 ring-shadow/5">
      <div className="flex h-8 items-center gap-1.5 border-b border-white/10 bg-deep/90 px-3"><span className="h-2 w-2 rounded-full bg-white/85" /><span className="h-2 w-2 rounded-full bg-remaining-mark" /><span className="h-2 w-2 rounded-full bg-white/85" /><div className="mx-auto flex h-4 w-32 items-center justify-center rounded-full bg-white/10 text-[6px] font-medium tracking-wide text-white">elogbook.local/dashboard</div></div>
      <div className="relative aspect-[16/10] overflow-hidden bg-background p-1.5"><div className="flex h-full overflow-hidden rounded-xl border border-white bg-background"><aside className="relative w-[23%] shrink-0 border-r border-line-soft bg-white p-1.5"><div className="mb-3 flex items-center gap-1"><div className="grid h-4 w-4 place-items-center rounded-md bg-forest text-white"><BookOpenCheck className="h-2.5 w-2.5" /></div><span className="text-[6px] font-bold text-ink">E-Logbook</span></div><p className="mb-1.5 text-[3.5px] font-bold uppercase tracking-[.15em] text-forest">Student workspace</p>{navigation.map(([label, Icon]) => <div key={label} className={`mb-0.5 flex items-center gap-1 rounded-md px-1 py-1 ${label === "Dashboard" ? "bg-forest text-white" : "text-helper"}`}><Icon className="h-2 w-2" /><span className="text-[4.5px] font-semibold">{label}</span></div>)}</aside><main className="min-w-0 flex-1"><header className="flex h-7 items-center justify-between border-b border-white bg-card px-2"><div><p className="text-[6px] font-bold text-ink">Your department</p><p className="text-[3.5px] text-helper">Student workspace</p></div><Bell className="h-2.5 w-2.5 text-forest" /></header><div className="h-[calc(100%-1.75rem)] overflow-hidden"><Dashboard phase={phase} /></div></main></div>{(phase === 0 || phase === 2) && <span key={`click-${phase}`} className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-forest/70" style={{ left: moment.cursor.left, top: moment.cursor.top }} />}<MousePointer2 className="pointer-events-none absolute h-4 w-4 fill-white text-ink drop-shadow-md transition-all duration-700 ease-in-out" style={{ left: moment.cursor.left, top: moment.cursor.top }} /></div>
    </div>
    <div className="mt-4 flex items-center justify-between gap-4"><p key={moment.caption} className="animate-in fade-in slide-in-from-bottom-1 text-xs font-semibold text-white">{moment.caption}</p><div className="flex gap-1.5">{moments.map((item, index) => <span key={item.caption} className={`h-1.5 rounded-full transition-all duration-500 ${index === phase ? "w-6 bg-white" : "w-1.5 bg-white/35"}`} />)}</div></div>
  </div>;
}
