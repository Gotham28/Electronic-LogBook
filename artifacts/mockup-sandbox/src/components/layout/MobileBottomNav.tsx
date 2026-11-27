import * as React from "react";
import { Link } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MoreHorizontal, Plus } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isDemoMode } from "@/lib/session";
import { mobileNavigationItems, navigationIsActive } from "@/lib/academic-navigation";
import type { LogCreateActionId } from "@/lib/log-create-navigation";

type BottomNavItem = { title: string; icon: React.ComponentType<{ className?: string }>; href: string; activePaths?: string[] };
export type MobileAddLogOption = {
  id: string;
  label: string;
  href: string;
  action: LogCreateActionId;
  icon: React.ComponentType<{ className?: string }>;
};

// Which of a role's own menu items get a slot, in order. Items come from the same list as the
// sidebar, which already follows the department's settings, so a page a department does not
// use (e.g. case logs in Radiology) is simply absent and the next one takes its place.
const SHORT_LABELS: Record<string, string> = {
  Dashboard: "Home",
  "Case Logs": "Cases",
  "Procedure Logs": "Procedures",
  "Clinical Work": "Clinical",
  "Academic Activities": "Academics",
  "Postings & Rotations": "Postings",
  "Teaching & Learning": "Teaching",
  "Practicals & Postings": "Practicals",
  "Research & Events": "Research",
  "Assessments & Appraisal": "Assessments",
  "Daily Record & Attendance": "Daily record",
  "Evaluation Queue": "Queue",
  "Student Progress": "Students",
  "Review Queue": "Reviews",
};

// Phones only (hidden from 640px up, and in print): for Students, two main pages on each side
// of the centered "Add log" menu (with "More" on the far right); Faculty and HOD keep up to four
// main pages plus "More".
export function MobileBottomNav({
  role,
  items,
  location,
  departmentKey,
  switching = false,
  hasCustomOrder = false,
  addLogOptions = [],
  onAddLogSelect,
}: {
  role: "Student" | "Faculty" | "HOD";
  items: BottomNavItem[];
  location: string;
  departmentKey: number;
  switching?: boolean;
  hasCustomOrder?: boolean;
  addLogOptions?: MobileAddLogOption[];
  onAddLogSelect?: (option: MobileAddLogOption) => void;
}) {
  const { setOpenMobile } = useSidebar();
  const demoMode = isDemoMode();
  const reduceMotion = useReducedMotion();
  // Picking a page from the full menu closes it, so the page is not left hidden behind the menu.
  React.useEffect(() => { setOpenMobile(false); }, [location, setOpenMobile]);
  const slots = React.useMemo(() => {
    if (role !== "Student") {
      return mobileNavigationItems(role, items, hasCustomOrder);
    }
    const dashboard = items.filter((item) => item.href === "/");
    const rest = items.filter((item) => item.href !== "/");
    return [...dashboard, ...rest].slice(0, 3);
  }, [role, items, hasCustomOrder]);
  const visibleSlots = switching ? [] : slots;
  const leftSlots = role === "Student" ? visibleSlots.slice(0, 2) : visibleSlots;
  const rightSlots = role === "Student" ? visibleSlots.slice(2, 3) : [];
  const addLogDisabled = switching || addLogOptions.length === 0;
  const cell = "flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 pt-1 text-xs font-semibold leading-none transition-colors active:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  const renderSlot = (item: BottomNavItem) => {
    const isActive = navigationIsActive(location, item);
    const Icon = item.icon;
    const itemContent = (
      <Link href={item.href} data-demo-target={`nav:${item.href}`} data-demo-navigation-href={item.href} aria-current={isActive ? "page" : undefined}
        className={`${cell} ${isActive ? (demoMode ? "" : "text-forest") : "text-helper hover:text-ink"}`}
        style={demoMode && isActive ? { color: "var(--demo-accent)" } : undefined}>
        <span data-mobile-nav-icon className={`grid h-8 w-9 place-items-center rounded-full transition-colors ${isActive && !demoMode ? "bg-mist text-forest" : "text-helper"}`}
          style={demoMode && isActive ? { backgroundColor: "var(--gothos-sage)", color: "var(--demo-accent)" } : undefined}>
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
  };

  return (
    <nav aria-label="Main pages" className="print-hidden fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_color-mix(in_srgb,var(--gothos-forest)_7%,transparent)] backdrop-blur-xl sm:hidden">
      <ul className="flex min-h-[60px]">
        <AnimatePresence>
          {leftSlots.map(renderSlot)}
        </AnimatePresence>

        {role === "Student" && (
          <li className="flex min-w-0 flex-1 items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={addLogDisabled}
                  aria-label="Add log"
                  className={`${cell} text-forest disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span
                    className="grid h-9 w-9 place-items-center rounded-full bg-forest text-white shadow-sm transition-colors"
                    style={demoMode ? { backgroundColor: "var(--demo-accent)", color: "var(--demo-accent-foreground)" } : undefined}
                  >
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="w-full truncate text-center tracking-tight">Add log</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="center"
                sideOffset={12}
                collisionPadding={12}
                className="max-h-[min(65dvh,28rem)] w-64 overflow-y-auto rounded-2xl border-line-soft bg-white p-1.5 shadow-[0_24px_60px_color-mix(in_srgb,var(--gothos-forest)_16%,transparent)]"
              >
                <DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-bold text-ink">
                  Add log
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {addLogOptions.map((option) => {
                  const OptionIcon = option.icon;
                  return (
                    <DropdownMenuItem
                      key={option.id}
                      onSelect={() => onAddLogSelect?.(option)}
                      className="min-h-10 cursor-pointer gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-ink focus:bg-mist focus:text-forest"
                    >
                      <OptionIcon className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
                      <span className="truncate">{option.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}

        <AnimatePresence>
          {rightSlots.map(renderSlot)}
        </AnimatePresence>

        <li className="flex min-w-0 flex-1">
          <button type="button" data-demo-target="mobile-more" onClick={() => setOpenMobile(true)} aria-label="More pages" className={`${cell} text-helper hover:text-ink`}>
            <span data-mobile-nav-icon className="grid h-8 w-9 place-items-center rounded-full text-helper transition-colors">
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
