"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-10 shrink-0 items-center rounded-[1px] p-0.5 transition-colors outline-none",
        "bg-input data-checked:bg-primary",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function SwitchThumb({ className, ...props }: SwitchPrimitive.Thumb.Props) {
  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(
        "size-5 rounded-[1px] bg-background shadow-sm transition-transform data-checked:translate-x-4",
        className
      )}
      {...props}
    />
  )
}

export { Switch, SwitchThumb }
