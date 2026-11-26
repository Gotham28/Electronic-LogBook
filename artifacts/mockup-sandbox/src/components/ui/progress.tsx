"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-sage",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-forest transition-transform duration-700 ease-out"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

function ProgressRing({ value, strokeWidth }: { value: number; strokeWidth: number }) {
  const radius = (100 - strokeWidth) / 2
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full -rotate-90" fill="none">
      <circle cx="50" cy="50" r={radius} strokeWidth={strokeWidth} className="stroke-line-soft" />
      {value > 0 && (
        <circle
          cx="50"
          cy="50"
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-forest"
          pathLength="100"
          strokeDasharray={value === 100 ? undefined : value + " 100"}
        />
      )}
    </svg>
  )
}

export { Progress, ProgressRing }
