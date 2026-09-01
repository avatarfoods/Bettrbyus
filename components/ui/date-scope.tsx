"use client";

import { CalendarDays } from "lucide-react";
import type { DateScope } from "@/lib/date-scope";
import { cn } from "@/lib/utils";

/**
 * One day, or a span of them.
 *
 * Both questions get asked and neither is a special case of the other:
 * "what did I have on the 31st" wants a single day, "what moved last week"
 * wants two. Forcing a range on the first means picking the same date twice;
 * forcing a day on the second means looking seven times.
 *
 * The toggle is the control, so the two dates appear only when they mean
 * something rather than sitting there half-used.
 */
/** How wide a range opens when someone switches to one. */
const DEFAULT_SPAN = 7;

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function DateScopePicker({
  label,
  scope,
  onChange,
  max,
  className,
}: {
  label: string;
  scope: DateScope;
  onChange: (next: DateScope) => void;
  /** Usually today - there is nothing to know about tomorrow. */
  max?: string;
  className?: string;
}) {
  const day = scope.kind === "day" ? scope.date : scope.to;
  /**
   * Switching to Range opens a week, not a single day twice.
   *
   * From equal to To is a legal range that answers nothing - it asks for one
   * day's worth of activity - so the toggle looked broken: press Range and
   * the list empties. A week back is the span people mean.
   */
  const from =
    scope.kind === "range" ? scope.from : shift(scope.date, -DEFAULT_SPAN);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" />

      <div className="flex flex-col gap-0.5">
        <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <div className="flex overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-600">
            {(
              [
                ["day", "Day"],
                ["range", "Range"],
              ] as const
            ).map(([kind, text]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={scope.kind === kind}
                onClick={() =>
                  onChange(
                    kind === "day"
                      ? { kind: "day", date: day }
                      : { kind: "range", from, to: day }
                  )
                }
                className={cn(
                  "h-8 px-2 text-xs transition-colors",
                  scope.kind === kind
                    ? "bg-primary font-medium text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {text}
              </button>
            ))}
          </div>

          {scope.kind === "range" && (
            <>
              <input
                type="date"
                value={scope.from}
                max={scope.to}
                aria-label={`${label} from`}
                onChange={(event) =>
                  event.target.value &&
                  onChange({ ...scope, from: event.target.value })
                }
                className="h-8 rounded-sm border border-zinc-300 bg-card px-1.5 text-sm tabular-nums dark:border-zinc-600"
              />
              <span className="text-xs text-muted-foreground">to</span>
            </>
          )}

          <input
            type="date"
            value={day}
            max={max}
            min={scope.kind === "range" ? scope.from : undefined}
            aria-label={scope.kind === "range" ? `${label} to` : label}
            onChange={(event) => {
              if (!event.target.value) return;
              onChange(
                scope.kind === "day"
                  ? { kind: "day", date: event.target.value }
                  : { ...scope, to: event.target.value }
              );
            }}
            className="h-8 rounded-sm border border-zinc-300 bg-card px-1.5 text-sm tabular-nums dark:border-zinc-600"
          />
        </div>
      </div>
    </div>
  );
}
