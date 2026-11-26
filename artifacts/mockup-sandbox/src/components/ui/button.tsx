import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
" hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          "border border-forest bg-primary text-primary-foreground hover:bg-deep shadow-[0_14px_30px_color-mix(in_srgb,var(--gothos-forest)_18%,transparent)]",
        destructive:
          "border border-destructive bg-destructive text-destructive-foreground hover:bg-deep shadow-[0_14px_30px_color-mix(in_srgb,var(--gothos-forest)_18%,transparent)]",
        outline:
          "border-[0.5px] bg-card text-forest border-forest hover:bg-sage shadow-[0_12px_24px_color-mix(in_srgb,var(--gothos-forest)_4%,transparent)] active:shadow-none",
        secondary:
          "border border-forest bg-mist text-forest shadow-none hover:bg-sage",
        ghost: "border border-transparent bg-transparent shadow-none",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-lg px-3 text-xs",
        lg: "min-h-10 rounded-xl px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        data-slot="button"
        data-size={size ?? "default"}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
