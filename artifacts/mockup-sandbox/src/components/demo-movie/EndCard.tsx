import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { clearDemoMovie, demoPortalHome, requestDemoMovieReplay, startDemoSession } from "@/lib/demoSession";
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
      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <motion.div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-end-title"
        className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 20, scale: reduceMotion ? 1 : 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <h2 id="demo-end-title" className="mb-3 font-display text-2xl font-bold tracking-tight text-slate-900">
          That was Arogya in about 90 seconds
        </h2>
        <p className="mb-8 text-sm text-slate-500">
          Replay it, or explore the demo yourself.
        </p>
        
        <div className="flex flex-col gap-3">
          <button
            ref={firstButtonRef}
            type="button"
            onClick={requestDemoMovieReplay}
            data-testid="demo-movie-replay"
            className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-100 font-semibold text-slate-900 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            Replay
          </button>
          <button
            type="button"
            onClick={handleExplore}
            data-testid="demo-movie-explore"
            className="flex h-12 w-full items-center justify-center rounded-xl bg-teal-600 font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Explore the demo yourself
          </button>
        </div>
      </motion.div>
    </div>
  );
}
