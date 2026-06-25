"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

function PopoverPortal({ className, ...props }: PopoverPrimitive.Portal.Props) {
  return (
    <PopoverPrimitive.Portal
      data-slot="popover-portal"
      className={cn("z-50", className)}
      {...props}
    />
  )
}

function Popover({
  open,
  onOpenChange,
  ...props
}: PopoverPrimitive.Root.Props) {
  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  )
}

function PopoverTrigger({ className, ...props }: PopoverPrimitive.Trigger.Props) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={cn("cursor-pointer", className)}
      {...props}
    />
  )
}

function PopoverPositioner({ className, ...props }: PopoverPrimitive.Positioner.Props) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        data-slot="popover-positioner"
        className={cn("z-50", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverPopup({ className, ...props }: PopoverPrimitive.Popup.Props) {
  return (
    <PopoverPrimitive.Popup
      data-slot="popover-popup"
      className={cn(
        "z-50 min-w-52 origin-(--transform-origin) rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )
}

function PopoverArrow({ className, ...props }: PopoverPrimitive.Arrow.Props) {
  return (
    <PopoverPrimitive.Arrow
      data-slot="popover-arrow"
      className={cn("fill-popover", className)}
      {...props}
    />
  )
}

function PopoverClose({ className, ...props }: PopoverPrimitive.Close.Props) {
  return (
    <PopoverPrimitive.Close
      data-slot="popover-close"
      className={cn("cursor-pointer", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverPortal,
  PopoverTrigger,
  PopoverPositioner,
  PopoverPopup,
  PopoverArrow,
  PopoverClose,
}
