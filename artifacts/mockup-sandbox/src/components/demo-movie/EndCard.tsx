import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { clearDemoMovie, requestDemoMovieReplay, startDemoSession } from "@/lib/demoSession";
import { getCurrentUser } from "@/lib/session";

export function EndCard({ onExplore }: { onExplore: () => void }) {
  const reduceMotion = useReducedMotion();
  const firstButtonRef = React.useRef<HTMLButtonElement>(null);
  
  React.useEffect(() => {
    // Focus management inside the card
    const timer = setTimeout(() => {
      firstButtonRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const focusableElements = e.currentTarget.querySelectorAll('button');
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      
      if (e.shiftKey) {
        if (document.activeElement === first) {
          last?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first?.focus();
          e.preventDefault();
        }
      }
    }
  };

  const handleExplore = () => {
    clearDemoMovie();
    const currentUser = getCurrentUser();
    if (currentUser?.role !== "student") {
      startDemoSession("student", { skipLoginSummary: true });
    }
    onExplore();
  };

  return (
    <div 
      className="pointer-events-auto fixed inset-0 z-[2100] flex items-center justify-center overflow-y-auto bg-[#102427]/60 p-4 backdrop-blur-[3px] sm:p-6"
      onKeyDown={handleKeyDown}
    >
      <motion.div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-end-title"
        className="my-auto w-full max-w-md rounded-[28px] border border-white/80 bg-white/95 p-6 text-center shadow-[0_28px_80px_rgba(5,26,29,0.28)] backdrop-blur-xl sm:p-8"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F2F8F7] text-[#0F766E] ring-1 ring-[#D9EAE7] sm:mb-6 sm:h-16 sm:w-16">
          <CheckCircle2 className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.8} />
        </div>
        <h2 id="demo-end-title" className="mb-3 font-display text-2xl font-bold tracking-tight text-slate-900">
          You’ve seen the three workspaces
        </h2>
        <p className="mb-7 text-sm leading-6 text-slate-600 sm:mb-8">
          Replay the walkthrough or explore the sample workspace at your own pace.
        </p>
        
        <div className="flex flex-col gap-3">
          <button
            ref={firstButtonRef}
            type="button"
            onClick={requestDemoMovieReplay}
            data-testid="demo-movie-replay"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#D9EAE7] bg-[#F2F8F7] font-semibold text-[#16323A] transition-colors duration-150 hover:bg-[#EAF4F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
            Replay
          </button>
          <button
            type="button"
            onClick={handleExplore}
            data-testid="demo-movie-explore"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] font-semibold text-white shadow-[0_8px_18px_rgba(15,118,110,0.18)] transition-colors duration-150 hover:bg-[#0B665F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2"
          >
            Explore the demo yourself
            <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
