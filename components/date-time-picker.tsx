"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DateTimePickerProps = {
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  dateError?: string;
  timeError?: string;
  disabled?: boolean;
};

export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  dateError,
  timeError,
  disabled,
}: DateTimePickerProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="moving-date">Date</Label>
        <Input
          id="moving-date"
          type="date"
          value={date}
          max={new Date().toISOString().split("T")[0]}
          onChange={(e) => onDateChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!dateError}
          className={cn(
            "h-12 text-base",
            dateError && "border-destructive ring-3 ring-destructive/20"
          )}
        />
        {dateError && (
          <p className="text-sm text-destructive">{dateError}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="moving-time">Time</Label>
        <div className="relative">
          <Clock className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="moving-time"
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            disabled={disabled}
            aria-invalid={!!timeError}
            className={cn(
              "h-12 pl-12 text-base",
              timeError && "border-destructive ring-3 ring-destructive/20"
            )}
          />
        </div>
        {timeError && (
          <p className="text-sm text-destructive">{timeError}</p>
        )}
      </div>
    </div>
  );
}
