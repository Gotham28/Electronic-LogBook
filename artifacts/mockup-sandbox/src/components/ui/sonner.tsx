"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {

  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-card-edge group-[.toaster]:shadow-[0_20px_60px_color-mix(in_srgb,var(--gothos-forest)_12%,transparent)] group-[.toaster]:backdrop-blur-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-forest group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-mist group-[.toast]:text-forest",
        },
      }}
      {...props}
      theme="light"
      richColors={false}
      style={{
        ...props.style,
        "--normal-bg": "var(--gothos-sage)",
        "--normal-text": "var(--gothos-ink)",
        "--normal-border": "var(--gothos-line)",
        "--normal-bg-hover": "var(--gothos-mist)",
        "--normal-border-hover": "var(--gothos-muted)",
      } as React.CSSProperties}
    />
  )
}

export { Toaster }
