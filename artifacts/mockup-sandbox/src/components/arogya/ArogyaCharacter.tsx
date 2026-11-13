import { motion, useReducedMotion, type Variants } from "framer-motion";

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

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <motion.img
        src={`${import.meta.env.BASE_URL}hoot-body.png`}
        alt=""
        width={size}
        height={size}
        className="object-contain"
        variants={floatVariants}
        animate={state}
        initial="idle"
      />
    </div>
  );
}
