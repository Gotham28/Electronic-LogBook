import * as React from "react";
import {
  Award,
  Bell,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MousePointer2,
  Printer,
  Stethoscope,
} from "lucide-react";

const moments = [
  { caption: "Opening the resident dashboard", cursor: { left: "11%", top: "25%" }, scroll: 0 },
  { caption: "Reviewing the resident summary", cursor: { left: "57%", top: "34%" }, scroll: 0 },
  { caption: "Checking completion targets", cursor: { left: "78%", top: "67%" }, scroll: 0 },
  { caption: "Viewing recent dashboard activity", cursor: { left: "66%", top: "78%" }, scroll: -46 },
] as const;

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Postings", icon: CalendarDays },
  { label: "Case Logs", icon: FileText, badge: "2/50" },
  { label: "Procedures", icon: Stethoscope, badge: "4/101" },
  { label: "Academics", icon: GraduationCap },
  { label: "Assessments", icon: ClipboardCheck },
  { label: "Milestones", icon: Award },
] as const;

const progressRows = [
  { label: "Clinical cases", value: 2 },
  { label: "Procedures", value: 3 },
  { label: "Case discussions", value: 6 },
] as const;

function MiniProgress({ phase }: { phase: number }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/80 p-2">
      {progressRows.map((item) => (
        <div key={item.label}>
          <div className="mb-0.5 flex items-center justify-between text-[5px]">
            <span className="font-semibold text-slate-600">{item.label}</span>
            <span className="font-bold text-teal-700">{item.value}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-600 to-cyan-400 transition-[width] duration-1000 ease-out"
              style={{ width: phase >= 2 ? `${item.value}%` : "0%" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniDashboard({ phase }: { phase: number }) {
  return (
    <div
      className="space-y-2 p-2 transition-transform duration-1000 ease-in-out"
      style={{ transform: `translateY(${moments[phase].scroll}px)` }}
    >
      <div className="overflow-hidden rounded-xl border border-white bg-white/80 shadow-sm">
        <div className="h-1 bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400" />
        <div className="grid grid-cols-[.82fr_1.18fr] gap-2 p-2">
          <div className="flex min-h-[76px] flex-col justify-center rounded-[10px] bg-gradient-to-br from-teal-950 via-teal-800 to-cyan-700 p-2.5 text-white">
            <p className="text-[4.5px] font-bold uppercase tracking-[.18em] text-teal-100">Pediatrics</p>
            <p className="mt-1.5 text-[12px] font-semibold leading-tight">Welcome back!</p>
            <p className="mt-2 text-[4.5px] leading-2 text-teal-50/75">Your clinical record and verification status are summarised here.</p>
            <div className="mt-2 flex items-center gap-1 text-[4.5px] text-teal-50/70"><span className="h-px w-3 bg-teal-200/60" /> Batch 2024</div>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 p-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 text-[7px] font-bold text-white">AP</div>
              <p className="text-[4px] font-bold uppercase tracking-[.15em] text-teal-700">Resident profile</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-slate-100">
              {[
                ["Registration", "PG2024-PAED-187"],
                ["Department", "Pediatrics"],
                ["Date of joining", "01/06/24"],
                ["Completion", "01/06/27"],
              ].map(([label, value]) => (
                <div key={label} className="bg-white px-2 py-1.5">
                  <p className="text-[3.5px] font-bold uppercase tracking-wide text-teal-700">{label}</p>
                  <p className="mt-0.5 truncate text-[5px] font-semibold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1.06fr_.94fr] items-center gap-2 rounded-xl border border-white bg-white/80 p-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full p-1.5 transition-all duration-1000"
            style={{ background: `conic-gradient(from -90deg, #0d9488 0deg, #06b6d4 ${phase >= 2 ? 14.4 : 0}deg, #e2e8f0 ${phase >= 2 ? 14.4 : 0}deg)` }}
          >
            <div className="grid h-full w-full place-items-center rounded-full bg-white text-center shadow-inner">
              <div><p className="text-[9px] font-bold text-slate-900">4%</p><p className="text-[3px] font-bold uppercase tracking-wide text-slate-400">Complete</p></div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[4px] font-bold uppercase tracking-[.14em] text-teal-700">Dashboard insights</p>
            <p className="mt-1 text-[7px] font-bold leading-tight text-slate-900">You need 194 more entries to complete the core targets.</p>
            <span className="mt-1.5 inline-block rounded-full bg-teal-50 px-1.5 py-0.5 text-[4px] font-bold text-teal-700">Getting started</span>
          </div>
        </div>
        <MiniProgress phase={phase} />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          ["Clinical cases", "1 of 50", "2%"],
          ["Procedures", "3 of 101", "3%"],
          ["Case discussions", "3 of 50", "6%"],
        ].map(([label, count, percent]) => (
          <div key={label} className="rounded-lg border border-white bg-white/80 p-2 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-teal-500 to-cyan-500 text-white"><FileText className="h-2.5 w-2.5" /></div>
              <span className="text-[6px] font-bold text-teal-700">{percent}</span>
            </div>
            <p className="truncate text-[5px] font-bold text-slate-800">{label}</p>
            <p className="mt-0.5 text-[4px] text-slate-400">{count} required</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-white bg-white/85 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5">
          <div><p className="text-[3.5px] font-bold uppercase tracking-wide text-teal-700">Student activity</p><p className="text-[6px] font-bold text-slate-900">Recent entries</p></div>
          <span className="text-[4px] font-semibold text-teal-700">View logs →</span>
        </div>
        {[
          ["06/08/26", "Academic", "Cerebral palsy", "Pending"],
          ["04/08/26", "Procedure", "Arterial Blood Gas", "Verified"],
          ["03/08/26", "Procedure", "Endotracheal Intubation", "Verified"],
        ].map(([date, type, entry, status], index) => (
          <div key={entry} className={`grid grid-cols-[.55fr_.7fr_1.35fr_.65fr] items-center gap-1 px-2 py-1.5 text-[4px] ${index ? "border-t border-slate-100" : ""}`}>
            <span className="text-slate-400">{date}</span>
            <span className="font-semibold text-teal-700">{type}</span>
            <span className="truncate font-semibold text-slate-700">{entry}</span>
            <span className={`rounded-full px-1 py-0.5 text-center font-bold ${status === "Verified" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoginProductPreview() {
  const [phase, setPhase] = React.useState(0);
  const moment = moments[phase];

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setPhase((current) => (current + 1) % moments.length), 1900);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mt-8" role="img" aria-label="Realistic looping preview of the resident dashboard">
      <div className="overflow-hidden rounded-[22px] border border-white/25 bg-slate-950/90 shadow-[0_28px_70px_rgba(8,47,73,0.3)] ring-1 ring-black/5">
        <div className="flex h-8 items-center gap-1.5 border-b border-white/10 bg-slate-900/90 px-3">
          <span className="h-2 w-2 rounded-full bg-rose-400/85" /><span className="h-2 w-2 rounded-full bg-amber-300/85" /><span className="h-2 w-2 rounded-full bg-emerald-400/85" />
          <div className="mx-auto flex h-4 w-32 items-center justify-center rounded-full bg-white/10 text-[6px] font-medium tracking-wide text-white/55">elogbook.local/dashboard</div>
        </div>

        <div className="relative aspect-[16/10] overflow-hidden bg-[#eaf6f4] p-1.5">
          <div className="flex h-full overflow-hidden rounded-xl border border-white bg-[#f4f9f8] shadow-inner">
            <aside className="relative w-[23%] shrink-0 border-r border-teal-100 bg-white p-1.5">
              <div className="mb-3 flex items-center gap-1"><div className="flex h-4 w-4 items-center justify-center rounded-md bg-teal-600 text-white"><BookOpenCheck className="h-2.5 w-2.5" /></div><span className="text-[6px] font-bold text-slate-800">E-Logbook</span></div>
              <p className="mb-1.5 text-[3.5px] font-bold uppercase tracking-[.15em] text-teal-800/40">Student workspace</p>
              <div className="space-y-0.5">
                {navigation.map(({ label, icon: Icon, ...item }) => (
                  <div key={label} className={`flex items-center gap-1 rounded-md px-1 py-1 ${label === "Dashboard" ? "bg-gradient-to-r from-teal-600 to-cyan-500 text-white shadow-sm" : "text-slate-400"}`}>
                    <Icon className="h-2 w-2 shrink-0" /><span className="min-w-0 flex-1 truncate text-[4.5px] font-semibold">{label}</span>{"badge" in item && <span className="text-[3.5px]">{item.badge}</span>}
                  </div>
                ))}
              </div>
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5"><div className="grid h-5 w-5 place-items-center rounded-full bg-teal-100 text-[5px] font-bold text-teal-800">AP</div><p className="text-[3.5px] text-teal-700">Student portal</p></div>
            </aside>

            <div className="min-w-0 flex-1">
              <header className="flex h-7 items-center justify-between border-b border-white bg-white/75 px-2">
                <div><p className="text-[6px] font-bold text-slate-800">Department of Pediatrics</p><p className="text-[3.5px] text-slate-400">Student workspace</p></div>
                <div className="flex items-center gap-1 text-teal-700"><Printer className="h-2.5 w-2.5" /><span className="text-[4px] font-semibold">Print PDF</span><Bell className="ml-1 h-2.5 w-2.5" /></div>
              </header>
              <div className="h-[calc(100%-1.75rem)] overflow-hidden"><MiniDashboard phase={phase} /></div>
            </div>
          </div>

          {(phase === 0 || phase === 2) && <span key={`click-${phase}`} className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-teal-500/70" style={{ left: moment.cursor.left, top: moment.cursor.top }} />}
          <MousePointer2 className="pointer-events-none absolute h-4 w-4 fill-white text-slate-950 drop-shadow-md transition-all duration-700 ease-in-out" style={{ left: moment.cursor.left, top: moment.cursor.top }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p key={moment.caption} className="animate-in fade-in slide-in-from-bottom-1 text-xs font-semibold text-white">{moment.caption}</p>
        <div className="flex shrink-0 gap-1.5">{moments.map((item, index) => <span key={item.caption} className={`h-1.5 rounded-full transition-all duration-500 ${index === phase ? "w-6 bg-white" : "w-1.5 bg-white/35"}`} />)}</div>
      </div>
    </div>
  );
}
