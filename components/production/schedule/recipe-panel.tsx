"use client";

import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import type { ScheduleRecipe } from "@/lib/production/schedule/fetch";
import type { RecipeDemand } from "@/lib/production/schedule/model";
import { describeWindow, type TimingWindow } from "@/lib/production/schedule/model";
import { FinishedStar } from "@/components/recipes/finished-star";
import { cn } from "@/lib/utils";

/**
 * What a step is, opened beside the grid.
 *
 * Clicking a row in a 199-line grid should answer "what is this and why is it
 * here" without losing your place, so this sits alongside rather than
 * navigating away. Everything on it is a question someone actually asks
 * mid-plan: what goes in it, what it feeds, when it can be made, and what is
 * already scheduled.
 */
export function RecipePanel({
  recipe,
  window,
  demand,
  scheduled,
  rangeFrom,
  rangeTo,
  backHref,
  ingredients,
  usedIn,
  onClose,
}: {
  recipe: ScheduleRecipe;
  window: TimingWindow | undefined;
  demand: RecipeDemand | undefined;
  scheduled: { date: string; quantity: number }[];
  rangeFrom: string;
  rangeTo: string;
  /** Where the recipe page should send you back to, filters and all. */
  backHref: string;
  ingredients: { name: string; quantity: number; uom: string | null }[];
  usedIn: { id: string; name: string; quantity: number }[];
  onClose: () => void;
}) {
  const uom = (recipe.uom ?? "LB").toLowerCase();

  // The panel answers questions about the dates on screen. Showing every date
  // the recipe has ever carried would turn a short list into an endless one
  // as the plan fills out, and none of it lines up with the grid behind it.
  const needed = (demand?.days ?? []).filter(
    (day) => day.date >= rangeFrom && day.date <= rangeTo
  );

  return (
    // Sticky, and above the grid's own frozen bits: the date headers sit at
    // z-40, so a plain, unpositioned aside rendered behind them - its own
    // top clipped under the header row, and clicks in its blank space falling
    // through to whatever grid cell happened to be underneath.
    <aside
      className="sticky top-[calc(var(--app-bar-height)+var(--page-shell-height,0px)+2.75rem)] z-50 flex max-h-[calc(100dvh-var(--app-bar-height)-var(--page-shell-height,0px)-3.5rem)] w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-md bg-card p-3 shadow-lg ring-1 ring-foreground/10"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.625rem] text-muted-foreground">
            {recipe.wipCode}
          </p>
          {/* The name is where people aim first, so it is a link too. */}
          <h2 className="flex items-start gap-1.5 text-sm leading-snug font-semibold">
            {recipe.isFinished && <FinishedStar className="mt-0.5 size-3" />}
            <Link
              href={`/recipes/${recipe.id}?back=${encodeURIComponent(backHref)}`}
              className={cn(
                "hover:underline",
                recipe.isFinished && "text-primary"
              )}
            >
              {recipe.name}
            </Link>
          </h2>
          <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
            {recipe.department ?? "No department"}
            {recipe.lineName && ` · ${recipe.lineName}`}
          </p>
        </div>
        {/* Up here, not pinned to the bottom of a panel that scrolls: on a
            recipe with ten ingredients and eight parents the button was below
            the fold, which is the same as not having one. */}
        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            href={`/recipes/${recipe.id}?back=${encodeURIComponent(backHref)}`}
            title="Open the recipe"
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[0.6875rem] font-medium text-primary-foreground hover:opacity-90"
          >
            Open recipe
            <ArrowUpRight className="size-3" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      {recipe.allergens.length > 0 && (
        <p className="rounded bg-warning-muted px-2 py-1 text-[0.625rem] font-medium text-warning-foreground">
          {recipe.allergens.join(" · ")}
        </p>
      )}

      <Section label="When it can be made">
        <p className="text-xs">{describeWindow(window)}</p>
        {window?.earliestOffset != null && (
          <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
            Keeps {Math.abs(window.earliestOffset)}{" "}
            {Math.abs(window.earliestOffset) === 1 ? "day" : "days"}
          </p>
        )}
      </Section>

      <Section label="Scheduled" note={`${monthDay(rangeFrom)}–${monthDay(rangeTo)}`}>
        {scheduled.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing planned in this range.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {scheduled.map((row) => (
              <li key={row.date} className="flex justify-between text-xs">
                <span className="tabular-nums text-muted-foreground">
                  {monthDay(row.date)}
                </span>
                <span className="font-semibold tabular-nums">
                  {Math.round(row.quantity).toLocaleString()} {uom}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Needed" note={`${monthDay(rangeFrom)}–${monthDay(rangeTo)}`}>
        {needed.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing in this range calls for this.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {needed.slice(0, 8).map((day) => (
              <li key={day.date}>
                <span className="flex justify-between text-xs">
                  <span className="tabular-nums text-muted-foreground">
                    {monthDay(day.date)}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {Math.round(day.quantity).toLocaleString()} {uom}
                  </span>
                </span>
                <span className="block truncate text-[0.5625rem] text-muted-foreground">
                  for {day.drivers.map((d) => d.name).slice(0, 2).join(", ")}
                  {day.drivers.length > 2 && ` +${day.drivers.length - 2}`}
                </span>
              </li>
            ))}
            {needed.length > 8 && (
              <li className="text-[0.625rem] text-muted-foreground">
                and {needed.length - 8} more days
              </li>
            )}
          </ul>
        )}
      </Section>

      <Section label={`Made from (${ingredients.length})`}>
        {ingredients.length === 0 ? (
          <p className="text-xs text-muted-foreground">No ingredients.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {ingredients.slice(0, 12).map((line, i) => (
              <li key={i} className="flex justify-between gap-2 text-[0.6875rem]">
                <span className="min-w-0 truncate">{line.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {line.quantity} {line.uom?.toLowerCase() ?? ""}
                </span>
              </li>
            ))}
            {ingredients.length > 12 && (
              <li className="text-[0.625rem] text-muted-foreground">
                and {ingredients.length - 12} more
              </li>
            )}
          </ul>
        )}
      </Section>

      {usedIn.length > 0 && (
        <Section label={`Goes into (${usedIn.length})`}>
          <ul className="flex flex-col gap-0.5">
            {usedIn.slice(0, 8).map((parent) => (
              <li
                key={parent.id}
                className="flex justify-between gap-2 text-[0.6875rem]"
              >
                <span className="min-w-0 truncate">{parent.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {parent.quantity}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

    </aside>
  );
}

/** 2026-09-06 as 09/06, matching the column headers in the grid. */
function monthDay(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

function Section({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-0.5 flex items-baseline justify-between gap-2 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        <span>{label}</span>
        {note && (
          <span className="font-normal tracking-normal tabular-nums opacity-70">
            {note}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}
