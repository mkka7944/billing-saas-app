"use client"

import * as React from "react"
import { useRef, useState, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"

interface DatePickerProps {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  max?: Date
  placeholder?: string
  className?: string
}

export function DatePicker({
  value,
  onChange,
  max,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  const handleSelect = useCallback((date: Date | undefined) => {
    onChange(date)
    setOpen(false)
  }, [onChange])

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center justify-between w-full h-8 px-3 py-1.5 text-xs font-normal rounded-lg border border-input bg-background hover:bg-muted transition-colors cursor-pointer",
          !value && "text-muted-foreground"
        )}
      >
        <span className="flex items-center gap-2">
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{value ? format(value, "PP") : placeholder}</span>
        </span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-[10000] rounded-lg border border-border bg-popover p-2 shadow-md">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleSelect}
            disabled={max ? { after: max } : undefined}
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
