import * as React from "react";
import { DEMO_SCENES, CHAPTERS, getChapterShares } from "./scenes";

type MovieControlsProps = {
  currentSceneIndex: number;
  elapsedMs: number;
  onSkip: () => void;
};

export function MovieControls({ currentSceneIndex, elapsedMs, onSkip }: MovieControlsProps) {
  const shares = React.useMemo(() => getChapterShares(), []);
  const currentChapter = DEMO_SCENES[currentSceneIndex]?.chapter;
  
  // Calculate total duration up to the end of the previous scene
  let precedingMs = 0;
  for (let i = 0; i < currentSceneIndex; i++) {
    precedingMs += DEMO_SCENES[i]?.durationMs || 0;
  }
  
  const currentTotalMs = precedingMs + elapsedMs;
  
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-6xl rounded-[20px] border border-white/75 bg-white/90 p-3 shadow-[0_14px_40px_rgba(16,36,39,0.14)] backdrop-blur-xl sm:p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#0F766E] shadow-[0_0_0_4px_rgba(15,118,110,0.12)]" />
            <span className="truncate text-xs font-semibold tracking-wide text-[#16323A]">Guided demo</span>
            <span className="hidden text-xs text-[#52696C] sm:inline">Sample data</span>
          </div>
          <button
            type="button"
            onClick={onSkip}
            data-testid="demo-movie-skip"
            aria-label="Skip demo"
            className="flex h-10 min-w-[64px] shrink-0 items-center justify-center rounded-xl border border-[#D9EAE7] bg-white px-3 text-sm font-semibold text-[#16323A] transition-colors duration-150 hover:bg-[#F2F8F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2"
          >
            Skip
          </button>
        </div>

        <div className="mt-3 flex w-full gap-3 sm:gap-5">
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
                className="flex min-w-0 flex-col gap-1.5"
                style={{ flex: `${share} 1 0%` }}
                aria-current={currentChapter === chapter.id ? "step" : undefined}
              >
                <div
                  role="progressbar"
                  aria-label={`${chapter.label} chapter progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.max(0, Math.min(100, fillPct)))}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-[#D9EAE7]"
                >
                  <div 
                    className="h-full rounded-full bg-[#0F766E] transition-[width] duration-150 ease-out"
                    style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }}
                  />
                </div>
                <span className={`truncate text-xs font-semibold ${currentChapter === chapter.id ? "text-[#0F766E]" : "text-[#64787B]"}`}>
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
