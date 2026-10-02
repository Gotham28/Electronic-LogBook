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
import { MovieInterstitial } from "./MovieInterstitial";
import { DemoCursor } from "./DemoCursor";
import { sendAroDemoCommand } from "./movieBridge";
import { playDemoSound } from "@/lib/demoSounds";
import { startDemoMusic, stopDemoMusic, unlockDemoAudio } from "@/lib/demoMusic";
import { DEMO_MOVIE_ASK_QUESTION } from "@/lib/demoData";

type DemoMovieProps = {
  activeRole: "Student" | "Faculty" | "HOD";
  navigate: (path: string) => void;
  blocked: boolean;
  arogyaOpen: boolean;
  setArogyaOpen: (open: boolean) => void;
};

// Smooth cinematic scrolling helper
function smoothScrollContainer(targetTop: number, durationMs = 1200) {
  const container = document.querySelector('main')?.parentElement || document.querySelector('main') || document.documentElement;
  if (!container) return;
  const startTop = container.scrollTop;
  const distance = targetTop - startTop;
  if (Math.abs(distance) < 4) return;
  const start = performance.now();

  const step = (now: number) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / durationMs, 1);
    // Smooth cubic ease in out
    const ease = progress < 0.5 
      ? 4 * progress * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    container.scrollTop = startTop + distance * ease;
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

export function DemoMovie({ activeRole, navigate, blocked, arogyaOpen, setArogyaOpen }: DemoMovieProps) {
  const [isActive, setIsActive] = React.useState(() => isDemoMode() && isDemoMovieActive());
  const [phase, setPhase] = React.useState<"playing" | "ended">("playing");
  const [sceneIndex, setSceneIndex] = React.useState(0);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [targetRect, setTargetRect] = React.useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [spotlightCoords, setSpotlightCoords] = React.useState<{ x: number, y: number, w: number, h: number }>(() => ({
    x: typeof window !== "undefined" ? window.innerWidth / 2 - 160 : 100,
    y: typeof window !== "undefined" ? window.innerHeight / 2 - 100 : 100,
    w: 320,
    h: 200,
  }));
  const [spotlightVisible, setSpotlightVisible] = React.useState(false);

  const [cursorTarget, setCursorTarget] = React.useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [isClicking, setIsClicking] = React.useState(false);
  const [cursorLabel, setCursorLabel] = React.useState<string | undefined>(undefined);
  const [runToken, setRunToken] = React.useState(0);
  
  const reduceMotion = useReducedMotion();
  const currentScene: DemoScene | undefined = DEMO_SCENES[sceneIndex];

  React.useEffect(() => {
    if (targetRect) {
      setSpotlightCoords(targetRect);
      setSpotlightVisible(true);
    } else {
      setSpotlightVisible(false);
    }
  }, [targetRect]);

  const activeRoleRef = React.useRef(activeRole);
  activeRoleRef.current = activeRole;
  const navigateRef = React.useRef(navigate);
  navigateRef.current = navigate;
  const [bannerHeight, setBannerHeight] = React.useState(0);

  // Background music management
  React.useEffect(() => {
    if (isActive && phase === "playing") {
      startDemoMusic();
    } else {
      stopDemoMusic();
    }
    return () => {
      stopDemoMusic();
    };
  }, [isActive, phase]);

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
      setCursorTarget(null);
      setIsClicking(false);
      setRunToken(t => t + 1);
      if (isDemoMode()) {
        setIsActive(true);
        unlockDemoAudio();
        startDemoMusic();
      }
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
    setCursorTarget(null);
    setIsClicking(false);
    stopDemoMusic();
    clearDemoMovie();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }, [setArogyaOpen]);

  // Handle Tab during any modal state to close modal and reach Skip
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

  // Main scene & beat engine
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
    let lastElapsedReport = -1;

    const executeAction = (
      action: string, 
      target?: string, 
      clickTarget?: string, 
      scrollOffset?: number, 
      route?: string,
      cursorLabel?: string
    ) => {
      if (action === "openArogya") {
        setArogyaOpenRef.current(true);
      } else if (action === "closeArogya") {
        setArogyaOpenRef.current(false);
      } else if (action === "pressEscape") {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else if (action === "ask") {
        sendAroDemoCommand({ type: "ask", question: DEMO_MOVIE_ASK_QUESTION });
      } else if (action === "whatsDue") {
        sendAroDemoCommand({ type: "whats-due" });
      } else if (action === "progressCoach") {
        sendAroDemoCommand({ type: "progress-coach" });
      } else if (action === "departmentReport") {
        sendAroDemoCommand({ type: "department-report", reportType: "report" });
      } else if (action === "appraisalDraft") {
        sendAroDemoCommand({ type: "appraisal-prefill-and-draft" });
      } else if (action === "scrollSlowly") {
        if (typeof scrollOffset === "number") {
          smoothScrollContainer(scrollOffset, reduceMotionRef.current ? 300 : 1300);
        }
      } else if (action === "navigate") {
        if (route) {
          navigateRef.current(route);
        }
      } else if (action === "clickTarget") {
        const targetStr = clickTarget || target;
        if (targetStr) {
          const el = document.querySelector(`[data-tour="${targetStr}"]`) || document.querySelector(`[data-tour-id="${targetStr}"]`);
          if (el) (el as HTMLElement).click();
        }
      } else if (action === "clickWithCursor") {
        const targetStr = clickTarget || target;
        if (targetStr) {
          const el = document.querySelector(`[data-tour="${targetStr}"]`) || document.querySelector(`[data-tour-id="${targetStr}"]`);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const r = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
              setCursorLabel(cursorLabel);
              setCursorTarget(r);
              setTargetRect(r);
              (el as HTMLElement).scrollIntoView({ block: "nearest", behavior: reduceMotionRef.current ? "auto" : "smooth" });

              // 1. Dwell for 460ms so the viewer sees the cursor arrive and sees the label
              window.setTimeout(() => {
                if (cancelled) return;
                setIsClicking(true);
                playDemoSound("click");

                // 2. Trigger the click after 220ms while ripple waves are actively expanding
                window.setTimeout(() => {
                  if (cancelled) return;
                  (el as HTMLElement).click();

                  // 3. Keep click active for another 200ms
                  window.setTimeout(() => {
                    if (cancelled) return;
                    setIsClicking(false);
                    // 4. Fade cursor out smoothly after 350ms
                    window.setTimeout(() => {
                      if (cancelled) return;
                      setCursorTarget(null);
                      setCursorLabel(undefined);
                    }, 350);
                  }, 200);
                }, 220);
              }, 460);
            } else {
              (el as HTMLElement).click();
            }
          }
        }
      }
    };

    const updateTargetRect = (targetSelector?: string, rawSelector?: string) => {
      if (currentScene.interstitial) {
        if (lastRect !== null) {
          lastRect = null;
          setTargetRect(null);
        }
        return null;
      }

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
          if (!lastRect || Math.abs(lastRect.x - newRect.x) > 1 || Math.abs(lastRect.y - newRect.y) > 1 || Math.abs(lastRect.w - newRect.w) > 1 || Math.abs(lastRect.h - newRect.h) > 1) {
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
          if (now - stageStart < 3000) return;
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
          if (now - stageStart < 3000) return;
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
        
        if (!targetFound && now - stageStart < 3000) return;
        
        currentStage = "play";
        clockStart = performance.now();
        playDemoSound("pop");

        // Reset scroll position smoothly to top if not an interstitial and no scroll beat at atMs 0
        if (!currentScene.interstitial && !currentScene.beats?.some(b => b.atMs === 0 && typeof b.scrollOffset === "number")) {
          const scrollContainer = document.querySelector('main')?.parentElement || document.querySelector('main');
          if (scrollContainer) {
            scrollContainer.scrollTo({ top: 0, behavior: reduceMotionRef.current ? "auto" : "smooth" });
          }
        }
        
        if (currentScene.action && currentScene.action !== "none") {
          executeAction(currentScene.action, currentScene.target, undefined, undefined, undefined, currentScene.cursorLabel);
        }
      }
      
      if (currentStage === "play") {
        const elapsed = now - clockStart;
        
        if (elapsed - lastElapsedReport > 80 || elapsed >= currentScene.durationMs) {
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
                  executeAction(beat.action, beat.target, beat.clickTarget, beat.scrollOffset, beat.route, beat.cursorLabel);
                }
              }
            }
          }
        }
        
        updateTargetRect(currentTarget, currentSelector);
        
        if (elapsed >= currentScene.durationMs) {
          cancelled = true;
          if (sceneIndex + 1 < DEMO_SCENES.length) {
            setSceneIndex(sceneIndex + 1);
          } else {
            phaseRef.current = "ended";
            setPhase("ended");
            stopDemoMusic();
            clearDemoMovie();
          }
        }
      }
    }, 40);

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
          {/* Input blocking layer - tap anywhere to resume sound if blocked by autoplay */}
          <div 
            className="absolute inset-0 z-10 pointer-events-auto bg-transparent cursor-pointer"
            onClick={() => {
              unlockDemoAudio();
              startDemoMusic();
            }}
          />
          
          <MovieControls 
            currentSceneIndex={sceneIndex}
            elapsedMs={elapsedMs}
            onSkip={handleSkip}
          />
          
          {/* Interstitial overlay when present */}
          <AnimatePresence mode="wait">
            {currentScene?.interstitial && (
              <MovieInterstitial key={currentScene.id} info={currentScene.interstitial} />
            )}
          </AnimatePresence>

          {/* Hardware-accelerated Persistent Spotlight overlay */}
          {!currentScene?.interstitial && (
            <div
              key="persistent-spotlight"
              className="fixed z-[40] rounded-2xl border-2 border-teal-400/80 pointer-events-none shadow-[0_0_32px_rgba(45,212,191,0.45)]"
              style={{
                transform: `translate3d(${spotlightCoords.x - 8}px, ${spotlightCoords.y - 8}px, 0)`,
                width: `${Math.max(24, spotlightCoords.w + 16)}px`,
                height: `${Math.max(24, spotlightCoords.h + 16)}px`,
                opacity: spotlightVisible ? 1 : 0,
                boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.60), 0 0 32px rgba(45, 212, 191, 0.40)",
                transition: reduceMotion
                  ? "opacity 0.15s ease"
                  : "transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), width 0.65s cubic-bezier(0.16, 1, 0.3, 1), height 0.65s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.38s ease",
                willChange: "transform, width, height, opacity",
              }}
            >
              {/* Inner glowing accent ring */}
              <div className="absolute inset-0 rounded-2xl ring-2 ring-teal-300/40 animate-pulse pointer-events-none" />
            </div>
          )}

          {/* Fullscreen soft dim when spotlight is not active and not interstitial */}
          {!currentScene?.interstitial && !spotlightVisible && (
            <div className="fixed inset-0 z-[39] bg-slate-950/45 pointer-events-none transition-opacity duration-300" />
          )}

          {/* Animated Interactive Cursor & Tap Indicator */}
          <DemoCursor
            targetRect={cursorTarget}
            isClicking={isClicking}
            label={cursorLabel}
          />

          {/* Centered Caption - perfectly centered on mobile & desktop */}
          <AnimatePresence mode="wait">
            {currentScene && !currentScene.interstitial && (
              <motion.div
                key={currentScene.id}
                role="status"
                aria-live="polite"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="fixed z-[75] left-4 right-4 mx-auto max-w-md sm:max-w-xl sm:left-1/2 sm:right-auto sm:-translate-x-1/2 rounded-2xl bg-slate-900/92 px-5 py-4 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl border border-white/15"
                style={
                  arogyaOpen
                    ? { top: "calc(74px + env(safe-area-inset-top))", bottom: "auto" }
                    : { bottom: bannerHeight > 0 ? `max(${bannerHeight + 16}px, calc(140px + env(safe-area-inset-bottom)))` : "calc(140px + env(safe-area-inset-bottom))" }
                }
              >
                <p className="text-[14px] sm:text-[16px] font-medium tracking-tight text-white/95 leading-snug">
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
          stopDemoMusic();
          navigate(demoPortalHome("student"));
          setArogyaOpen(false);
        }} />
      )}
    </div>,
    document.body
  );
}
