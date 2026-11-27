import * as React from "react";
import type { AcademicLogbookProfile } from "@/lib/academic-logbook";
import { categorySections, logbookCategory } from "@/lib/academic-navigation";
import type { DepartmentConfig } from "@/lib/department-context";
import { getCurrentUser } from "@/lib/session";

export const CREATE_INTENT_PARAM = "create";
export const LOG_CREATE_INTENT_EVENT = "elogbook:log-create-intent";
const CREATE_INTENT_STATE_KEY = "__elogbookCreateIntentScope";

export type LogCreateActionId =
  | "case"
  | "procedure"
  | "clinical-work"
  | "academic"
  | "conference"
  | "posting"
  | "award"
  | "certification"
  | "thesis"
  | "milestone-thesis"
  | "milestone-certification"
  | "leave";

export const ALLOWLISTED_LOG_CREATE_ACTIONS: readonly LogCreateActionId[] = [
  "case",
  "procedure",
  "clinical-work",
  "academic",
  "conference",
  "posting",
  "award",
  "certification",
  "thesis",
  "milestone-thesis",
  "milestone-certification",
  "leave",
];

export interface LogCreateEligibilityContext {
  action: LogCreateActionId;
  targetPath: string;
  isStudent: boolean;
  config: DepartmentConfig | null | undefined;
  demoMode?: boolean;
  academicLogbook?: AcademicLogbookProfile | null;
  academics?: ReadonlyArray<{ value: string }>;
  clinicalWorkCategoriesCount?: number;
}

export interface LogCreateScope {
  userId: number;
  studentProfileId: number | null;
  role: string;
  departmentId: number | null;
  demoMode: boolean;
}

interface StoredCreateIntentMeta {
  action: LogCreateActionId;
  scope: LogCreateScope;
}

export function hasSelectableAcademicOptions(
  academicLogbook: AcademicLogbookProfile | null | undefined,
  academics: ReadonlyArray<{ value: string }> = [],
  categoryId?: string,
): boolean {
  const category = logbookCategory(academicLogbook, categoryId);
  if (categoryId && !category) return false;
  const sections = categorySections(academicLogbook, categoryId);
  const hasConfiguredOption = academics.some(
    (option) =>
      (!categoryId || Boolean(category?.sectionValues.includes(option.value))) &&
      !academicLogbook?.sections.some((section) => section.value === option.value && section.archived),
  );
  if (hasConfiguredOption) return true;
  return sections.some((section) => !academics.some((option) => option.value === section.value));
}

export function getCurrentLogCreateScope(): LogCreateScope | null {
  if (typeof window === "undefined") return null;
  const user = getCurrentUser();
  if (!user) return null;
  return {
    userId: user.id,
    studentProfileId: user.studentProfileId ?? null,
    role: user.role,
    departmentId: user.departmentId ?? null,
    demoMode: Boolean(user.isDemoMode),
  };
}

function isValidLogCreateScope(value: unknown): value is LogCreateScope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "number" &&
    (candidate.studentProfileId === null || typeof candidate.studentProfileId === "number") &&
    typeof candidate.role === "string" &&
    (candidate.departmentId === null || typeof candidate.departmentId === "number") &&
    typeof candidate.demoMode === "boolean"
  );
}

function scopesMatch(expected: LogCreateScope, actual: LogCreateScope | null): boolean {
  if (!actual) return false;
  return (
    expected.userId === actual.userId &&
    expected.studentProfileId === actual.studentProfileId &&
    expected.role === actual.role &&
    expected.departmentId === actual.departmentId &&
    expected.demoMode === actual.demoMode
  );
}

function readStoredCreateIntentMeta(state: unknown): StoredCreateIntentMeta | null {
  if (!state || typeof state !== "object") return null;
  const rawMeta = (state as Record<string, unknown>)[CREATE_INTENT_STATE_KEY];
  if (!rawMeta || typeof rawMeta !== "object") return null;
  const meta = rawMeta as Record<string, unknown>;
  const action = typeof meta.action === "string" ? meta.action : null;
  if (!isAllowlistedLogCreateAction(action)) return null;
  if (!isValidLogCreateScope(meta.scope)) return null;
  return { action, scope: meta.scope };
}

function withoutCreateIntentMeta(state: unknown): unknown {
  if (!state || typeof state !== "object" || !(CREATE_INTENT_STATE_KEY in state)) {
    return state;
  }
  const rest = { ...(state as Record<string, unknown>) };
  delete rest[CREATE_INTENT_STATE_KEY];
  return Object.keys(rest).length > 0 ? rest : null;
}

export function attachCreateIntentScopeToHistory(action: LogCreateActionId, scope: LogCreateScope): void {
  if (typeof window === "undefined") return;
  const baseState =
    window.history.state && typeof window.history.state === "object"
      ? (window.history.state as Record<string, unknown>)
      : {};
  const nextState = {
    ...baseState,
    [CREATE_INTENT_STATE_KEY]: { action, scope } satisfies StoredCreateIntentMeta,
  };
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.history.replaceState(nextState, "", currentUrl);
}

function isRouteActionEligible(
  action: LogCreateActionId,
  targetPath: string,
  features: Record<string, boolean>,
  demoMode: boolean,
  clinicalWorkCategoriesCount: number,
  academicsFirstMode: boolean,
): boolean {
  switch (action) {
    case "case":
      return targetPath === "/cases" && !features.hideCaseLogs;
    case "procedure":
      return targetPath === "/procedures" && !features.hideProcedureLogs;
    case "clinical-work":
      return (
        targetPath === "/clinical-works" &&
        Boolean(features.clinicalWorks) &&
        clinicalWorkCategoriesCount > 0 &&
        (!academicsFirstMode || demoMode)
      );
    case "academic":
      return targetPath === "/academics" || targetPath.startsWith("/academics/");
    case "conference":
      return targetPath === "/conferences" && Boolean(features.attendedConferences);
    case "posting":
      return targetPath === "/postings";
    case "award":
      return targetPath === "/awards" && Boolean(features.awards) && (!academicsFirstMode || Boolean(features.academicsFirstInNav));
    case "certification":
      return targetPath === "/certifications";
    case "thesis":
      return targetPath === "/thesis";
    case "milestone-thesis":
    case "milestone-certification":
      return targetPath === "/milestones";
    case "leave":
      return (
        targetPath === "/attendance" &&
        !features.yearlyAttendance &&
        !features.dailyAttendance &&
        !features.hideLeaveRecords
      );
  }
}

export function isLogCreateEligible({
  action,
  targetPath,
  isStudent,
  config,
  demoMode = false,
  academicLogbook,
  academics = [],
  clinicalWorkCategoriesCount = 0,
}: LogCreateEligibilityContext): boolean {
  if (!isStudent || !config) return false;
  const features = config.enabledFeatures ?? {};

  if (academicLogbook?.navigationCategories?.length) {
    const allowedProfileRoutes = new Set<string>(["/certifications", "/attendance"]);
    for (const category of academicLogbook.navigationCategories) {
      if (hasSelectableAcademicOptions(academicLogbook, academics, category.id)) {
        allowedProfileRoutes.add(`/academics/${category.id}`);
      }
      for (const related of category.relatedPages ?? []) {
        allowedProfileRoutes.add(related.href);
      }
    }
    if (!allowedProfileRoutes.has(targetPath)) {
      return false;
    }
    if (action === "academic") {
      if (targetPath.startsWith("/academics/")) {
        const categoryId = targetPath.slice("/academics/".length);
        return hasSelectableAcademicOptions(academicLogbook, academics, categoryId);
      }
      if (targetPath === "/academics") {
        return hasSelectableAcademicOptions(academicLogbook, academics);
      }
      return false;
    }
    return isRouteActionEligible(action, targetPath, features, demoMode, clinicalWorkCategoriesCount, false);
  }

  if (action === "academic") {
    return targetPath === "/academics" && hasSelectableAcademicOptions(academicLogbook, academics);
  }
  if (action === "thesis" || action === "certification") {
    if (!features.splitThesisAndCertifications) return false;
  }
  if (action === "milestone-thesis" || action === "milestone-certification") {
    if (features.splitThesisAndCertifications) return false;
  }
  if (action === "award" && !features.academicsFirstInNav) {
    return false;
  }

  return isRouteActionEligible(
    action,
    targetPath,
    features,
    demoMode,
    clinicalWorkCategoriesCount,
    Boolean(features.academicsFirstInNav),
  );
}

export function isAllowlistedLogCreateAction(value: string | null | undefined): value is LogCreateActionId {
  return typeof value === "string" && (ALLOWLISTED_LOG_CREATE_ACTIONS as readonly string[]).includes(value);
}

export function buildCreateIntentHref(baseHref: string, action: LogCreateActionId): string {
  const hashIndex = baseHref.indexOf("#");
  const pathAndQuery = hashIndex === -1 ? baseHref : baseHref.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : baseHref.slice(hashIndex);
  const queryIndex = pathAndQuery.indexOf("?");
  const pathname = queryIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : pathAndQuery.slice(queryIndex + 1);
  const params = new URLSearchParams(search);
  params.set(CREATE_INTENT_PARAM, action);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

export function dispatchLogCreateIntent(action: LogCreateActionId, href: string, scope?: LogCreateScope | null): void {
  if (typeof window === "undefined") return;
  const targetPath = href.split(/[?#]/, 1)[0];
  window.dispatchEvent(
    new CustomEvent<{ action: LogCreateActionId; href: string; targetPath: string; scope?: LogCreateScope | null }>(LOG_CREATE_INTENT_EVENT, {
      detail: { action, href, targetPath, scope },
    }),
  );
}

export function consumeLogCreateIntent(
  allowedActions: readonly LogCreateActionId[],
  expectedPath?: string,
): LogCreateActionId | null {
  if (typeof window === "undefined") return null;
  if (expectedPath && window.location.pathname !== expectedPath) {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(CREATE_INTENT_PARAM);
  if (!isAllowlistedLogCreateAction(raw) || !allowedActions.includes(raw)) {
    return null;
  }
  const meta = readStoredCreateIntentMeta(window.history.state);
  const scopeAllowed = !meta || (meta.action === raw && scopesMatch(meta.scope, getCurrentLogCreateScope()));
  params.delete(CREATE_INTENT_PARAM);
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  window.history.replaceState(withoutCreateIntentMeta(window.history.state), "", nextUrl);
  return scopeAllowed ? raw : null;
}

export interface UseLogCreateIntentOptions {
  targetPath: string;
  ready?: boolean;
  eligible?: boolean;
  isActionEligible?: (action: LogCreateActionId) => boolean;
}

export function useLogCreateIntent(
  allowedActions: readonly LogCreateActionId[],
  onCreate: (action: LogCreateActionId) => void,
  options: UseLogCreateIntentOptions,
) {
  const ready = options.ready ?? true;
  const eligible = options.eligible ?? true;
  const targetPath = options.targetPath;
  const onCreateRef = React.useRef(onCreate);
  onCreateRef.current = onCreate;
  const isActionEligibleRef = React.useRef(options.isActionEligible);
  isActionEligibleRef.current = options.isActionEligible;
  const allowedKey = allowedActions.join(",");

  React.useEffect(() => {
    if (!ready) return;
    const actions = (allowedKey ? allowedKey.split(",") : []) as LogCreateActionId[];

    const handleAction = (action: LogCreateActionId) => {
      const actionEligible = eligible && (isActionEligibleRef.current ? isActionEligibleRef.current(action) : true);
      if (!actionEligible) return;
      onCreateRef.current(action);
    };

    const checkUrl = () => {
      const consumed = consumeLogCreateIntent(actions, targetPath);
      if (consumed) {
        handleAction(consumed);
      }
    };

    checkUrl();

    const handleCustomIntent = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: LogCreateActionId; href?: string; targetPath?: string; scope?: LogCreateScope | null }>).detail;
      if (!detail?.action || !actions.includes(detail.action)) return;
      const eventPath = detail.targetPath ?? detail.href?.split(/[?#]/, 1)[0];
      if (eventPath !== targetPath || window.location.pathname !== targetPath) return;
      if (detail.scope && !scopesMatch(detail.scope, getCurrentLogCreateScope())) {
        consumeLogCreateIntent(actions, targetPath);
        return;
      }
      const consumed = consumeLogCreateIntent(actions, targetPath);
      if (!consumed) return;
      handleAction(consumed);
    };

    window.addEventListener("popstate", checkUrl);
    window.addEventListener(LOG_CREATE_INTENT_EVENT, handleCustomIntent);
    return () => {
      window.removeEventListener("popstate", checkUrl);
      window.removeEventListener(LOG_CREATE_INTENT_EVENT, handleCustomIntent);
    };
  }, [allowedKey, eligible, ready, targetPath]);
}
