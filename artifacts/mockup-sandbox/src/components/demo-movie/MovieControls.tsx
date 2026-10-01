import * as React from "react";
import { DEMO_SCENES, CHAPTERS, getChapterShares } from "./scenes";

type MovieControlsProps = {
  currentSceneIndex: number;
  elapsedMs: number;
  onSkip: () => void;
};

export function MovieControls({ currentSceneIndex, elapsedMs, onSkip }: MovieControlsProps) {
  const shares = React.useMemo(() => getChapterShares(), []);
  
  // Calculate total duration up to the end of the previous scene
  let precedingMs = 0;
  for (let i = 0; i < currentSceneIndex; i++) {
    precedingMs += DEMO_SCENES[i]?.durationMs || 0;
  }
  
  const totalDuration = React.useMemo(() => DEMO_SCENES.reduce((acc, scene) => acc + scene.durationMs, 0), []);
  const currentTotalMs = precedingMs + elapsedMs;
  
  return (
    <div className="pointer-events-auto fixed inset-x-0 top-0 z-[100] flex items-center gap-3 px-4 pb-4 pt-[max(16px,env(safe-area-inset-top))] drop-shadow-md sm:inset-auto sm:left-4 sm:bottom-40 sm:translate-x-0 sm:p-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-2xl bg-slate-900/75 px-3 py-2 backdrop-blur-md sm:w-[260px] sm:flex-none">
        <div className="px-0.5 text-[10px] font-medium text-white/80 sm:text-[11px]">Demo — sample data</div>
        <div className="flex w-full gap-1">
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
                className="flex flex-col gap-1.5"
                style={{ width: `${share * 100}%` }}
              >
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-900/20 backdrop-blur-sm">
                  <div 
                    className="h-full bg-white transition-all duration-100 ease-linear"
                    style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white drop-shadow-md px-0.5">
                  {chapter.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onSkip}
        data-testid="demo-movie-skip"
        aria-label="Skip demo"
        className="flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-full bg-slate-900/40 px-4 text-xs font-semibold tracking-wide text-white backdrop-blur-md transition-colors hover:bg-slate-900/60"
      >
        Skip
      </button>
    </div>
  );
}
