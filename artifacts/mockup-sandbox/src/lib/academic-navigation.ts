import type { AcademicLogbookProfile } from "../../../../lib/api-zod/src/academic-logbook";
import { readAcademicRecord } from "../../../../lib/api-zod/src/academic-logbook";

export function categoryPath(categoryId: string): string {
  return `/academics/${categoryId}`;
}

export function logbookCategory(profile: AcademicLogbookProfile | null | undefined, categoryId?: string) {
  return profile?.navigationCategories?.find((category) => category.id === categoryId);
}

export function categorySections(profile: AcademicLogbookProfile | null | undefined, categoryId?: string, year = "all") {
  const category = logbookCategory(profile, categoryId);
  return (profile?.sections ?? []).filter((section) => !section.archived && (!categoryId || !!category?.sectionValues.includes(section.value))
    && (year === "all" || section.years.includes(Number(year))));
}

export function filterAcademicLogs<T extends { activityType: string; description?: string | null }>(
  logs: T[], profile: AcademicLogbookProfile | null | undefined, categoryId?: string, year = "all",
): T[] {
  const category = logbookCategory(profile, categoryId);
  return logs.filter((log) => (!categoryId || !!category?.sectionValues.includes(log.activityType))
    && (year === "all" || !profile || readAcademicRecord(log.description)?.trainingYear === Number(year)));
}

export function profileNavigation(profile: AcademicLogbookProfile | null | undefined) {
  if (!profile?.navigationCategories?.length) return null;
  return [
    { title: "Dashboard", href: "/", icon: "dashboard", activePaths: ["/dashboard"] },
    ...profile.navigationCategories.map((category) => ({
      title: category.title, href: categoryPath(category.id), icon: category.icon,
      activePaths: (category.relatedPages ?? []).map((page) => page.href),
    })),
    { title: "Certifications", href: "/certifications", icon: "certifications", activePaths: [] },
    { title: "Leave Records", href: "/attendance", icon: "daily", activePaths: [] },
  ];
}

export function navigationIsActive(location: string, item: { href: string; activePaths?: string[] }): boolean {
  const path = location.split(/[?#]/, 1)[0];
  return [item.href, ...(item.activePaths ?? [])].some((href) => path === href || (href !== "/" && path.startsWith(`${href}/`)));
}

export function readStudentNavOrder(enabledFeatures: Record<string, unknown> | null | undefined): string[] {
  const raw = enabledFeatures?.studentNavOrder;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.length <= 64 && /^\/[a-z0-9/-]*$/.test(item) && item !== "/" && !seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length >= 30) break;
    }
  }
  return result;
}

export function applyNavOrder<T extends { href: string }>(items: T[], order: string[]): T[] {
  if (!order.length) return items;
  const dashboard = items.filter((item) => item.href === "/");
  const rest = items.filter((item) => item.href !== "/");
  const byHref = new Map(rest.map((item) => [item.href, item]));
  const listed: T[] = [];
  const listedHrefs = new Set<string>();
  for (const href of order) {
    const match = byHref.get(href);
    if (match && !listedHrefs.has(href)) {
      listed.push(match);
      listedHrefs.add(href);
    }
  }
  const remaining = rest.filter((item) => !listedHrefs.has(item.href));
  return [...dashboard, ...listed, ...remaining];
}

export function mobileNavigationItems<T extends { href: string }>(role: "Student" | "Faculty" | "HOD", items: T[], hasCustomOrder = false): T[] {
  const priority = {
    Student: ["/", "/cases", "/clinical-works", "/procedures", "/academics", "/postings"],
    Faculty: ["/", "/review-queue", "/mentees", "/assessments"],
    HOD: ["/roster", "/mentees", "/review-queue", "/requirements"],
  };
  const paths = role === "Student" && (hasCustomOrder || items.some((item) => item.href.startsWith("/academics/")))
    ? items.map((item) => item.href) : priority[role];
  return paths.flatMap((href) => items.filter((item) => item.href === href)).slice(0, 4);
}
