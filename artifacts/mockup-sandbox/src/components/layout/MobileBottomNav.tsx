import * as React from "react";
import { Link } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { isDemoMode } from "@/lib/session";

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
export function MobileBottomNav({ role, items, location, departmentKey, switching = false }: { role: "Student" | "Faculty" | "HOD"; items: BottomNavItem[]; location: string; departmentKey: number; switching?: boolean }) {
  const { setOpenMobile } = useSidebar();
  const demoMode = isDemoMode();
  const reduceMotion = useReducedMotion();
  // Picking a page from the full menu closes it, so the page is not left hidden behind the menu.
  React.useEffect(() => { setOpenMobile(false); }, [location, setOpenMobile]);
  const byHref = new Map(items.map((item) => [item.href, item]));
  const slots = PRIORITY[role].map((href) => byHref.get(href)).filter((item): item is BottomNavItem => !!item).slice(0, 4);
  const visibleSlots = switching ? [] : slots;
  const cell = "flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 pt-1 text-xs font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600";

  return (
    <nav aria-label="Main pages" className="print-hidden fixed inset-x-0 bottom-0 z-40 border-t border-teal-100/80 bg-white/96 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:hidden">
      <ul className="flex min-h-[60px]">
        <AnimatePresence>
        {visibleSlots.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          const Icon = item.icon;
          const itemContent = (
            <Link href={item.href} aria-current={isActive ? "page" : undefined}
              className={`${cell} ${isActive ? (demoMode ? "" : "text-teal-800") : "text-slate-500 hover:text-slate-800"}`}
              style={demoMode && isActive ? { color: "var(--demo-accent-readable)" } : undefined}>
              <span data-mobile-nav-icon className={`grid h-8 w-9 place-items-center rounded-full transition-colors ${isActive && !demoMode ? "bg-teal-50 text-teal-700" : "text-slate-500"}`}
                style={demoMode && isActive ? { backgroundColor: "color-mix(in srgb, var(--demo-accent) 10%, white)", color: "var(--demo-accent-readable)" } : undefined}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="w-full truncate text-center tracking-tight">{SHORT_LABELS[item.title] ?? item.title}</span>
            </Link>
          );
          return demoMode ? (
            <motion.li key={`${departmentKey}-${item.href}`} className="flex min-w-0 flex-1"
              initial={reduceMotion ? false : { opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 7, transition: { duration: 0.12 } }}
              transition={{ duration: reduceMotion ? 0 : 0.16 }}>
              {itemContent}
            </motion.li>
          ) : (
            <li key={item.href} className="flex min-w-0 flex-1">
              {itemContent}
            </li>
          );
        })}
        </AnimatePresence>
        <li className="flex min-w-0 flex-1">
          <button type="button" onClick={() => setOpenMobile(true)} aria-label="More pages" className={`${cell} text-slate-500 hover:text-slate-800`}>
            <span data-mobile-nav-icon className="grid h-8 w-9 place-items-center rounded-full text-slate-500 transition-colors">
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
