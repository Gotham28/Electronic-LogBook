import * as React from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { ArrowRight, BookOpenCheck, Loader2 } from "lucide-react";
import { 
  isDemoMovieActive, 
  DEMO_MOVIE_CHANGED_EVENT, 
  DEMO_MOVIE_REPLAY_EVENT,
  startDemoSession,
  demoPortalHome,
  clearDemoMovie
} from "@/lib/demoSession";
import { isDemoMode } from "@/lib/session";
import { DEMO_SCENES, DemoScene } from "./scenes";
import { MovieControls } from "./MovieControls";
import { EndCard } from "./EndCard";
import { sendAroDemoCommand } from "./movieBridge";
import { playDemoSound } from "@/lib/demoSounds";
import { DEMO_MOVIE_ASK_QUESTION } from "@/lib/demoData";

type SpotlightRect = { x: number; y: number; w: number; h: number };
const SPOTLIGHT_TRANSITION_MS = 220;
const SPOTLIGHT_TARGET_REVEAL_MS = SPOTLIGHT_TRANSITION_MS + 32;
const SPOTLIGHT_TARGET_STABLE_MS = 120;
const SPOTLIGHT_EASE = [0.22, 1, 0.36, 1] as const;
const SPOTLIGHT_SECTION_TITLES: Record<string, string> = {
  "dashboard-welcome": "Your dashboard",
  "dashboard-progress": "Training progress",
  "dashboard-cases": "Clinical cases",
  "dashboard-procedures": "Procedures",
  "dashboard-academics": "Academic activities",
  "dashboard-recent": "Recent activity",
  "dashboard-bottom": "Dashboard resources",
  "caselog-add": "Add a case log",
  "caselog-patient-info": "Patient and encounter details",
  "caselog-clinical-details": "Clinical details",
  "caselog-diagnosis-details": "Diagnosis and follow-up",
  "caselog-reviewer": "Reviewing faculty",
  "student-assessments": "Assessments",
  "student-thesis": "Thesis progress",
  "student-leave-records": "Leave records",
  "arogya-launcher": "Arogya assistant",
  "arogya-coach": "Progress coach",
  "arogya-messages": "Arogya guidance",
  "arogya-due": "Items due",
  "arogya-report": "Department report",
  "arogya-falling-behind": "Residents needing attention",
  "review-first-item": "Submitted log",
  "review-fast-evaluation": "Fast Faculty Evaluation",
  "review-approve": "Verify or request a revision",
  "faculty-progress-list": "Student progress",
  "faculty-view-logbook": "Open a student logbook",
  "faculty-progress-summary": "Progress summary",
  "faculty-progress-cases": "Case category progress",
  "faculty-progress-procedures": "Procedure progress",
  "faculty-progress-academics": "Academic activity progress",
  "faculty-add-assessment": "Add an assessment",
  "quarterly-appraisal": "Quarterly appraisal",
  "appraisal-draft": "Draft with Arogya",
  "appraisal-remarks": "Appraisal remarks",
  "hod-overview": "Department overview",
  "hod-log-activity": "Log activity",
  "hod-student-roster": "Resident roster",
  "hod-requirements": "Training requirements",
  "hod-requirements-add": "Add a requirement",
  "hod-requirements-add-form": "Requirement details",
  "hod-add-faculty": "Add faculty",
  "hod-student-approvals": "Student approvals",
  "hod-approve-student": "Approve student access",
};

function getSpotlightSectionTitle(targetKey: string) {
  if (targetKey.startsWith("selector:")) {
    return targetKey.includes("dialog") ? "Student logbook" : "Selected section";
  }
  const targetId = targetKey.startsWith("tour:") ? targetKey.slice("tour:".length) : "";
  if (!targetId) return "Section overview";
  if (SPOTLIGHT_SECTION_TITLES[targetId]) return SPOTLIGHT_SECTION_TITLES[targetId];
  const words = targetId.replace(/^(dashboard|student|faculty|hod|arogya|caselog)-/, "").replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function DemoSpotlight({ rect, targetKey, reduceMotion }: { rect: SpotlightRect | null; targetKey: string; reduceMotion: boolean }) {
  const maskId = React.useId().replace(/:/g, "");
  const [displayRect, setDisplayRect] = React.useState<SpotlightRect | null>(null);
  const [holeOpen, setHoleOpen] = React.useState(false);
  const [viewport, setViewport] = React.useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  React.useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  React.useEffect(() => {
    if (rect) {
      setDisplayRect(rect);
      const frame = window.requestAnimationFrame(() => setHoleOpen(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setHoleOpen(false);
    const timer = window.setTimeout(() => setDisplayRect(null), reduceMotion ? 0 : SPOTLIGHT_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [rect, reduceMotion]);

  return (
    <div aria-hidden="true" data-target-key={targetKey} className="pointer-events-none absolute inset-0 z-[40]">
      <svg
        className="absolute inset-0 h-full w-full"
        width={viewport.width}
        height={viewport.height}
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={viewport.width} height={viewport.height}>
            <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white" />
            {displayRect && (
              <motion.rect
                rx="16"
                fill="black"
                initial={false}
                animate={{
                  x: displayRect.x,
                  y: displayRect.y,
                  width: displayRect.w,
                  height: displayRect.h,
                  fillOpacity: holeOpen ? 1 : 0,
                }}
                transition={{
                  x: { duration: 0 },
                  y: { duration: 0 },
                  width: { duration: 0 },
                  height: { duration: 0 },
                  fillOpacity: { duration: reduceMotion ? 0 : SPOTLIGHT_TRANSITION_MS / 1000, ease: SPOTLIGHT_EASE },
                }}
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="#102427" fillOpacity="0.48" mask={`url(#${maskId})`} />
      </svg>
      {displayRect && (
        <motion.div
          className="absolute z-[41] rounded-2xl border-2 border-white/90 shadow-[0_0_0_1px_rgba(15,118,110,0.4)]"
          initial={false}
          animate={{
            opacity: holeOpen ? 1 : 0,
            left: displayRect.x - 2,
            top: displayRect.y - 2,
            width: displayRect.w + 4,
            height: displayRect.h + 4,
          }}
          transition={{
            left: { duration: 0 },
            top: { duration: 0 },
            width: { duration: 0 },
            height: { duration: 0 },
            opacity: { duration: reduceMotion ? 0 : SPOTLIGHT_TRANSITION_MS / 1000, ease: SPOTLIGHT_EASE },
          }}
        />
      )}
    </div>
  );
}

type DemoMovieProps = {
  activeRole: "Student" | "Faculty" | "HOD";
  navigate: (path: string) => void;
  blocked: boolean;
  arogyaOpen: boolean;
  setArogyaOpen: (open: boolean) => void;
};

export function DemoMovie({ activeRole, navigate, blocked, arogyaOpen, setArogyaOpen }: DemoMovieProps) {
  const [isActive, setIsActive] = React.useState(() => isDemoMode() && isDemoMovieActive());
  const [phase, setPhase] = React.useState<"splash" | "playing" | "ended">("splash");
  const [sceneIndex, setSceneIndex] = React.useState(0);
  const [sceneClock, setSceneClock] = React.useState<{ sceneIndex: number; startedAt: number } | null>(null);
  const [targetRect, setTargetRect] = React.useState<SpotlightRect | null>(null);
  const [spotlightTargetKey, setSpotlightTargetKey] = React.useState("initial");
  const [captionState, setCaptionState] = React.useState<{ sceneId: string; caption: string } | null>(null);
  const [runToken, setRunToken] = React.useState(0);
  const advancedSceneRef = React.useRef<number | null>(null);
  
  const reduceMotion = useReducedMotion();
  const currentScene: DemoScene | undefined = DEMO_SCENES[sceneIndex];
  const sceneStartedAt = sceneClock?.sceneIndex === sceneIndex ? sceneClock.startedAt : null;
  const displayedCaption = captionState?.sceneId === currentScene?.id ? captionState.caption : currentScene?.caption;

  const activeRoleRef = React.useRef(activeRole);
  activeRoleRef.current = activeRole;
  const navigateRef = React.useRef(navigate);
  navigateRef.current = navigate;
  const [bannerHeight, setBannerHeight] = React.useState(0);

  React.useEffect(() => {
    if (!isActive || phase !== "splash" || blocked) return;
    const timer = window.setTimeout(() => setPhase("playing"), 1350);
    return () => window.clearTimeout(timer);
  }, [isActive, phase, blocked]);

  React.useEffect(() => {
    if (!isActive || phase !== "playing") return;
    let observer: ResizeObserver | null = null;
    const checkBanner = () => {
      const banner = document.querySelector('[data-testid="cookie-consent-banner"]');
      if (banner) {
        const rect = banner.getBoundingClientRect();
        setBannerHeight(prev => prev !== rect.height ? rect.height : prev);
        if (!observer) {
          observer = new ResizeObserver(() => {
            const h = banner.getBoundingClientRect().height;
            setBannerHeight(prev => prev !== h ? h : prev);
          });
          observer.observe(banner);
        }
      } else {
        setBannerHeight(prev => prev !== 0 ? 0 : prev);
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      }
    };
    checkBanner();
    const intervalId = window.setInterval(checkBanner, 1000);
    return () => {
      window.clearInterval(intervalId);
      if (observer) observer.disconnect();
    };
  }, [isActive, phase]);
  const setArogyaOpenRef = React.useRef(setArogyaOpen);
  setArogyaOpenRef.current = setArogyaOpen;
  const reduceMotionRef = React.useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;

  React.useEffect(() => {
    const handleChanged = () => {
      if (phaseRef.current === "ended") return;
      setIsActive(isDemoMode() && isDemoMovieActive());
    };
    const handleReplay = () => {
      firedBeatsRef.current = {};
      advancedSceneRef.current = null;
      setPhase("splash");
      setSceneIndex(0);
      setSceneClock(null);
      setTargetRect(null);
      setSpotlightTargetKey("initial");
      setRunToken(t => t + 1);
      if (isDemoMode()) setIsActive(true);
    };
    
    window.addEventListener(DEMO_MOVIE_CHANGED_EVENT, handleChanged);
    window.addEventListener(DEMO_MOVIE_REPLAY_EVENT, handleReplay);
    return () => {
      window.removeEventListener(DEMO_MOVIE_CHANGED_EVENT, handleChanged);
      window.removeEventListener(DEMO_MOVIE_REPLAY_EVENT, handleReplay);
    };
  }, []);

  const handleSkip = React.useCallback(() => {
    firedBeatsRef.current = {};
    phaseRef.current = "ended";
    setPhase("ended");
    setArogyaOpen(false);
    setTargetRect(null);
    clearDemoMovie();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }, [setArogyaOpen]);

  const advanceScene = React.useCallback((fromSceneIndex: number) => {
    if (phaseRef.current !== "playing" || advancedSceneRef.current === fromSceneIndex) return;
    advancedSceneRef.current = fromSceneIndex;
    setArogyaOpen(false);
    setTargetRect(null);

    if (fromSceneIndex + 1 < DEMO_SCENES.length) {
      setSceneIndex(fromSceneIndex + 1);
      return;
    }

    phaseRef.current = "ended";
    setPhase("ended");
    clearDemoMovie();
  }, [setArogyaOpen]);

  // Handle Tab during a guided scene to close blocking dialogs and reach Next.
  React.useEffect(() => {
    if (!isActive || blocked || phase !== "playing") return;

    let cancelPolling = false;
    let timeouts: number[] = [];

    const handleGlobalTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        let externalDialog = false;
        for (let i = 0; i < dialogs.length; i++) {
          if (!dialogs[i].closest('[data-testid="demo-movie-root"]')) {
            externalDialog = true;
            break;
          }
        }
        
        if (externalDialog) {
           e.preventDefault();
           document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
           
           let start = performance.now();
           const poll = () => {
             if (cancelPolling) return;
             
             let stillOpen = false;
             const currentDialogs = document.querySelectorAll('[role="dialog"]');
             for (let i = 0; i < currentDialogs.length; i++) {
               if (!currentDialogs[i].closest('[data-testid="demo-movie-root"]')) {
                 stillOpen = true;
                 break;
               }
             }

             if (!stillOpen) {
               const nextBtn = document.querySelector('[data-testid="demo-movie-next"]') as HTMLElement | null;
               if (nextBtn) {
                 nextBtn.focus();
                 timeouts.push(window.setTimeout(() => {
                   if (cancelPolling) return;
                   if (document.activeElement !== nextBtn) {
                     nextBtn.focus();
                   }
                 }, 150));
               }
             } else if (performance.now() - start < 600) {
               requestAnimationFrame(poll);
             }
           };
           requestAnimationFrame(poll);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalTab, true);
    return () => {
      cancelPolling = true;
      timeouts.forEach(t => window.clearTimeout(t));
      window.removeEventListener('keydown', handleGlobalTab, true);
    };
  }, [isActive, blocked, phase]);

  // Main engine
  const firedBeatsRef = React.useRef<Record<number, Set<number>>>({});

  const rewindScene = React.useCallback((fromSceneIndex: number) => {
    if (phaseRef.current !== "playing" || fromSceneIndex <= 0) return;

    const previousSceneIndex = fromSceneIndex - 1;
    // A back action restarts both the scene being left and the scene being replayed.
    firedBeatsRef.current[fromSceneIndex] = new Set<number>();
    firedBeatsRef.current[previousSceneIndex] = new Set<number>();
    advancedSceneRef.current = null;
    setArogyaOpen(false);
    setTargetRect(null);
    setSceneIndex(previousSceneIndex);
  }, [setArogyaOpen]);
  
  React.useEffect(() => {
    if (!isActive || phase !== "playing" || blocked || !currentScene) return;

    setTargetRect(null);
    let cancelled = false;
    let clockStart = 0;
    
    if (!firedBeatsRef.current[sceneIndex]) {
      firedBeatsRef.current[sceneIndex] = new Set<number>();
    }
    const activeBeats = firedBeatsRef.current[sceneIndex];
    
    let currentStage = "role";
    let stageStart = performance.now();
    let actionFired = false;
    let lastCaption = currentScene.caption;
    setCaptionState({ sceneId: currentScene.id, caption: currentScene.caption });

    let lastRect: SpotlightRect | null = null;
    let candidateRect: SpotlightRect | null = null;
    let candidateStableSince = 0;
    let lastTargetKey: string | null = null;
    let targetChangedAt = 0;
    let activeTargetElement: HTMLElement | null = null;
    let measureFrame = 0;
    let targetResizeObserver: ResizeObserver | null = null;
    let targetMutationObserver: MutationObserver | null = null;

    const disconnectTargetObserver = () => {
      targetResizeObserver?.disconnect();
      targetResizeObserver = null;
      targetMutationObserver?.disconnect();
      targetMutationObserver = null;
    };

    const scheduleTargetMeasure = () => {
      if (cancelled || measureFrame || !activeTargetElement?.isConnected) return;
      measureFrame = window.requestAnimationFrame(() => {
        measureFrame = 0;
        const el = activeTargetElement;
        if (cancelled || !el?.isConnected) return;
        if (!reduceMotionRef.current && performance.now() - targetChangedAt < SPOTLIGHT_TARGET_REVEAL_MS) return;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          candidateRect = null;
          candidateStableSince = 0;
          if (lastRect) {
            lastRect = null;
            setTargetRect(null);
          }
          return;
        }

        const nextRect = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
        if (!lastRect) {
          const stable = candidateRect &&
            Math.abs(candidateRect.x - nextRect.x) <= 1 &&
            Math.abs(candidateRect.y - nextRect.y) <= 1 &&
            Math.abs(candidateRect.w - nextRect.w) <= 1 &&
            Math.abs(candidateRect.h - nextRect.h) <= 1;
          if (!stable) {
            candidateRect = nextRect;
            candidateStableSince = performance.now();
          }
          const revealReady = reduceMotionRef.current || (
            performance.now() - targetChangedAt >= SPOTLIGHT_TARGET_REVEAL_MS &&
            performance.now() - candidateStableSince >= SPOTLIGHT_TARGET_STABLE_MS
          );
          if (!revealReady) return;
        }
        const moved = !lastRect ||
          Math.abs(lastRect.x - nextRect.x) > 0.5 ||
          Math.abs(lastRect.y - nextRect.y) > 0.5 ||
          Math.abs(lastRect.w - nextRect.w) > 0.5 ||
          Math.abs(lastRect.h - nextRect.h) > 0.5;
        if (moved) {
          lastRect = nextRect;
          setTargetRect(nextRect);
        }
      });
    };

    const handleViewportChange = () => scheduleTargetMeasure();
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);

    const executeAction = (action: string, target?: string, clickTarget?: string) => {
      if (action === "openArogya") {
        setArogyaOpenRef.current(true);
      } else if (action === "closeArogya") {
        setArogyaOpenRef.current(false);
      } else if (action === "pressEscape") {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else if (action === "ask") {
        sendAroDemoCommand({ type: "ask", question: DEMO_MOVIE_ASK_QUESTION });
      } else if (action === "progressCoach") {
        sendAroDemoCommand({ type: "progress-coach" });
      } else if (action === "departmentReport") {
        sendAroDemoCommand({ type: "department-report", reportType: "report" });
      } else if (action === "appraisalDraft") {
        sendAroDemoCommand({ type: "appraisal-prefill-and-draft" });
      } else if (action === "clickTarget") {
        const targetStr = clickTarget || target;
        if (targetStr) {
          const el = document.querySelector(`[data-tour="${targetStr}"]`) || document.querySelector(`[data-tour-id="${targetStr}"]`);
          if (el) (el as HTMLElement).click();
        }
      }
    };

    const updateTargetRect = (targetSelector: string | undefined, rawSelector: string | undefined, now: number) => {
      const nextTargetKey = rawSelector
        ? `selector:${rawSelector}`
        : targetSelector
          ? `tour:${targetSelector}`
          : `scene:${currentScene.id}:none`;

      if (nextTargetKey !== lastTargetKey) {
        lastTargetKey = nextTargetKey;
        lastRect = null;
        candidateRect = null;
        candidateStableSince = 0;
        targetChangedAt = now;
        activeTargetElement = null;
        disconnectTargetObserver();
        setSpotlightTargetKey(nextTargetKey);
        setTargetRect(null);
      }

      if (activeTargetElement?.isConnected) {
        scheduleTargetMeasure();
        return activeTargetElement;
      }

      let el: Element | null = null;
      if (rawSelector) {
        el = document.querySelector(rawSelector);
      } else if (targetSelector) {
        el = document.querySelector(`[data-tour="${targetSelector}"]`) || document.querySelector(`[data-tour-id="${targetSelector}"]`);
      }
      
      if (el) {
        if (el !== activeTargetElement) {
          if (activeTargetElement) {
            lastRect = null;
            candidateRect = null;
            candidateStableSince = 0;
            targetChangedAt = now;
            setTargetRect(null);
          }
          activeTargetElement = el as HTMLElement;
          disconnectTargetObserver();
          if (typeof ResizeObserver !== "undefined") {
            targetResizeObserver = new ResizeObserver(scheduleTargetMeasure);
            let ancestor: HTMLElement | null = activeTargetElement;
            while (ancestor) {
              targetResizeObserver.observe(ancestor);
              if (ancestor === document.body) break;
              ancestor = ancestor.parentElement;
            }
          }
          if (typeof MutationObserver !== "undefined") {
            targetMutationObserver = new MutationObserver(scheduleTargetMeasure);
            targetMutationObserver.observe(activeTargetElement.parentElement ?? activeTargetElement, {
              attributes: true,
              childList: true,
              characterData: true,
              subtree: true,
            });
          }
          if (window.getComputedStyle(activeTargetElement).position !== "fixed") {
            activeTargetElement.scrollIntoView({
              block: "center",
              inline: "nearest",
              behavior: reduceMotionRef.current ? "instant" : "smooth",
            });
          }
        }
        scheduleTargetMeasure();
        return el as HTMLElement;
      }
      if (lastRect !== null) {
        lastRect = null;
        setTargetRect(null);
      }
      return null;
    };

    const intervalId = window.setInterval(() => {
      if (cancelled) return;
      const now = performance.now();
      
      if (currentStage === "role") {
        const targetRoleText = currentScene.role === "student" ? "Student" : currentScene.role === "faculty" ? "Faculty" : "HOD";
        if (activeRoleRef.current !== targetRoleText) {
          if (!actionFired) {
            setArogyaOpenRef.current(false);
            startDemoSession(currentScene.role, { skipLoginSummary: true });
            actionFired = true;
          }
          if (now - stageStart < 3000) return; // wait
        }
        currentStage = "route";
        stageStart = now;
        actionFired = false;
      }
      
      if (currentStage === "route") {
        const currentPath = window.location.pathname;
        const matches = currentPath === currentScene.route || (currentScene.route === "/" && currentPath === "/dashboard");
        if (!matches) {
          if (!actionFired) {
            navigateRef.current(currentScene.route);
            actionFired = true;
          }
          if (now - stageStart < 3000) return; // wait
        }
        currentStage = "target";
        stageStart = now;
      }
      
      if (currentStage === "target") {
        let targetFound = false;
        if (currentScene.target) {
          const el = document.querySelector(`[data-tour="${currentScene.target}"]`) || document.querySelector(`[data-tour-id="${currentScene.target}"]`);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              targetFound = true;
            }
          }
        } else {
          targetFound = true;
        }
        
        if (!targetFound && now - stageStart < 3500) return; // wait
        
        currentStage = "play";
        clockStart = performance.now();
        setSceneClock({ sceneIndex, startedAt: clockStart });
        playDemoSound("pop");
        
        if (currentScene.action && currentScene.action !== "none") {
          executeAction(currentScene.action, currentScene.target);
        }
      }
      
      if (currentStage === "play") {
        const elapsed = now - clockStart;
        
        let currentTarget = currentScene.target;
        let currentSelector: string | undefined = undefined;
        let activeCaption = currentScene.caption;
        
        if (currentScene.beats) {
          for (let i = 0; i < currentScene.beats.length; i++) {
            const beat = currentScene.beats[i];
            if (elapsed >= beat.atMs) {
              if (beat.caption) activeCaption = beat.caption;
              if (beat.target) { currentTarget = beat.target; currentSelector = undefined; }
              else if (beat.selector) { currentSelector = beat.selector; currentTarget = undefined; }
              
              if (!activeBeats.has(i)) {
                activeBeats.add(i);
                if (beat.action) {
                  executeAction(beat.action, beat.target, beat.clickTarget);
                }
              }
            }
          }
        }

        if (activeCaption !== lastCaption) {
          lastCaption = activeCaption;
          setCaptionState({ sceneId: currentScene.id, caption: activeCaption });
        }
        
        updateTargetRect(currentTarget, currentSelector, now);

        if (elapsed >= currentScene.durationMs) {
          cancelled = true;
          advanceScene(sceneIndex);
        }
      }
    }, 50);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      disconnectTargetObserver();
      if (measureFrame) window.cancelAnimationFrame(measureFrame);
    };
  }, [isActive, blocked, phase, sceneIndex, runToken, advanceScene]);

  if (!isActive || blocked) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
      data-testid="demo-movie-root"
      data-phase={phase}
      data-scene-id={currentScene?.id || "none"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {phase === "splash" ? (
          <motion.div
            key="demo-splash"
            className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-[#0F766E] px-6 text-center text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            <div className="flex flex-col items-center">
              <div className="grid h-20 w-20 place-items-center rounded-[26px] border border-white/25 bg-white/12 shadow-[0_16px_40px_rgba(5,26,29,0.16)]">
                <BookOpenCheck className="h-11 w-11" strokeWidth={1.6} />
              </div>
              <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">Welcome to E-LogBook</h1>
              <p className="mt-1 text-base text-white/85">Arogya Electronic LogBook</p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">A guided look at the student, faculty and HOD experience.</p>
              <div className="mt-8 flex items-center gap-2.5 text-sm font-medium text-white/85" role="status" aria-live="polite">
                <Loader2 className={`h-4 w-4 ${reduceMotion ? "" : "animate-spin"}`} strokeWidth={1.8} />
                <span>Starting with the student dashboard</span>
              </div>
            </div>
          </motion.div>
        ) : phase === "playing" && currentScene ? (
          <motion.div
            key="demo-playing"
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
          >
            {/* Input blocking layer */}
            <div className="pointer-events-auto absolute inset-0 z-10 bg-transparent" />

            <MovieControls
              currentSceneIndex={sceneIndex}
              onSkip={handleSkip}
              onBack={() => rewindScene(sceneIndex)}
              onNext={() => advanceScene(sceneIndex)}
              isLastScene={sceneIndex === DEMO_SCENES.length - 1}
              isFirstScene={sceneIndex === 0}
              sceneStartedAt={sceneStartedAt}
              sceneDurationMs={currentScene?.durationMs ?? 0}
              reduceMotion={!!reduceMotion}
            />

            <DemoSpotlight rect={targetRect} targetKey={spotlightTargetKey} reduceMotion={!!reduceMotion} />

            <AnimatePresence initial={false} mode="wait">
              {currentScene.transition && (
                <motion.section
                  key={`transition-${currentScene.id}`}
                  role="status"
                  aria-live="polite"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: reduceMotion ? 0 : -8, scale: reduceMotion ? 1 : 0.99 }}
                  transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute inset-0 z-[55] grid place-items-center px-5"
                >
                  <div className="w-full max-w-xl rounded-[28px] border border-white/20 bg-gradient-to-br from-[#123638]/95 via-[#102427]/94 to-[#0b1d20]/96 p-7 text-center text-white shadow-[0_32px_100px_rgba(4,20,22,0.42)] backdrop-blur-2xl sm:p-10">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10 text-teal-100">
                      <BookOpenCheck className="h-7 w-7" strokeWidth={1.7} />
                    </div>
                    <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-teal-200">{currentScene.transition.eyebrow}</p>
                    <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{currentScene.transition.title}</h2>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/75 sm:text-base">{currentScene.transition.body}</p>
                    <div className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-teal-100/90">
                      Continue the guided walkthrough <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
              {!currentScene.transition && (
                <motion.div
                  key={currentScene.id}
                  role="status"
                  aria-live="polite"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                  transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute bottom-[calc(76px+env(safe-area-inset-bottom))] left-3 right-3 z-[60] rounded-[20px] border border-slate-200/90 bg-white/95 px-4 py-3.5 text-left shadow-[0_18px_48px_rgba(15,36,39,0.18)] backdrop-blur-xl sm:bottom-8 sm:left-1/2 sm:right-auto sm:w-[min(520px,calc(100vw-48px))] sm:-translate-x-1/2 sm:px-5 sm:py-4"
                  style={bannerHeight > 0 ? { bottom: `max(${bannerHeight + 16}px, calc(76px + env(safe-area-inset-bottom)))` } : undefined}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700">
                    {currentScene.chapter === "resident" ? "Student" : currentScene.chapter === "faculty" ? "Faculty" : "HOD"} · {sceneIndex + 1} of {DEMO_SCENES.length}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-5 tracking-tight text-slate-950">
                    {getSpotlightSectionTitle(spotlightTargetKey)}
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-slate-600">
                    {displayedCaption}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="demo-ended" className="pointer-events-auto absolute inset-0">
            <EndCard onExplore={() => {
              setIsActive(false);
              navigate(demoPortalHome("student"));
              setArogyaOpen(false);
            }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}
