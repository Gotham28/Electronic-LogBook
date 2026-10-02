import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

type DemoCursorProps = {
  targetRect: { x: number; y: number; w: number; h: number } | null;
  isClicking: boolean;
  label?: string;
};

export function DemoCursor({ targetRect, isClicking, label }: DemoCursorProps) {
  const reduceMotion = useReducedMotion();
  const lastPosRef = React.useRef<{ x: number; y: number }>({ x: 300, y: 300 });

  const isVisible = targetRect !== null;
  if (targetRect) {
    lastPosRef.current = {
      x: targetRect.x + targetRect.w / 2,
      y: targetRect.y + targetRect.h / 2,
    };
  }

  const posX = lastPosRef.current.x;
  const posY = lastPosRef.current.y;

  return (
    <div className="pointer-events-none fixed inset-0 z-[95] overflow-hidden">
      <motion.div
        className="absolute left-0 top-0"
        initial={{ x: posX, y: posY, opacity: 0 }}
        animate={{
          x: posX,
          y: posY,
          opacity: isVisible ? 1 : 0,
          transition: reduceMotion
            ? { duration: 0.1 }
            : {
                x: { type: "spring", stiffness: 180, damping: 22 },
                y: { type: "spring", stiffness: 180, damping: 22 },
                opacity: { duration: 0.25 },
              },
        }}
      >
        {/* Subtle target center reticle */}
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.75 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute -left-4 -top-4 h-8 w-8 rounded-full border border-teal-400/60 ring-2 ring-teal-400/20"
            />
          )}
        </AnimatePresence>

        {/* Multi-layered dramatic ripple waves on click */}
        <AnimatePresence>
          {isClicking && (
            <>
              {/* Outer shockwave */}
              <motion.div
                key="click-ripple-outer"
                initial={{ scale: 0.2, opacity: 0.95 }}
                animate={{ scale: 3.5, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="absolute -left-7 -top-7 h-14 w-14 rounded-full border-2 border-teal-300 shadow-[0_0_24px_rgba(45,212,191,0.8)]"
              />
              {/* Inner energetic burst */}
              <motion.div
                key="click-ripple-inner"
                initial={{ scale: 0.1, opacity: 0.8 }}
                animate={{ scale: 2.2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="absolute -left-6 -top-6 h-12 w-12 rounded-full bg-teal-400/35 backdrop-blur-sm"
              />
              {/* Core flash */}
              <motion.div
                key="click-flash"
                initial={{ scale: 0.5, opacity: 1 }}
                animate={{ scale: 1.5, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-white shadow-[0_0_12px_#ffffff]"
              />
            </>
          )}
        </AnimatePresence>

        {/* Cursor Pointer Body with Spring Squeeze */}
        <motion.div
          animate={
            isClicking
              ? { scale: [1, 0.72, 1.08, 1], rotate: [0, -12, 4, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={{ duration: 0.32, ease: "easeInOut" }}
          className="relative drop-shadow-[0_8px_20px_rgba(0,0,0,0.65)]"
        >
          {/* Custom SVG Modern Arrow Pointer (36x36 for high visibility on all screens) */}
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="transform -translate-x-1 -translate-y-1"
          >
            {/* Dark contrast drop base */}
            <path
              d="M3 3L11 21L14 13.5L21.5 10.5L3 3Z"
              fill="#090d16"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            {/* Neon teal accent gradient chevron */}
            <path
              d="M7 6L11 16.5L13.5 11.5L18.5 9.5L7 6Z"
              fill="#2dd4bf"
            />
            {/* Core highlight dot */}
            <circle cx="9.5" cy="9.5" r="1.5" fill="#ffffff" />
          </svg>

          {/* Action Label Badge */}
          {label && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute left-8 top-3 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-teal-400/50 bg-slate-950/92 px-3 py-1 text-[12px] font-bold tracking-tight text-white shadow-[0_8px_24px_rgba(0,0,0,0.7)] backdrop-blur-xl"
            >
              <span className="h-2 w-2 rounded-full bg-teal-400 animate-ping" />
              <span className="text-teal-300 font-semibold">{label}</span>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
