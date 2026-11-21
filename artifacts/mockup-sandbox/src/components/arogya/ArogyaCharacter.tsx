import { motion, useReducedMotion, type Variants } from "framer-motion";

export type ArogyaState = "idle" | "listening" | "thinking" | "talking" | "waving" | "error";

interface ArogyaCharacterProps {
  state?: ArogyaState;
  size?: number;
  className?: string;
  closeUp?: boolean;
}

export function ArogyaCharacter({ state = "idle", size = 48, className = "", closeUp = false }: ArogyaCharacterProps) {
  const shouldReduceMotion = useReducedMotion();
  const imageSize = closeUp ? Math.round(size * 1.65) : size;

  const floatVariants: Variants = {
    idle: { y: shouldReduceMotion ? 0 : [0, -3, 0], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 4, ease: "easeInOut" } },
    listening: { y: 0, scale: shouldReduceMotion ? 1 : 1.05, transition: { duration: shouldReduceMotion ? 0 : 0.3 } },
    thinking: { y: shouldReduceMotion ? 0 : [0, -2, 0], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 2, ease: "easeInOut" } },
    talking: { y: shouldReduceMotion ? 0 : [0, -1, 0], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.4 } },
    waving: { rotate: shouldReduceMotion ? 5 : [0, 5, -5, 0], transition: { duration: shouldReduceMotion ? 0 : 0.5 } },
    error: { x: shouldReduceMotion ? 0 : [-2, 2, -2, 2, 0], transition: { duration: shouldReduceMotion ? 0 : 0.4 } },
  };

  return (
    <div className={`relative flex items-center justify-center ${closeUp ? "overflow-hidden rounded-full" : ""} ${className}`} style={{ width: size, height: size }}>
      <motion.img
        src={`${import.meta.env.BASE_URL}hoot-body.png`}
        alt=""
        width={imageSize}
        height={imageSize}
        className={closeUp ? "absolute top-0 left-1/2 max-w-none object-contain" : "object-contain"}
        style={closeUp ? { marginLeft: -imageSize * 0.56 } : undefined}
        variants={floatVariants}
        animate={state}
        initial="idle"
      />
    </div>
  );
}
