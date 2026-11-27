import * as React from "react";
import { animate, useReducedMotion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/session";

export function useDemoMotionEnabled() {
  const reduceMotion = useReducedMotion();
  return isDemoMode() && reduceMotion === false;
}

export function useDemoAnimatedValue(value: number, duration = 0.62) {
  const animateValue = useDemoMotionEnabled();
  const [displayValue, setDisplayValue] = React.useState(animateValue ? 0 : value);

  React.useEffect(() => {
    if (!animateValue) {
      setDisplayValue(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: "easeOut",
      onUpdate: setDisplayValue,
    });
    return () => controls.stop();
  }, [animateValue, duration, value]);

  return displayValue;
}

export function DemoCount({
  value,
  suffix = "",
  prefix = "",
  className,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const displayed = useDemoAnimatedValue(value);
  return <span className={className}>{prefix}{Math.round(displayed).toLocaleString("en-IN")}{suffix}</span>;
}

export function DemoProgress({ value, className }: { value: number; className?: string }) {
  const animateProgress = useDemoMotionEnabled();
  const [entered, setEntered] = React.useState(!animateProgress);

  React.useEffect(() => {
    if (!animateProgress) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [animateProgress]);

  return (
    <Progress
      value={animateProgress && !entered ? 0 : value}
      className={cn(className, animateProgress ? "[&>div]:duration-700" : "[&>div]:duration-0")}
    />
  );
}
