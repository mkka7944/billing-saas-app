"use client"

import * as React from "react"
import { DayPicker, UI, DayFlag, SelectionState } from "react-day-picker"
import "react-day-picker/style.css"

import { cn } from "@/lib/utils"
import { ChevronLeftIcon } from "lucide-react"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = false,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("rdp-root", className)}
      classNames={{
        [UI.Root]: "rdp-root",
        [UI.Nav]: "flex items-center justify-between px-1 py-1.5",
        [UI.PreviousMonthButton]: "h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer mr-auto",
        [UI.NextMonthButton]: "h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer ml-auto",
        [UI.Month]: "w-full",
        [UI.MonthCaption]: "flex items-center justify-center py-1 text-sm font-medium",
        [UI.Weekday]: "text-xs text-muted-foreground font-normal w-9 h-8 flex items-center justify-center",
        [UI.Weekdays]: "flex",
        [UI.Week]: "flex w-full mt-1",
        [UI.Day]: "h-9 w-9 p-0",
        [UI.DayButton]: "h-9 w-9 flex items-center justify-center rounded-md text-sm transition-colors cursor-pointer hover:bg-muted aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary aria-selected:hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        [DayFlag.today]: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
        [DayFlag.outside]: "text-muted-foreground/50 aria-selected:text-muted-foreground/50",
        [DayFlag.disabled]: "text-muted-foreground/30 opacity-50 pointer-events-none",
        [DayFlag.hidden]: "invisible",
        [SelectionState.selected]: "",
        ...classNames,
      }}
      components={{
        Chevron: () => <ChevronLeftIcon className="h-4 w-4" />,
      }}
      {...props}
    />
  )
}

export { Calendar }
