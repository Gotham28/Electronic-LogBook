import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, MousePointer2, Pause, Play, RotateCcw, X } from "lucide-react";
import { EndCard } from "./EndCard";
import { startDemoSession, isDemoMovieActive, DEMO_MOVIE_CHANGED_EVENT, DEMO_MOVIE_REPLAY_EVENT, clearDemoMovie } from "@/lib/demoSession";
import { isDemoMode } from "@/lib/session";

type Role = "Student" | "Faculty" | "HOD";
type NavigationItem = { title: string; href: string };
type DemoMovieProps = {
  activeRole: Role;
  navigationItems: NavigationItem[];
  navigate: (path: string) => void;
  blocked: boolean;
  arogyaOpen: boolean;
  setArogyaOpen: (open: boolean) => void;
};
type Point = { x: number; y: number };
type Stage = "ready" | "playing" | "paused" | "complete";
type Candidate = { element: HTMLElement; id: string; kind: string; preview: boolean };

const ROLES: Role[] = ["Student", "Faculty", "HOD"];
const ROLE_VALUES: Record<Role, string> = { Student: "student", Faculty: "faculty", HOD: "hod" };
const PAGE_COPY: Record<string, string> = {
  "/": "See the current workspace, training summary, and the routes available to this role.",
  "/cases": "Review the case log list, its filters, and the form used to add a case.",
  "/procedures": "Review procedure records, competency details, and the available log actions.",
  "/clinical-works": "Review clinical work categories and the controls for recording activity.",
  "/academics": "Review academic activity records and the controls for adding an entry.",
  "/conferences": "Review conference records and the available entry controls.",
  "/postings": "Review rotation details and the controls for recording a posting.",
  "/attendance": "Review leave information and the controls for a leave request.",
  "/assessments": "Review assessment and appraisal views available to this role.",
  "/milestones": "Review thesis and certification progress in one place.",
  "/thesis": "Review thesis or publication records and their available controls.",
  "/certifications": "Review certification records and their available controls.",
  "/awards": "Review the awards and achievements section.",
  "/mentees": "Review assigned resident progress and the available record views.",
  "/review-queue": "Review the department queue and the faculty review workflow.",
  "/roster": "Review the resident roster and its filters and management options.",
  "/student-access": "Review the student-access queue and its available review steps.",
  "/professors": "Review faculty-management options.",
  "/leave-approvals": "Review leave requests and the approval workflow.",
  "/requirements": "Review department-configured training requirements and catalog options.",
};
const FINAL_ACTION = /^(save|submit|approve|reject|delete|remove|deactivate|activate|reactivate|restore|suspend|archive|unarchive|assign|unassign|revoke|withdraw|return|reopen|disable|enable|sign out|log out|print|reset|publish|complete|confirm|send|export|download|upload|import|verify|request revision|draft|create account|change password|apply changes|accept|decline)(?:\b|$)/i;
const FINAL_ACTION_ICON = /\blucide-(trash|trash-2|delete|user-x|user-round-x|user-minus|archive|ban|circle-x|x-circle)\b/i;
const OMIT_ACTION = /^(skip|exit|replay demo|mute demo sounds|unmute demo sounds|reset demo|demo department|demo role|more pages|open guided tour|take a guided tour)$/i;

function roleName(role: Role) {
  return role === "Student" ? "Resident" : role;
}

function pathFor(href: string) {
  if (href.startsWith("#")) return window.location.pathname;
  try { return new URL(href, window.location.origin).pathname; } catch { return href; }
}

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && element.getAttribute("aria-hidden") !== "true";
}

function labelFor(element: HTMLElement) {
  const aria = element.getAttribute("aria-label") || element.getAttribute("title");
  if (aria) return aria.trim();
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const label = element.labels?.[0]?.textContent?.trim();
    return label || element.getAttribute("placeholder") || element.getAttribute("name") || "";
  }
  return element.textContent?.replace(/\s+/g, " ").trim() || "";
}

function actionKind(element: HTMLElement) {
  if (element instanceof HTMLAnchorElement) return "link";
  if (element instanceof HTMLSelectElement) return "choice list";
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return "field";
  if (element.getAttribute("role") === "tab") return "tab";
  if (["option", "menuitem", "menuitemcheckbox", "menuitemradio"].includes(element.getAttribute("role") || "")) return "choice option";
  if (element.getAttribute("role") === "switch" || element.getAttribute("role") === "checkbox" || element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) return "setting";
  return "button";
}

function boundaryAction(element: HTMLElement) {
  const label = labelFor(element);
  const iconOnlyFinalAction = !label && !!element.querySelector("svg") && FINAL_ACTION_ICON.test(element.querySelector("svg")?.getAttribute("class") || "");
  const valueChangingChoice = ["option", "menuitem", "menuitemcheckbox", "menuitemradio", "checkbox", "radio", "switch"].includes(element.getAttribute("role") || "") || element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type);
  return (element instanceof HTMLButtonElement && element.type === "submit") || element.hasAttribute("data-demo-preview") || element.hasAttribute("data-demo-sidebar-trigger") || FINAL_ACTION.test(label) || iconOnlyFinalAction || valueChangingChoice;
}

function collectPageActions(role: Role, route: string, ids: WeakMap<HTMLElement, string>, nextId: { value: number }): Candidate[] {
  const main = document.querySelector<HTMLElement>("main[data-demo-page]");
  if (!main) return [];
  const surfaces: HTMLElement[] = [main];
  const header = document.querySelector<HTMLElement>("header");
  if (header && isVisible(header)) surfaces.push(header);
  document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"],[data-slot="alert-dialog-content"],[data-tour="arogya-panel"],[role="menu"],[role="listbox"]').forEach((el) => {
    if (isVisible(el)) surfaces.push(el);
  });
  document.querySelectorAll<HTMLElement>('[data-tour="arogya-launcher"]').forEach((el) => {
    if (isVisible(el)) surfaces.push(el);
  });
  const result: Candidate[] = [];
  const seenSignatures = new Set<string>();
  const pageRoutes = new Set(Array.from(document.querySelectorAll<HTMLElement>("[data-demo-navigation-href]")).map((el) => pathFor(el.dataset.demoNavigationHref || "")));
  const selectors = "a[href],button,input:not([type=hidden]):not([type=password]),textarea,select,[role=tab],[role=switch],[role=checkbox],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option]";
  for (const surface of surfaces) {
    const nodes = [...(surface.matches(selectors) ? [surface] : []), ...Array.from(surface.querySelectorAll<HTMLElement>(selectors))];
    for (const node of nodes) {
      if (!isVisible(node) || node.matches(":disabled,[aria-disabled=true]") || node.closest("[data-demo-player],[data-demo-chrome]")) continue;
      if (node instanceof HTMLAnchorElement) {
        const url = new URL(node.href, window.location.href);
        if (url.origin !== window.location.origin || url.pathname === route || pageRoutes.has(url.pathname)) continue;
        if (node.hasAttribute("download") || url.pathname === "/print") continue;
      }
      if (node instanceof HTMLInputElement && ["submit", "button", "image", "reset", "password"].includes(node.type)) continue;
      const label = labelFor(node);
      if (OMIT_ACTION.test(label)) continue;
      if (node.closest('[data-tour="arogya-panel"]') && /^(close arogya assistant|clear conversation)$/i.test(label)) continue;
      if (node instanceof HTMLButtonElement && node.getAttribute("aria-label") === "Close Arogya assistant" && !document.querySelector('[data-tour="arogya-panel"]')) continue;
      if (node instanceof HTMLSelectElement && /demo role|demo department|resident for record checks/i.test(label)) continue;
      if ((node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) && /patient|uhid|age|gender|diagnosis|complaint|history|examination|investigation|management|outcome|learning points|leave reason/i.test(label)) continue;

      const kind = actionKind(node);
      const signatureLabel = label.toLowerCase().slice(0, 60);
      const signature = `${surface.matches("main") ? "page" : surface.getAttribute("data-slot") || surface.getAttribute("data-tour") || surface.getAttribute("role")}:${node.tagName}:${kind}:${signatureLabel}`;
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);
      let id = ids.get(node);
      if (!id) {
        id = `action-${++nextId.value}`;
        ids.set(node, id);
      }
      node.dataset.demoTarget = `action:${encodeURIComponent(route)}:${id}`;
      const inAssistant = node.dataset.tour === "arogya-launcher" || !!node.closest('[data-tour="arogya-panel"]');
      result.push({ element: node, id: `walk:${role}:${inAssistant ? "assistant" : route}:${id}`, kind, preview: boundaryAction(node) });
    }
  }
  return result;
}

function captionFor(kind: string, preview: boolean, title: string, route: string, element: HTMLElement) {
  const label = labelFor(element).trim().toLowerCase();
  if (preview && /^print(?:\b|,)/i.test(label)) return { title: "Print preview", body: "This option prepares a consolidated copy. The walkthrough shows its location without opening a printer or producing a document." };
  if (element.dataset.tourId === "notifications" || /^open notifications\b/i.test(label)) return { title: "Notifications", body: "This menu groups the notification items available to the selected role. The walkthrough opens the menu without completing those items." };
  if (element.dataset.tour === "arogya-launcher") return { title: "Arogya assistant", body: "Open the role-specific assistant to see its suggested questions and sample responses." };
  if (label === "my progress coach") return { title: "Arogya · progress coach", body: "This prompt summarizes progress from the sample workspace. The response is sample guidance, not a clinical assessment." };
  if (label === "what's due?" || label === "what’s due?") return { title: "Arogya · what’s due", body: "This prompt shows a sample summary of notifications that need attention in this workspace." };
  if (preview && kind === "setting") return { title, body: "This setting can change the sample workspace. The cursor shows where it belongs while leaving its current value unchanged." };
  if (preview && kind === "choice option") return { title, body: "This menu option can change what is shown or update data. The walkthrough points it out without activating it." };
  if (preview) return { title, body: "This action can change or send information. The cursor shows where it belongs without activating it; you make the final choice." };
  if (kind === "field") return { title, body: "This field accepts information for this view. We will show it without entering or changing any content." };
  if (kind === "choice list") return { title, body: "This list contains the available choices. The walkthrough opens it and keeps the current value." };
  if (kind === "setting") return { title, body: "This control changes an option within the sample workspace. No information is submitted." };
  if (kind === "tab") return { title, body: "This tab opens another view within the current workspace." };
  if (kind === "link") return { title, body: "This link opens a related view. Its main destination also appears in the role navigation when available." };
  return { title, body: PAGE_COPY[route] || "This view groups the options for the current part of the workspace." };
}

function movePointer(element: HTMLElement, cursor: HTMLElement, playbackSpeed: number, token: number, currentToken: () => number): Promise<boolean> {
  return new Promise((resolve) => {
    const rect = element.getBoundingClientRect();
    const start = cursor.dataset.point ? JSON.parse(cursor.dataset.point) as Point : { x: Math.min(120, window.innerWidth / 3), y: Math.min(190, window.innerHeight / 3) };
    const end = { x: Math.max(8, Math.min(window.innerWidth - 8, rect.left + rect.width / 2)), y: Math.max(8, Math.min(window.innerHeight - 8, rect.top + rect.height / 2)) };
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const travelMs = playbackSpeed > 0 ? Math.max(220, Math.min(760, 180 + distance * 0.46)) / playbackSpeed : 0;
    const started = performance.now();
    const animate = (now: number) => {
      if (token !== currentToken()) { resolve(false); return; }
      const t = travelMs === 0 ? 1 : Math.min(1, (now - started) / travelMs);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const point = { x: start.x + (end.x - start.x) * eased, y: start.y + (end.y - start.y) * eased };
      cursor.dataset.point = JSON.stringify(point);
      cursor.style.transform = `translate3d(${point.x}px,${point.y}px,0)`;
      cursor.style.opacity = "1";
      if (t < 1) requestAnimationFrame(animate); else resolve(true);
    };
    requestAnimationFrame(animate);
  });
}

function wait(ms: number, token: number, currentToken: () => number): Promise<boolean> {
  return new Promise((resolve) => {
    const until = performance.now() + ms;
    const tick = () => {
      if (token !== currentToken()) { resolve(false); return; }
      if (performance.now() >= until) { resolve(true); return; }
      window.setTimeout(tick, Math.min(80, until - performance.now()));
    };
    tick();
  });
}

async function settleTarget(target: HTMLElement, token: number, currentToken: () => number) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const initial = target.getBoundingClientRect();
  const outsideComfortableView = initial.top < 112 || initial.bottom > window.innerHeight - 104 || initial.left < 8 || initial.right > window.innerWidth - 8;
  if (outsideComfortableView) {
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center", inline: "nearest" });
  }
  let prior: DOMRect | null = null;
  let stableFrames = 0;
  const started = performance.now();
  while (performance.now() - started < 2400) {
    if (token !== currentToken()) return false;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const next = target.getBoundingClientRect();
    if (prior && Math.abs(prior.x - next.x) < 1.5 && Math.abs(prior.y - next.y) < 1.5 && Math.abs(prior.width - next.width) < 1.5 && Math.abs(prior.height - next.height) < 1.5) stableFrames++; else stableFrames = 0;
    if (stableFrames >= 5) return true;
    prior = next;
  }
  return false;
}

function activatePointerTarget(target: HTMLElement, point: Point) {
  target.focus({ preventScroll: true });
  if (target instanceof HTMLSelectElement) {
    target.click();
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return;
  }
  const init = { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true };
  try { target.dispatchEvent(new PointerEvent("pointerdown", init)); } catch { /* older browsers */ }
  target.dispatchEvent(new MouseEvent("mousedown", init));
  try { target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 })); } catch { /* older browsers */ }
  target.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
  target.click();
}

function pressEscape() {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
}

export function DemoMovie({ activeRole, navigationItems, navigate, blocked, arogyaOpen, setArogyaOpen }: DemoMovieProps) {
  const [enabled, setEnabled] = React.useState(() => isDemoMode() && isDemoMovieActive());
  const [stage, setStage] = React.useState<Stage>(() => isDemoMode() && isDemoMovieActive() ? "playing" : "ready");
  const [caption, setCaption] = React.useState({ title: "Guided walkthrough", body: "Follow the cursor as it visits each role's live navigation and available workspace options." });
  const [point, setPoint] = React.useState<Point | null>(null);
  const [sectionIndex, setSectionIndex] = React.useState(0);
  const [speed, setSpeed] = React.useState(1);
  const [completedCount, setCompletedCount] = React.useState(0);
  const [clickCount, setClickCount] = React.useState(0);
  const [runRequest, setRunRequest] = React.useState(0);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cursorRef = React.useRef<HTMLDivElement>(null);
  const tokenRef = React.useRef(0);
  const runnerRef = React.useRef(false);
  const speedRef = React.useRef(speed / 2);
  const idsRef = React.useRef(new WeakMap<HTMLElement, string>());
  const nextIdRef = React.useRef({ value: 0 });
  const completedRef = React.useRef(new Set<string>());
  const historyRef = React.useRef<string[]>([]);
  const currentStepRef = React.useRef<string | null>(null);
  const roleRef = React.useRef(activeRole);
  const navigationRef = React.useRef(navigationItems);
  const navigateRef = React.useRef(navigate);
  const openAssistantRef = React.useRef(setArogyaOpen);
  const stageRef = React.useRef(stage);
  const sectionRef = React.useRef(sectionIndex);
  // The revised labels run at half their displayed value: new 1× keeps
  // the former 0.5× pace, new 1.5× keeps former 0.75×, and new 2× keeps former 1×.
  speedRef.current = speed / 2;
  roleRef.current = activeRole;
  navigationRef.current = navigationItems;
  navigateRef.current = navigate;
  openAssistantRef.current = setArogyaOpen;
  stageRef.current = stage;
  sectionRef.current = sectionIndex;
  const changeSpeed = (value: string) => {
    const nextSpeed = Number(value);
    setSpeed(nextSpeed);
    speedRef.current = nextSpeed / 2;
  };

  const invalidate = React.useCallback(() => { tokenRef.current += 1; runnerRef.current = false; return tokenRef.current; }, []);
  const tokenNow = React.useCallback(() => tokenRef.current, []);

  React.useEffect(() => {
    const changed = () => {
      const active = isDemoMode() && isDemoMovieActive();
      setEnabled(active);
      if (active) {
        setStage((current) => current === "ready" ? "playing" : current);
      } else {
        invalidate();
        setStage("ready");
        setCaption({ title: "Guided walkthrough", body: "Press Play to begin the role by role walkthrough." });
      }
    };
    const replay = () => {
      completedRef.current.clear();
      historyRef.current = [];
      currentStepRef.current = null;
      idsRef.current = new WeakMap();
      nextIdRef.current = { value: 0 };
      setCompletedCount(0);
      setSectionIndex(0);
      setArogyaOpen(false);
      setCaption({ title: "Guided walkthrough", body: "Follow the cursor as it visits each role's live navigation and available workspace options." });
      setEnabled(true);
      setStage("playing");
      setRunRequest((current) => current + 1);
      invalidate();
    };
    window.addEventListener(DEMO_MOVIE_CHANGED_EVENT, changed);
    window.addEventListener(DEMO_MOVIE_REPLAY_EVENT, replay);
    return () => {
      invalidate();
      window.removeEventListener(DEMO_MOVIE_CHANGED_EVENT, changed);
      window.removeEventListener(DEMO_MOVIE_REPLAY_EVENT, replay);
    };
  }, [invalidate, setArogyaOpen]);

  const run = React.useCallback(async () => {
    if (runnerRef.current || stageRef.current !== "playing" || !enabled || blocked) return;
    runnerRef.current = true;
    const token = tokenRef.current;
    const valid = () => token === tokenNow();
    const pauseFor = async (ms: number) => wait(Math.round(ms / speedRef.current), token, tokenNow);
    const show = async (element: HTMLElement, text: { title: string; body: string }, expectedToken = token, activate = true) => {
      if (expectedToken !== tokenNow()) return false;
      const settled = await settleTarget(element, expectedToken, tokenNow);
      if (!settled || expectedToken !== tokenNow()) return false;
      const rect = element.getBoundingClientRect();
      setCaption(text);
      setPoint({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      if (cursorRef.current) {
        const moved = await movePointer(element, cursorRef.current, reduceMotion ? 0 : speedRef.current, expectedToken, tokenNow);
        if (!moved) return false;
      }
      if (!(await pauseFor(150))) return false;
      setClickCount((value) => value + 1);
      if (activate) activatePointerTarget(element, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      return true;
    };

    const doStep = async (key: string, element: HTMLElement, text: { title: string; body: string }, afterClick?: () => void | Promise<void>, activate = true) => {
      if (completedRef.current.has(key)) return true;
      currentStepRef.current = key;
      setCaption(text);
      if (!(await show(element, text, token, activate))) return false;
      completedRef.current.add(key);
      historyRef.current.push(key);
      setCompletedCount(completedRef.current.size);
      if (afterClick) await afterClick();
      const kind = actionKind(element);
      const wordCount = text.body.trim().split(/\s+/).length;
      const duration = kind === "choice option"
        ? 240
        : kind === "field"
          ? 700
          : Math.min(1900, Math.max(850, 480 + wordCount * 48));
      if (!(await pauseFor(duration))) return false;
      return true;
    };

    const chooseRole = async (role: Role, roleIndex: number) => {
      if (roleRef.current === role) return true;
      const selector = document.querySelector<HTMLSelectElement>("[data-demo-role-selector]");
      if (!selector) {
        setCaption({ title: `${roleName(role)} workspace`, body: "The role selector is not available on this screen. Playback is paused so the next workspace is not skipped." });
        setStage("paused");
        return false;
      }
      const key = `role:${role}:selector`;
      if (completedRef.current.has(key)) {
        startDemoSession(ROLE_VALUES[role] as "student" | "faculty" | "hod", { skipLoginSummary: true });
        return wait(180, token, tokenNow);
      }
      const ok = await doStep(key, selector, { title: `Switch to ${roleName(role)}`, body: "The role selector opens the matching role workspace. The walkthrough will then visit its navigation options." }, () => {
        selector.value = ROLE_VALUES[role];
        selector.dispatchEvent(new Event("input", { bubbles: true }));
        selector.dispatchEvent(new Event("change", { bubbles: true }));
      });
      if (!ok) return false;
      const until = performance.now() + 9000;
      while (performance.now() < until) {
        if (!valid()) return false;
      if (roleRef.current === role && document.querySelector("main[data-demo-page]")) return wait(180, token, tokenNow);
        await wait(80, token, tokenNow);
      }
      setCaption({ title: `${roleName(role)} workspace`, body: "The workspace did not finish loading in time. Playback is paused so the cursor does not run ahead." });
      setStage("paused");
      return false;
    };

    const findTarget = (href: string) => {
      const key = `nav:${href}`;
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-demo-target]")).filter((element) => element.dataset.demoTarget === key && isVisible(element));
      if (candidates[0]) return candidates[0];
      return null;
    };
    const ensureNavigationTarget = async (href: string, role: Role) => {
      let target = findTarget(href);
      if (target) return target;
      const more = document.querySelector<HTMLElement>('[data-demo-target="mobile-more"]');
      if (more && isVisible(more)) {
        const opened = await doStep(`mobile-more:${role}:${href}`, more, { title: "More pages", body: "On a phone, the More button opens the rest of this role's navigation options." });
        if (!opened) return null;
        await pauseFor(120);
        target = findTarget(href);
        if (target) return target;
      }
      const sidebarTrigger = document.querySelector<HTMLElement>("[data-demo-sidebar-trigger]");
      if (!sidebarTrigger || !isVisible(sidebarTrigger)) return null;
      const opened = await doStep(`sidebar-menu:${role}:${href}`, sidebarTrigger, { title: "Role navigation", body: "The navigation menu opens the pages available to this role at the current screen size." });
      if (!opened) return null;
      await pauseFor(120);
      target = findTarget(href);
      return target;
    };

    const waitForRoute = async (path: string) => {
      const until = performance.now() + 9000;
      while (performance.now() < until) {
        if (!valid()) return false;
        const main = document.querySelector<HTMLElement>("main[data-demo-page]");
        if (main && pathFor(main.dataset.demoPage || "") === path && !main.querySelector('[aria-busy="true"]')) {
          return pauseFor(180);
        }
        await wait(80, token, tokenNow);
      }
      return false;
    };

    const walkPage = async (role: Role, route: string, item: NavigationItem) => {
      const pageKey = `page:${role}:${route}`;
      if (!completedRef.current.has(pageKey)) {
        currentStepRef.current = pageKey;
        setCaption({ title: `${roleName(role)} · ${item.title}`, body: PAGE_COPY[route] || `This is the ${item.title} view in the ${roleName(role)} workspace.` });
        const main = document.querySelector<HTMLElement>("main[data-demo-page]");
        if (main && cursorRef.current) {
          const visibleAnchor = main.querySelector<HTMLElement>("[data-demo-page-title],h1,h2") || main;
          if (!(await settleTarget(visibleAnchor, token, tokenNow))) {
            if (valid()) {
              setCaption({ title: item.title, body: "This view is still moving. Playback is paused until its layout settles." });
              setStage("paused");
            }
            return false;
          }
          if (!valid()) return false;
          await movePointer(visibleAnchor, cursorRef.current, reduceMotion ? 0 : speedRef.current, token, tokenNow);
          if (!valid()) return false;
        }
        if (!(await pauseFor(650))) return false;
        completedRef.current.add(pageKey);
        historyRef.current.push(pageKey);
        setCompletedCount(completedRef.current.size);
      }

      let visited = new Set<string>();
      let limit = 72;
      while (valid() && limit-- > 0) {
        const action = collectPageActions(role, route, idsRef.current, nextIdRef.current).find((candidate) => !visited.has(candidate.id) && !completedRef.current.has(candidate.id));
        if (!action) break;
        visited.add(action.id);
        const text = captionFor(action.kind, action.preview, item.title, route, action.element);
        const beforeDialog = document.querySelector('[data-slot="dialog-content"],[data-slot="alert-dialog-content"]');
        const actionOk = await doStep(action.id, action.element, text, undefined, !action.preview);
        if (!actionOk) return false;
        if (action.element.dataset.tour === "arogya-launcher") {
          openAssistantRef.current(true);
          if (!(await pauseFor(360))) return false;
        }
        const assistant = document.querySelector<HTMLElement>("[data-demo-assistant-state]");
        if (assistant) {
          const settlingUntil = performance.now() + 9000;
          while (assistant.dataset.demoAssistantState === "thinking" && performance.now() < settlingUntil) {
            if (!(await wait(100, token, tokenNow))) return false;
          }
          if (assistant.dataset.demoAssistantState === "thinking") {
            setCaption({ title: "Arogya response", body: "The response is taking longer than expected. Playback is paused so the viewer can read it when it arrives." });
            setStage("paused");
            return false;
          }
          if (!(await pauseFor(500))) return false;
        }
        await pauseFor(75);
        const currentDialog = document.querySelector<HTMLElement>('[data-slot="dialog-content"],[data-slot="alert-dialog-content"]');
        if (currentDialog && currentDialog !== beforeDialog) {
          // The dialog's controls are included on the next pass. Escape closes it once they finish.
        }
        if (!document.querySelector("main[data-demo-page]")) break;
      }

      if (limit <= 0) {
        setCaption({ title: item.title, body: "This page has more controls to visit. Playback is paused here; resume to continue with the next one." });
        setStage("paused");
        return false;
      }
      pressEscape();
      await pauseFor(120);
      return valid();
    };

    try {
      for (let roleIndex = sectionRef.current; roleIndex < ROLES.length; roleIndex++) {
        if (!valid()) return;
        const role = ROLES[roleIndex];
        setSectionIndex(roleIndex);
        if (!(await chooseRole(role, roleIndex))) return;
        const items = navigationRef.current;
        for (const item of items) {
          if (!valid()) return;
          const route = pathFor(item.href);
          const navigationKey = `navigation:${role}:${item.href}`;
          if (!completedRef.current.has(navigationKey)) {
            const target = await ensureNavigationTarget(item.href, role);
            if (!target) {
              setCaption({ title: item.title, body: "This navigation option is not visible at the current screen size. Playback is paused until its menu is available." });
              setStage("paused");
              return;
            }
            const navigationDescription = { title: `${roleName(role)} · ${item.title}`, body: PAGE_COPY[route] || `Open ${item.title} in the ${roleName(role)} workspace.` };
            const clicked = await doStep(navigationKey, target, navigationDescription, () => {
              const raw = target.getAttribute("href");
              const destination = raw ? pathFor(raw) : null;
              if (destination && destination !== window.location.pathname) navigateRef.current(destination);
            });
            if (!clicked) return;
            pressEscape();
            if (!(await waitForRoute(route))) {
              if (valid()) {
                setCaption({ title: item.title, body: "The page is still loading. Playback is paused here rather than moving to a different control." });
                setStage("paused");
              }
              return;
            }
          } else if (!(await waitForRoute(route))) {
            // When returning to a section after an interruption, navigate to the next route.
            const target = await ensureNavigationTarget(item.href, role);
            if (target) {
              if (!(await show(target, { title: item.title, body: PAGE_COPY[route] || `Open ${item.title} in the ${roleName(role)} workspace.` }))) return;
              navigateRef.current(item.href);
              pressEscape();
              if (!(await waitForRoute(route))) {
                if (valid()) {
                  setCaption({ title: item.title, body: "The page is still loading. Playback is paused here rather than moving to a different control." });
                  setStage("paused");
                }
                return;
              }
            } else if (valid()) {
              setCaption({ title: item.title, body: "The next page is not available in the role menu. Playback is paused so it is not skipped." });
              setStage("paused");
              return;
            }
          }
          if (!(await walkPage(role, route, item))) return;
        }
      }
      if (valid()) {
        setCaption({ title: "Walkthrough complete", body: "You have visited the navigation and available controls for the Resident, Faculty, and HOD workspaces." });
        setStage("complete");
      }
    } catch {
      if (valid()) {
        setCaption({ title: "Playback paused", body: "This view changed before the cursor could finish its step. Resume to continue from the current screen." });
        setStage("paused");
      }
    } finally {
      if (token === tokenNow()) runnerRef.current = false;
    }
  }, [blocked, enabled, reduceMotion, tokenNow]);

  React.useEffect(() => {
    if (enabled && stage === "playing" && !blocked && !arogyaOpen) void run();
  }, [enabled, stage, blocked, arogyaOpen, run, runRequest]);

  const pause = () => {
    invalidate();
    setStage("paused");
  };
  const resume = () => setStage("playing");
  const exit = () => {
    invalidate();
    setArogyaOpen(false);
    pressEscape();
    clearDemoMovie();
    setStage("ready");
  };
  const replay = () => {
    completedRef.current.clear();
    historyRef.current = [];
    currentStepRef.current = null;
    setCompletedCount(0);
    setSectionIndex(0);
    setStage("playing");
    setRunRequest((current) => current + 1);
    invalidate();
  };
  const goNext = () => {
    if (currentStepRef.current && !completedRef.current.has(currentStepRef.current)) {
      completedRef.current.add(currentStepRef.current);
      historyRef.current.push(currentStepRef.current);
      setCompletedCount(completedRef.current.size);
    }
    invalidate();
    setStage("playing");
    setRunRequest((current) => current + 1);
  };
  const goBack = () => {
    const previous = historyRef.current.pop();
    if (previous) completedRef.current.delete(previous);
    currentStepRef.current = null;
    setCompletedCount(completedRef.current.size);
    invalidate();
    setStage("playing");
    setRunRequest((current) => current + 1);
  };
  const goSection = (index: number) => {
    const role = ROLES[index];
    for (const key of Array.from(completedRef.current)) {
      if (key.includes(`:${role}:`) || key.startsWith(`role:${role}:`)) completedRef.current.delete(key);
    }
    historyRef.current = historyRef.current.filter((key) => !key.includes(`:${role}:`));
    currentStepRef.current = null;
    setCompletedCount(completedRef.current.size);
    setSectionIndex(index);
    invalidate();
    setStage("playing");
    setRunRequest((current) => current + 1);
  };

  if (!enabled || blocked) return null;
  return createPortal((
    <>
      <div aria-hidden="true" ref={cursorRef} className="pointer-events-none fixed left-0 top-0 z-[2001] opacity-0 will-change-transform" data-demo-cursor>
        <MousePointer2 className="h-8 w-8 -translate-x-[2px] -translate-y-[2px] fill-white text-slate-950 drop-shadow-[0_2px_3px_rgba(0,0,0,0.55)]" strokeWidth={1.8} />
      </div>
      {point && <div key={clickCount} aria-hidden="true" className="pointer-events-none fixed z-[1998] h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-teal-600/70 motion-reduce:animate-none" style={{ left: point.x, top: point.y }} />}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[2000] px-2 pt-[max(8px,env(safe-area-inset-top))] sm:px-5" data-demo-player>
        <section aria-label="Guided demonstration controls" className="pointer-events-auto mx-auto max-w-5xl rounded-2xl border border-white/15 bg-[#102B2D]/95 px-2.5 py-2 text-white shadow-[0_18px_56px_rgba(6,25,27,0.3)] backdrop-blur-xl sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold sm:text-sm">Guided demo · {roleName(ROLES[sectionIndex])}</p>
              <p className="truncate text-[10px] text-white/65">{completedCount} actions visited</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={goBack} disabled={completedCount === 0} aria-label="Previous walkthrough step" className="grid h-9 w-9 place-items-center rounded-full border border-white/15 disabled:opacity-40"><ArrowLeft className="h-4 w-4" /></button>
              {stage === "playing"
                ? <button type="button" onClick={pause} aria-label="Pause walkthrough" className="flex h-9 min-w-20 items-center justify-center gap-1 rounded-full bg-white px-3 text-xs font-semibold text-[#102B2D]"><Pause className="h-3.5 w-3.5" />Pause</button>
                : <button type="button" onClick={resume} aria-label="Resume walkthrough" className="flex h-9 min-w-20 items-center justify-center gap-1 rounded-full bg-teal-200 px-3 text-xs font-semibold text-[#102B2D]"><Play className="h-3.5 w-3.5" />Resume</button>}
              <button type="button" onClick={goNext} aria-label="Next walkthrough step" className="grid h-9 w-9 place-items-center rounded-full border border-white/15"><ArrowRight className="h-4 w-4" /></button>
              <label className="hidden items-center gap-1 text-[10px] sm:flex"><span className="sr-only">Walkthrough speed</span><select aria-label="Walkthrough speed" value={speed} onChange={(event) => changeSpeed(event.target.value)} className="h-9 rounded-full border border-white/15 bg-[#19383A] px-2 text-xs text-white"><option value={0.5}>0.5×</option><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></label>
              <button type="button" onClick={exit} aria-label="Exit walkthrough" className="grid h-9 w-9 place-items-center rounded-full text-white/75"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="mt-2 flex gap-1" role="group" aria-label="Walkthrough sections">
            {ROLES.map((role, index) => <button key={role} type="button" onClick={() => goSection(index)} aria-current={sectionIndex === index ? "step" : undefined} className={`min-h-6 flex-1 rounded-full text-[10px] font-medium ${sectionIndex === index ? "bg-teal-200 text-slate-900" : "bg-white/10 text-white/70"}`}>{roleName(role)}</button>)}
          </div>
          <div className="mt-1.5 flex gap-1" role="progressbar" aria-label="Role walkthrough progress" aria-valuemin={0} aria-valuemax={ROLES.length} aria-valuenow={sectionIndex + 1}>
            {ROLES.map((role, index) => <span key={role} className={`h-1 flex-1 rounded-full ${index <= sectionIndex ? "bg-teal-300" : "bg-white/15"}`} />)}
          </div>
        </section>
      </div>
      <aside aria-live="polite" className="pointer-events-none fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-[1900] w-[min(32rem,calc(100vw-1rem))] -translate-x-1/2 sm:bottom-6" data-demo-caption>
        <div className="pointer-events-auto rounded-2xl border border-white/90 border-l-4 border-l-teal-600 bg-white/98 p-4 text-slate-900 shadow-[0_18px_52px_rgba(15,23,42,0.24)] backdrop-blur-xl sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-900 sm:text-xs">{caption.title}</p>
            {stage === "complete" && <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />}
          </div>
          <p className="mt-1.5 text-sm font-medium leading-6 text-slate-800 sm:text-base">{caption.body}</p>
          <div className="mt-2 flex items-center justify-between">
            <label className="flex items-center gap-1 text-[10px] text-slate-600 sm:hidden"><span>Speed</span><select aria-label="Walkthrough speed" value={speed} onChange={(event) => changeSpeed(event.target.value)} className="rounded border border-slate-300 bg-white px-1 py-0.5 text-slate-800"><option value={0.5}>0.5×</option><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></label>
            {stage === "complete" && <button type="button" onClick={replay} className="inline-flex items-center gap-1 rounded-full bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white"><RotateCcw className="h-3 w-3" />Replay</button>}
          </div>
        </div>
      </aside>
      {stage === "complete" && <EndCard onExplore={() => { clearDemoMovie(); navigate("/"); }} />}
    </>
  ), document.body);
}
