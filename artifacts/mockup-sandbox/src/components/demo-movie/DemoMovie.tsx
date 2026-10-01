import * as React from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
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

type DemoMovieProps = {
  activeRole: "Student" | "Faculty" | "HOD";
  navigate: (path: string) => void;
  blocked: boolean;
  arogyaOpen: boolean;
  setArogyaOpen: (open: boolean) => void;
};

export function DemoMovie({ activeRole, navigate, blocked, arogyaOpen, setArogyaOpen }: DemoMovieProps) {
  const [isActive, setIsActive] = React.useState(() => isDemoMode() && isDemoMovieActive());
  const [phase, setPhase] = React.useState<"playing" | "ended">("playing");
  const [sceneIndex, setSceneIndex] = React.useState(0);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [targetRect, setTargetRect] = React.useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [runToken, setRunToken] = React.useState(0);
  
  const reduceMotion = useReducedMotion();
  const currentScene: DemoScene | undefined = DEMO_SCENES[sceneIndex];

  const activeRoleRef = React.useRef(activeRole);
  activeRoleRef.current = activeRole;
  const navigateRef = React.useRef(navigate);
  navigateRef.current = navigate;
  const [bannerHeight, setBannerHeight] = React.useState(0);

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
      setPhase("playing");
      setSceneIndex(0);
      setElapsedMs(0);
      setTargetRect(null);
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
    setElapsedMs(0);
    setTargetRect(null);
    clearDemoMovie();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }, [setArogyaOpen]);

  // Handle Tab during scene 2 (or any playing state) to close modal and reach Skip
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
               const skipBtn = document.querySelector('[data-testid="demo-movie-skip"]') as HTMLElement | null;
               if (skipBtn) {
                 skipBtn.focus();
                 timeouts.push(window.setTimeout(() => {
                   if (cancelPolling) return;
                   if (document.activeElement !== skipBtn) {
                     skipBtn.focus();
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
  
  React.useEffect(() => {
    if (!isActive || phase !== "playing" || blocked || !currentScene) return;

    let cancelled = false;
    let clockStart = 0;
    
    if (!firedBeatsRef.current[sceneIndex]) {
      firedBeatsRef.current[sceneIndex] = new Set<number>();
    }
    const activeBeats = firedBeatsRef.current[sceneIndex];
    
    let currentStage = "role";
    let stageStart = performance.now();
    let actionFired = false;
    
    let lastRect: { x: number, y: number, w: number, h: number } | null = null;
    let activeTargetElement: HTMLElement | null = null;
    let lastElapsedReport = -1;

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

    const updateTargetRect = (targetSelector?: string, rawSelector?: string) => {
      let el: Element | null = null;
      if (rawSelector) {
        el = document.querySelector(rawSelector);
      } else if (targetSelector) {
        el = document.querySelector(`[data-tour="${targetSelector}"]`) || document.querySelector(`[data-tour-id="${targetSelector}"]`);
      }
      
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const newRect = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
          if (!lastRect || Math.abs(lastRect.x - newRect.x) > 0.5 || Math.abs(lastRect.y - newRect.y) > 0.5 || Math.abs(lastRect.w - newRect.w) > 0.5 || Math.abs(lastRect.h - newRect.h) > 0.5) {
            lastRect = newRect;
            setTargetRect(newRect);
          }
          return el as HTMLElement;
        }
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
        playDemoSound("pop");
        
        if (currentScene.action && currentScene.action !== "none") {
          executeAction(currentScene.action, currentScene.target);
        }
      }
      
      if (currentStage === "play") {
        const elapsed = now - clockStart;
        
        // Update state roughly every 100ms
        if (elapsed - lastElapsedReport > 100 || elapsed >= currentScene.durationMs) {
          setElapsedMs(elapsed);
          lastElapsedReport = elapsed;
        }
        
        let currentTarget = currentScene.target;
        let currentSelector: string | undefined = undefined;
        
        if (currentScene.beats) {
          for (let i = 0; i < currentScene.beats.length; i++) {
            const beat = currentScene.beats[i];
            if (elapsed >= beat.atMs) {
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
        
        const el = updateTargetRect(currentTarget, currentSelector);
        if (el && el !== activeTargetElement) {
          activeTargetElement = el;
          el.scrollIntoView({ block: "center", behavior: reduceMotionRef.current ? "auto" : "smooth" });
        }
        
        if (elapsed >= currentScene.durationMs) {
          cancelled = true;
          if (sceneIndex + 1 < DEMO_SCENES.length) {
            setSceneIndex(sceneIndex + 1);
          } else {
            phaseRef.current = "ended";
            setPhase("ended");
            clearDemoMovie();
          }
        }
      }
    }, 50);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isActive, blocked, phase, sceneIndex, runToken]);

  if (!isActive || blocked) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
      data-testid="demo-movie-root"
      data-phase={phase}
      data-scene-id={currentScene?.id || "none"}
    >
      {phase === "playing" && (
        <>
          {/* Input blocking layer */}
          <div className="absolute inset-0 z-10 pointer-events-auto bg-transparent" />
          
          <MovieControls 
            currentSceneIndex={sceneIndex}
            elapsedMs={elapsedMs}
            onSkip={handleSkip}
          />
          
          {/* Spotlight overlay using a huge shadow trick */}
          <AnimatePresence>
            {targetRect && (
              <motion.div
                key="spotlight"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
                animate={{
                  opacity: 1,
                  left: targetRect.x - 8,
                  top: targetRect.y - 8,
                  width: targetRect.w + 16,
                  height: targetRect.h + 16,
                  boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.4)",
                  transition: reduceMotion 
                    ? { duration: 0.15 } 
                    : { 
                        opacity: { duration: 0.2 }, 
                        left: { type: "spring", stiffness: 150, damping: 25 },
                        top: { type: "spring", stiffness: 150, damping: 25 },
                        width: { type: "spring", stiffness: 150, damping: 25 },
                        height: { type: "spring", stiffness: 150, damping: 25 },
                      }
                }}
                exit={{ opacity: 0 }}
                className="absolute z-[40] rounded-2xl border-2 border-white/20 mix-blend-hard-light pointer-events-none"
              />
            )}
            {!targetRect && (
              <motion.div 
                key="spotlight-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[40] bg-slate-900/40 pointer-events-none" 
              />
            )}
          </AnimatePresence>

          {/* Caption */}
          <AnimatePresence mode="wait">
            {currentScene && (
              <motion.div
                key={currentScene.id}
                role="status"
                aria-live="polite"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="absolute z-[60] left-2 right-[80px] bottom-[calc(76px+env(safe-area-inset-bottom))] sm:bottom-12 sm:left-1/2 sm:right-auto sm:w-[480px] sm:-translate-x-1/2 rounded-2xl bg-slate-900/85 p-5 text-center shadow-2xl backdrop-blur-xl border border-white/10"
                style={bannerHeight > 0 ? { bottom: `max(${bannerHeight + 16}px, calc(76px + env(safe-area-inset-bottom)))` } : undefined}
              >
                <p className="text-[17px] font-medium tracking-tight text-white/95">
                  {currentScene.caption}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {phase === "ended" && (
        <EndCard onExplore={() => {
          setIsActive(false);
          navigate(demoPortalHome("student"));
          setArogyaOpen(false);
        }} />
      )}
    </div>,
    document.body
  );
}
