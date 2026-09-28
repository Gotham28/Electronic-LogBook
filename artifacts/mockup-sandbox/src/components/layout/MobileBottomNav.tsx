import * as React from "react";
import { Link } from "wouter";
import { Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

type BottomNavItem = { title: string; icon: React.ComponentType<{ className?: string }>; href: string };

// Which of a role's own menu items get a slot, in order. Items come from the same list as the
// sidebar, which already follows the department's settings, so a page a department does not
// use (e.g. case logs in Radiology) is simply absent and the next one takes its place.
const PRIORITY: Record<"Student" | "Faculty" | "HOD", string[]> = {
  Student: ["/", "/cases", "/clinical-works", "/procedures", "/academics", "/postings"],
  Faculty: ["/", "/mentees", "/assessments"],
  HOD: ["/roster", "/mentees", "/review-queue", "/requirements"],
};

const SHORT_LABELS: Record<string, string> = {
  Dashboard: "Home",
  "Case Logs": "Cases",
  "Procedure Logs": "Procedures",
  "Clinical Work": "Clinical",
  "Academic Activities": "Academics",
  "Postings & Rotations": "Postings",
  "Evaluation Queue": "Queue",
  "Student Progress": "Students",
  "Review Queue": "Reviews",
};

// Phones only (hidden from 640px up, and in print): up to four main pages one tap away, and
// "More" for the full menu.
export function MobileBottomNav({ role, items, location }: { role: "Student" | "Faculty" | "HOD"; items: BottomNavItem[]; location: string }) {
  const { setOpenMobile } = useSidebar();
  // Picking a page from the full menu closes it, so the page is not left hidden behind the menu.
  React.useEffect(() => { setOpenMobile(false); }, [location, setOpenMobile]);
  const byHref = new Map(items.map((item) => [item.href, item]));
  const slots = PRIORITY[role].map((href) => byHref.get(href)).filter((item): item is BottomNavItem => !!item).slice(0, 4);
  const cell = "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold leading-none";

  return (
    <nav aria-label="Main pages" className="print-hidden fixed inset-x-0 bottom-0 z-40 border-t border-teal-100 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur-md sm:hidden">
      <ul className="flex">
        {slots.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex min-w-0 flex-1">
              <Link href={item.href} aria-current={isActive ? "page" : undefined}
                className={`${cell} ${isActive ? "text-teal-700" : "text-slate-500"}`}>
                <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? "bg-teal-100" : ""}`}><Icon className="h-5 w-5" /></span>
                <span className="w-full truncate text-center tracking-tight">{SHORT_LABELS[item.title] ?? item.title}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-1">
          <button type="button" onClick={() => setOpenMobile(true)} className={`${cell} text-slate-500`}>
            <span className="grid h-7 w-12 place-items-center rounded-full"><Menu className="h-5 w-5" /></span>
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
