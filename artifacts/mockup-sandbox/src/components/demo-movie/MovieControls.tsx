import * as React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpenCheck, Clock3, X } from "lucide-react";
import { DEMO_SCENES, CHAPTERS, getChapterShares } from "./scenes";

type MovieControlsProps = {
  currentSceneIndex: number;
  onSkip: () => void;
  onBack: () => void;
  onNext: () => void;
  isLastScene: boolean;
  isFirstScene: boolean;
  sceneStartedAt: number | null;
  sceneDurationMs: number;
  reduceMotion: boolean;
};

export function MovieControls({ currentSceneIndex, onSkip, onBack, onNext, isLastScene, isFirstScene, sceneStartedAt, sceneDurationMs, reduceMotion }: MovieControlsProps) {
  const shares = React.useMemo(() => getChapterShares(), []);
  const currentChapter = DEMO_SCENES[currentSceneIndex]?.chapter;
  
  // Calculate total duration up to the end of the previous scene
  let precedingMs = 0;
  for (let i = 0; i < currentSceneIndex; i++) {
    precedingMs += DEMO_SCENES[i]?.durationMs || 0;
  }
  
  // Progress advances at scene boundaries so the rail stays visually steady.
  const currentTotalMs = precedingMs;
  const chapterLabel = CHAPTERS.find((chapter) => chapter.id === currentChapter)?.label ?? "Demo";
  
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] px-3 pt-[max(10px,env(safe-area-inset-top))] sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-6xl rounded-[22px] border border-white/15 bg-[#102B2D]/95 p-2.5 text-white shadow-[0_18px_56px_rgba(6,25,27,0.3)] backdrop-blur-2xl sm:rounded-[24px] sm:p-3">
        <div className="flex items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.08] text-teal-100 shadow-inner sm:h-10 sm:w-10" aria-hidden="true">
              <BookOpenCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-semibold tracking-tight text-white sm:text-sm">Guided demo</span>
                <span className="hidden rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-teal-50/80 sm:inline-flex">Sample data</span>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-medium tracking-wide text-white/55 sm:text-[11px]">
                {chapterLabel} <span className="px-1 text-white/30">/</span> {String(currentSceneIndex + 1).padStart(2, "0")} of {String(DEMO_SCENES.length).padStart(2, "0")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={isFirstScene}
              data-testid="demo-movie-back"
              aria-label="Previous demo stage"
              title="Previous part"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-white/85 transition-colors duration-150 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#102B2D] disabled:cursor-not-allowed disabled:opacity-35 sm:h-10 sm:w-10"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
            </button>
            {sceneStartedAt !== null && (
              <div
                role="img"
                aria-label="Progress until the next demo part"
                title="Progress until the next demo part"
                className="relative grid h-9 w-9 shrink-0 place-items-center sm:h-10 sm:w-10"
              >
                <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden="true">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2.5" />
                  <motion.circle
                    key={`${currentSceneIndex}-${sceneStartedAt}`}
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#5EEAD4"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="88 88"
                    initial={{ strokeDashoffset: 88 }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: reduceMotion ? 0 : sceneDurationMs / 1000, ease: "linear" }}
                  />
                </svg>
                <Clock3 className="absolute h-3.5 w-3.5 text-teal-100" strokeWidth={1.8} aria-hidden="true" />
              </div>
            )}
            <button
              type="button"
              onClick={onNext}
              data-testid="demo-movie-next"
              aria-label={isLastScene ? "Finish demo" : "Next demo stage"}
              className="flex h-9 min-w-[72px] items-center justify-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-semibold text-[#102B2D] shadow-[0_4px_14px_rgba(0,0,0,0.16)] transition-all duration-150 hover:-translate-y-px hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#102B2D] sm:h-10 sm:min-w-[82px] sm:text-sm"
            >
              {isLastScene ? "Finish" : "Next"}
              {!isLastScene && <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={onSkip}
              data-testid="demo-movie-skip"
              aria-label="Skip demo"
              title="Skip demo"
              className="grid h-9 w-9 place-items-center rounded-full text-white/60 transition-colors duration-150 hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#102B2D] sm:flex sm:h-10 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-xs sm:font-semibold"
            >
              <X className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex w-full gap-3 border-t border-white/10 pt-2.5 sm:mt-3 sm:gap-5 sm:pt-3">
          {CHAPTERS.map((chapter) => {
            const share = shares[chapter.id];
            if (share === 0) return null;
            
            let chapterPrecedingMs = 0;
            let chapterDurationMs = 0;
            let inChapter = false;
            
            for (const scene of DEMO_SCENES) {
              if (scene.chapter === chapter.id) {
                chapterDurationMs += scene.durationMs;
                inChapter = true;
              } else if (!inChapter) {
                chapterPrecedingMs += scene.durationMs;
              }
            }
            
            // Calculate fill percentage for this specific chapter
            let fillPct = 0;
            if (currentTotalMs >= chapterPrecedingMs + chapterDurationMs) {
              fillPct = 100;
            } else if (currentTotalMs > chapterPrecedingMs) {
              fillPct = ((currentTotalMs - chapterPrecedingMs) / chapterDurationMs) * 100;
            }
            
            return (
              <div 
                key={chapter.id} 
                className="flex min-w-0 flex-col gap-1"
                style={{ flex: `${share} 1 0%` }}
                aria-current={currentChapter === chapter.id ? "step" : undefined}
              >
                <div
                  role="progressbar"
                  aria-label={`${chapter.label} chapter progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.max(0, Math.min(100, fillPct)))}
                  className="h-1 w-full overflow-hidden rounded-full bg-white/[0.12]"
                >
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-teal-300 to-cyan-200 transition-[width] duration-300 ease-out"
                    style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }}
                  />
                </div>
                <span className={`truncate text-[10px] font-semibold tracking-wide sm:text-[11px] ${currentChapter === chapter.id ? "text-teal-100" : "text-white/45"}`}>
                  {chapter.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
