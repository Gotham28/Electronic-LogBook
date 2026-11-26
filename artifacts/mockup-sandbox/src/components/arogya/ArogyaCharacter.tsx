import { motion, useReducedMotion, type Variants } from "framer-motion";

export type ArogyaState = "idle" | "resting" | "listening" | "thinking" | "talking" | "waving" | "error";

interface ArogyaCharacterProps {
  state?: ArogyaState;
  initialState?: ArogyaState;
  size?: number;
  className?: string;
  closeUp?: boolean;
  decorative?: boolean;
  /** Opt-in flag for the signed-out sample so pose resets and immediate reduced-motion settling stay scoped away from authenticated callers. */
  scopedSampleMotion?: boolean;
  /** Reactive reduced-motion override for the signed-out sample so live matchMedia changes settle immediately. */
  sampleReducedMotion?: boolean;
}

export function ArogyaCharacter({
  state = "idle",
  initialState = "idle",
  size = 48,
  className = "",
  closeUp = false,
  decorative = false,
  scopedSampleMotion = false,
  sampleReducedMotion,
}: ArogyaCharacterProps) {
  const shouldReduceMotion = useReducedMotion();
  const reduceMotion = scopedSampleMotion
    ? (sampleReducedMotion ?? Boolean(shouldReduceMotion))
    : Boolean(shouldReduceMotion);
  const imageSize = closeUp ? Math.round(size * 1.65) : size;
  const resolvedInitial: ArogyaState =
    scopedSampleMotion && reduceMotion ? "resting" : initialState;
  const resolvedAnimate: ArogyaState =
    scopedSampleMotion && reduceMotion ? "resting" : state;

  const defaultVariants: Variants = {
    idle: { y: shouldReduceMotion ? 0 : [0, -3, 0], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 4, ease: "easeInOut" } },
    resting: { y: 0, scale: 1, rotate: 0, x: 0, transition: { duration: shouldReduceMotion ? 0 : 0.25 } },
    listening: { y: 0, scale: shouldReduceMotion ? 1 : 1.05, transition: { duration: shouldReduceMotion ? 0 : 0.3 } },
    thinking: { y: shouldReduceMotion ? 0 : [0, -2, 0], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 2, ease: "easeInOut" } },
    talking: { y: shouldReduceMotion ? 0 : [0, -1, 0], transition: shouldReduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.4 } },
    waving: { rotate: shouldReduceMotion ? 5 : [0, 5, -5, 0], transition: { duration: shouldReduceMotion ? 0 : 0.5 } },
    error: { x: shouldReduceMotion ? 0 : [-2, 2, -2, 2, 0], transition: { duration: shouldReduceMotion ? 0 : 0.4 } },
  };

  const sampleVariants: Variants = {
    idle: { y: reduceMotion ? 0 : [0, -3, 0], scale: 1, rotate: 0, x: 0, transition: reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 4, ease: "easeInOut" } },
    resting: { y: 0, scale: 1, rotate: 0, x: 0, transition: { duration: reduceMotion ? 0 : 0.25 } },
    listening: { y: 0, scale: reduceMotion ? 1 : 1.05, rotate: 0, x: 0, transition: { duration: reduceMotion ? 0 : 0.3 } },
    thinking: { y: reduceMotion ? 0 : [0, -2, 0], scale: 1, rotate: 0, x: 0, transition: reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 2, ease: "easeInOut" } },
    talking: { y: reduceMotion ? 0 : [0, -1, 0], scale: 1, rotate: 0, x: 0, transition: reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.4 } },
    waving: { y: 0, scale: 1, rotate: reduceMotion ? 0 : [0, 5, -5, 0], x: 0, transition: { duration: reduceMotion ? 0 : 0.5 } },
    error: { y: 0, scale: 1, rotate: 0, x: reduceMotion ? 0 : [-2, 2, -2, 2, 0], transition: { duration: reduceMotion ? 0 : 0.4 } },
  };

  return (
    <div
      aria-hidden={decorative ? true : undefined}
      className={`relative flex items-center justify-center ${closeUp ? "overflow-hidden rounded-full" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      <motion.img
        src={`${import.meta.env.BASE_URL}hoot-body.png`}
        alt=""
        width={imageSize}
        height={imageSize}
        className={closeUp ? "absolute top-0 left-1/2 max-w-none object-contain" : "object-contain"}
        style={closeUp ? { marginLeft: -imageSize * 0.56 } : undefined}
        variants={scopedSampleMotion ? sampleVariants : defaultVariants}
        animate={resolvedAnimate}
        initial={resolvedInitial}
        transition={scopedSampleMotion && reduceMotion ? { duration: 0 } : undefined}
      />
    </div>
  );
}
