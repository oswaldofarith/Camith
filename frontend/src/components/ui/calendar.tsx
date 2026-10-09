"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { es } from "react-day-picker/locale";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      locale={es}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4 sm:flex-row", defaults.months),
        month: cn("flex w-full flex-col gap-4", defaults.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between", defaults.nav),
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-60 hover:opacity-100",
          defaults.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-60 hover:opacity-100",
          defaults.button_next,
        ),
        month_caption: cn("flex h-7 items-center justify-center", defaults.month_caption),
        caption_label: cn("text-sm font-medium capitalize", defaults.caption_label),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn(
          "text-muted-foreground w-9 text-[0.8rem] font-normal capitalize",
          defaults.weekday,
        ),
        week: cn("mt-2 flex w-full", defaults.week),
        day: cn(
          "relative size-9 p-0 text-center text-sm [&:has([aria-selected])]:bg-accent/15",
          "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
          defaults.day,
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 p-0 font-normal aria-selected:opacity-100",
        ),
        range_start: "rounded-l-md bg-accent/15",
        range_end: "rounded-r-md bg-accent/15",
        range_middle: "[&>button]:bg-transparent [&>button]:text-foreground",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&>button]:bg-muted [&>button]:font-semibold",
        outside: "text-muted-foreground opacity-50 aria-selected:opacity-30",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", chevronClass)} {...rest} />
          ) : (
            <ChevronRight className={cn("size-4", chevronClass)} {...rest} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
