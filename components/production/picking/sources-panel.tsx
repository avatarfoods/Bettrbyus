"use client";

import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import type { PickingRow } from "@/lib/production/picking/types";
import { cn } from "@/lib/utils";

function fmt(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : digits,
  });
}

/**
 * Which recipes make up one material's number, opened beside the sheet.
 *
 * "From recipes" is a single figure with a whole plan behind it, and the
 * question asked in front of it is always the same one - what is this for,
 * and where do I go to check it. The tooltip could only ever list names; this
 * gives each recipe its own share of the pounds and a way through to it, the
 * way the plan opens a recipe beside the grid.
 *
 * The shares are in the row's own unit with the buffer already applied, so
 * they add up to the number that was clicked rather than to something near it.
 */
export function SourcesPanel({
  row,
  backHref,
  extraPct,
  onClose,
}: {
  row: PickingRow;
  /** Where the recipe page sends you back to, dates and filters and all. */
  backHref: string;
  /** The buffer that is already inside these numbers, for the footnote. */
  extraPct: number;
  onClose: () => void;
}) {
  const sources = row.recipeSources;
  const listed = sources.reduce((sum, source) => sum + source.quantity, 0);
  // Rounding aside, the parts are the whole. A gap means some of the need came
  // in the other unit, and saying so beats a column that does not add up.
  const other = row.need - listed;

  return (
    <aside className="sticky top-[calc(var(--app-bar-height)+var(--page-shell-height,0px)+0.75rem)] z-30 flex max-h-[calc(100dvh-var(--app-bar-height)-var(--page-shell-height,0px)-1.5rem)] w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-sm bg-card p-3 ring-1 ring-primary/30 print:hidden">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.625rem] text-muted-foreground">
            {row.itemCode}
          </p>
          <h2 className="text-sm leading-snug font-semibold">{row.name}</h2>
          <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
            {row.department ?? "No department"}
            {row.type && ` · ${row.type}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <section className="rounded-sm bg-brand-muted px-3 py-2 ring-1 ring-primary/20">
        <p className="text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
          From recipes
        </p>
        <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-zinc-950 dark:text-white">
          {fmt(row.need, 1)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {row.unit}
          </span>
        </p>
        <p className="text-[0.6875rem] text-muted-foreground">
          {sources.length === 0
            ? "Nothing on these dates asks for it."
            : `${sources.length} ${sources.length === 1 ? "recipe" : "recipes"}${extraPct ? `, ${extraPct}% extra included` : ""}`}
        </p>
      </section>

      <section>
        <p className="text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
          Asked for by
        </p>
        {sources.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            No recipe on these dates lists this material. It is on the sheet
            because it belongs to this place, not because the plan calls for it.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col">
            {sources.map((source) => {
              const share = row.need > 0 ? source.quantity / row.need : 0;
              return (
                <li
                  key={source.recipeId}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <Link
                    href={`/recipes/${source.recipeId}?back=${encodeURIComponent(backHref)}`}
                    className="group flex flex-col gap-0.5 rounded-sm px-1 py-1.5 transition-colors hover:bg-brand-muted"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium group-hover:underline">
                        {source.name}
                      </span>
                      <span className="shrink-0 text-[0.8125rem] font-bold tabular-nums">
                        {fmt(source.quantity, 1)}
                        <span className="ml-0.5 text-[0.625rem] font-normal text-muted-foreground">
                          {row.unit}
                        </span>
                      </span>
                      <ArrowUpRight className="size-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[0.625rem] text-muted-foreground">
                        {source.wipCode}
                      </span>
                      {/* What the line calls it, when that is not the material's
                          own name - which is how a recipe ends up looking like
                          it has nothing to do with the row you clicked. */}
                      <span className="min-w-0 flex-1 truncate text-[0.625rem] text-muted-foreground">
                        {source.ingredientNames.join(", ")}
                      </span>
                      <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
                        {Math.round(share * 100)}%
                      </span>
                    </span>
                    {/* The share as a bar: which recipe is most of this number
                        is the thing you are looking for, and a row of digits
                        does not answer it at a glance. */}
                    <span className="block h-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(share * 100, 1.5)}%` }}
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {Math.abs(other) > 0.05 && (
          <p className="mt-1.5 text-[0.625rem] text-muted-foreground">
            {fmt(Math.abs(other), 1)} {row.unit} more is asked for in the other
            unit and is not listed here.
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Fact
          label="To pick"
          value={row.toPick === null ? "—" : `${fmt(row.toPick, 0)} cs`}
          strong
        />
        <Fact
          label="Pack size"
          value={
            row.packSize === null
              ? "not set"
              : `${fmt(row.packSize, 2)} ${(row.packUom ?? (row.unit === "lb" ? "lbs" : "unit")).toLowerCase()}`
          }
        />
      </section>
    </aside>
  );
}

function Fact({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span className="flex flex-col">
      <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span className={cn("tabular-nums", strong && "font-bold")}>{value}</span>
    </span>
  );
}
