"use client";

import { Check } from "lucide-react";
import { HR_PALETTE, departmentColor } from "@/lib/hr/colors";
import { cn } from "@/lib/utils";

/**
 * The colour picker, laid out like a spreadsheet's: a column per colour,
 * strong at the top, light at the bottom. Tap a cell. The chosen one carries a
 * tick and its name is written underneath, so "the light blue" is a thing you
 * can point at and a thing you can read.
 */
export function ColorGrid({
  value,
  onChange,
  allowAutomatic,
  index = 0,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  /** Offer "Automatic": the palette handed out in order. */
  allowAutomatic?: boolean;
  /** For the automatic swatch: which colour this item would inherit. */
  index?: number;
}) {
  const chosen = value ? departmentColor(value, index) : null;
  const rows = HR_PALETTE[0]?.shades.length ?? 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="listbox"
        aria-label="Colour"
        className="grid w-max max-w-full gap-0.5 rounded-sm bg-card p-1 ring-1 ring-foreground/10"
        style={{ gridTemplateColumns: `repeat(${HR_PALETTE.length}, minmax(0, 1.5rem))` }}
      >
        {Array.from({ length: rows }, (_, row) =>
          HR_PALETTE.map((column) => {
            const option = column.shades[row];
            const active = chosen?.key === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={active}
                aria-label={option.label}
                title={option.label}
                onClick={() => onChange(option.key)}
                className={cn(
                  "relative flex size-6 items-center justify-center rounded-[2px] transition-transform hover:scale-110 hover:ring-2 hover:ring-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  option.dot,
                  active && "ring-2 ring-foreground ring-offset-1 ring-offset-card"
                )}
              >
                {active && <Check className={cn("size-3.5", row >= 3 ? "text-black/70" : "text-white")} strokeWidth={3} />}
              </button>
            );
          })
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {allowAutomatic && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-pressed={value === null}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 ring-1 transition",
              value === null ? "font-semibold text-foreground ring-2 ring-primary" : "text-muted-foreground ring-border hover:ring-foreground/30"
            )}
          >
            <span className={cn("block h-3.5 w-1.5", departmentColor(null, index).dot)} />
            Automatic
          </button>
        )}
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {chosen ? (
            <>
              <span className={cn("inline-block h-3.5 w-8 rounded-[2px]", chosen.tint)}>
                <span className={cn("block h-full w-1.5", chosen.dot)} />
              </span>
              {chosen.label}
            </>
          ) : allowAutomatic ? (
            "Handed out in order, so nothing clashes."
          ) : (
            "Pick a colour."
          )}
        </span>
      </div>
    </div>
  );
}
