import * as React from "react";
import { motion, useReducedMotion, type Variants, type Transition } from "framer-motion";

export type ArogyaState = "idle" | "listening" | "thinking" | "talking" | "waving" | "error";

interface ArogyaCharacterProps {
  state?: ArogyaState;
  size?: number;
  className?: string;
}

export function ArogyaCharacter({ state = "idle", size = 48, className = "" }: ArogyaCharacterProps) {
  const shouldReduceMotion = useReducedMotion();

  const floatVariants: Variants = {
    idle: { y: shouldReduceMotion ? 0 : [0, -3, 0], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 4, ease: "easeInOut" } },
    listening: { y: 0, scale: shouldReduceMotion ? 1 : 1.05, transition: { duration: shouldReduceMotion ? 0 : 0.3 } },
    thinking: { y: shouldReduceMotion ? 0 : [0, -2, 0], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 2, ease: "easeInOut" } },
    talking: { y: shouldReduceMotion ? 0 : [0, -1, 0], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.4 } },
    waving: { rotate: shouldReduceMotion ? 5 : [0, 5, -5, 0], transition: { duration: shouldReduceMotion ? 0 : 0.5 } },
    error: { x: shouldReduceMotion ? 0 : [-2, 2, -2, 2, 0], transition: { duration: shouldReduceMotion ? 0 : 0.4 } },
  };

  const eyeVariants: Variants = {
    idle: { scaleY: shouldReduceMotion ? 1 : [1, 1, 0.1, 1, 1], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 5, times: [0, 0.95, 0.96, 0.97, 1] } },
    listening: { scaleY: 1.1, transition: { duration: shouldReduceMotion ? 0 : 0.2 } },
    thinking: { x: shouldReduceMotion ? 2 : [0, 2, 0], y: -2, transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 1.5, repeatType: "reverse" } },
    talking: { scaleY: 1, transition: { duration: shouldReduceMotion ? 0 : 0.2 } },
    waving: { scaleY: 1, transition: { duration: shouldReduceMotion ? 0 : 0.2 } },
    error: { scaleY: 0.8, transition: { duration: shouldReduceMotion ? 0 : 0.2 } },
  };

  const mouthVariants: Variants = {
    idle: { scaleX: 1, scaleY: 1, y: 0, transition: { duration: shouldReduceMotion ? 0 : 0.2 } },
    listening: { scaleX: 0.8, scaleY: 1.2, transition: { duration: shouldReduceMotion ? 0 : 0.2 } },
    thinking: { scaleX: 0.5, y: -1, transition: { duration: shouldReduceMotion ? 0 : 0.2 } },
    talking: { scaleY: shouldReduceMotion ? 1.5 : [1, 2, 0.5, 1.5, 1], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.6 } },
    waving: { scaleX: 1.2, scaleY: 1.5, transition: { duration: shouldReduceMotion ? 0 : 0.2 } },
    error: { scaleX: 1.2, scaleY: -0.5, y: 2, transition: { duration: shouldReduceMotion ? 0 : 0.2 } },
  };

  const thinkingDotsTransition: Transition = { repeat: Infinity, duration: 1 };

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <motion.svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        aria-hidden="true"
        variants={floatVariants}
        animate={state}
        initial="idle"
      >
        <circle cx="50" cy="50" r="45" fill="#14b8a6" />
        <circle cx="50" cy="50" r="38" fill="#f0fdfa" />

        <motion.g variants={eyeVariants} animate={state} initial="idle">
          <circle cx="35" cy="45" r="4" fill="#0f766e" />
          <circle cx="65" cy="45" r="4" fill="#0f766e" />
        </motion.g>

        <motion.path
          d="M 40 65 Q 50 72 60 65"
          fill="none"
          stroke="#0f766e"
          strokeWidth="4"
          strokeLinecap="round"
          variants={mouthVariants}
          animate={state}
          initial="idle"
          style={{ originX: 0.5, originY: 0.5 }}
        />

        {state === "thinking" && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <motion.circle cx="30" cy="25" r="2" fill="#0f766e" animate={shouldReduceMotion ? { opacity: 1 } : { opacity: [0.3, 1, 0.3] }} transition={shouldReduceMotion ? { duration: 0 } : { ...thinkingDotsTransition, delay: 0 }} />
            <motion.circle cx="50" cy="20" r="2" fill="#0f766e" animate={shouldReduceMotion ? { opacity: 1 } : { opacity: [0.3, 1, 0.3] }} transition={shouldReduceMotion ? { duration: 0 } : { ...thinkingDotsTransition, delay: 0.2 }} />
            <motion.circle cx="70" cy="25" r="2" fill="#0f766e" animate={shouldReduceMotion ? { opacity: 1 } : { opacity: [0.3, 1, 0.3] }} transition={shouldReduceMotion ? { duration: 0 } : { ...thinkingDotsTransition, delay: 0.4 }} />
          </motion.g>
        )}
      </motion.svg>
    </div>
  );
}
