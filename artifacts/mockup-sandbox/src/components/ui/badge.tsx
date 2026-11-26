import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border-[0.5px] px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" +
  " hover-elevate ",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-[0_8px_18px_color-mix(in_srgb,var(--gothos-forest)_18%,transparent)]",
        secondary:
          "border-transparent bg-mist text-forest",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-[0_8px_18px_color-mix(in_srgb,var(--gothos-forest)_18%,transparent)]",
        outline: "text-foreground border-[0.5px] bg-card border-line",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
