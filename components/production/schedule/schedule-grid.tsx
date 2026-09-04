"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CellAllocation, RecipeDemand } from "@/lib/production/schedule/model";
import type { ScheduleRecipe } from "@/lib/production/schedule/fetch";
import { saveScheduleCell } from "@/lib/production/schedule/actions";
import { cn } from "@/lib/utils";

/**
 * The planning grid.
 *
 * A finished product is a row you can open. Closed, the page is thirty-two
 * lines - the things you actually type into. Opened, a bowl shows the tree
 * beneath it, and opening a step inside that shows its own. Nobody is made to
 * scroll past 199 rows to reach the one they want, and nobody is stopped from
 * seeing all of them either.
 *
 * Density is deliberate but not punishing: rows are one line, dates are two,
 * and colour carries what a label used to - amber where a day is short of
 * what the tree needs, red where it falls outside the recipe's window.
 */

export type GridCell = {
  quantity: number | null;
  allocation: CellAllocation | null;
  isDraftChange?: boolean;
};

export type GridRow = {
  recipe: ScheduleRecipe;
  /** True when the tree asked for something in the range being looked at. */
  wasNeeded: boolean;
  /** Planned, but on days the window does not allow, so it does not count. */
  rejectedQuantity: number;
  rejectedReason: string | null;
  /** What is planned inside the range being looked at. */
  scheduledInRange: number;
  /** Counted stock, as of the WIP date. Null means never counted. */
  wipOnHand: number | null;
  wipNote: string | null;
  /** How much of that stock is covering the plan. */
  stockUsed: number;
  /** Stock that reaches nothing - almost always past its date. */
  stockStranded: number;
  stockReason: string | null;
  /** Unique per position: the same recipe appears under every bowl using it. */
  path: string;
  parentPath: string | null;
  depth: number;
  perRoot: number | null;
  /** The finished product this row hangs under. */
  rootName: string | null;
  hasChildren: boolean;
  cells: Map<string, GridCell>;
  suggestions: Map<string, number>;
  demand: RecipeDemand | undefined;
  /** Per demand date, how much of it nothing covers. See allocateRecipe. */
  unmet: Map<string, number>;
  openBalance: number;
  /** Overrun in range - what the row is making beyond what is needed. */
  surplusInRange: number;
  neededTotal: number;
  scheduledTotal: number;
  /**
   * Something under this recipe still has a grey number waiting to be
   * taken — another department has not been planned yet.
   */
  missingDownstream: boolean;
};

export type DepartmentStyle = {
  unit: "lb" | "ea" | "cs";
  spine: string;
  tint: string;
};

type Props = {
  scheduleId: string;
  readOnly?: boolean;
  /**
   * Nothing can be typed at all.
   *
   * Different from readOnly, which means "there is nowhere to save this yet,
   * so hold it in memory" - the workbook preview before the migration ran.
   * Folding the two together meant the confirmed plan accepted typing and
   * showed the result, which looked exactly like editing it.
   */
  locked?: boolean;
  onLocalChange?: (recipeId: string, date: string, quantity: number | null) => void;
  today: string;
  dates: string[];
  rows: GridRow[];
  styles: Map<string, DepartmentStyle>;
  expanded: Set<string>;
  onToggle: (recipeId: string) => void;
  onSelectionChange?: (range: { from: string; to: string } | null) => void;
  onInspect?: (recipeId: string) => void;
  inspectedId?: string | null;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** 08/31, padded, month first. */
function shortDate(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

function fmt(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 100) return String(Math.round(value));
  return String(Number(value.toFixed(1)));
}

export function ScheduleGrid({
  scheduleId,
  readOnly = false,
  locked = false,
  onLocalChange,
  today,
  dates,
  rows,
  styles,
  expanded,
  onToggle,
  onSelectionChange,
  onInspect,
  inspectedId,
}: Props) {
  const [anchor, setAnchor] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const totals = useMemo(() => {
    const byDept = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const dept = row.recipe.department ?? "Unassigned";
      const perDate = byDept.get(dept) ?? new Map<string, number>();
      for (const [date, cell] of row.cells) {
        perDate.set(date, (perDate.get(date) ?? 0) + (cell.quantity ?? 0));
      }
      byDept.set(dept, perDate);
    }
    return byDept;
  }, [rows]);

  function pickDate(date: string, extend: boolean) {
    let next: { from: string; to: string } | null;
    if (extend && anchor) {
      next = anchor <= date ? { from: anchor, to: date } : { from: date, to: anchor };
    } else if (range && range.from === date && range.to === date) {
      next = null;
      setAnchor(null);
    } else {
      next = { from: date, to: date };
      setAnchor(date);
    }
    setRange(next);
    onSelectionChange?.(next);
  }

  const inRange = (date: string) =>
    range !== null && date >= range.from && date <= range.to;

  const LEAD = 7; // item, recipe, dept, allergen, wip, open, u/m

  return (
    <div className="rounded-md ring-1 ring-foreground/10">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <Th sticky className="left-0 z-40 w-[4.5rem] min-w-[4.5rem]">
              Item
            </Th>
            <Th sticky className="left-[4.5rem] z-40 w-[13rem] min-w-[13rem]">
              Recipe
            </Th>
            <Th className="w-[7rem] min-w-[7rem]">Dept</Th>
            <Th className="w-[5.5rem] min-w-[5.5rem]">Allergen</Th>
            {/* What is already in the cooler. Planning a run without it is
                how you make 500 lb of something you already have 300 of. */}
            <Th numeric className="w-[3.75rem] min-w-[3.75rem]">
              WIP
            </Th>
            <Th numeric className="w-[3.75rem] min-w-[3.75rem]">
              Open
            </Th>
            <Th className="w-[2.5rem] min-w-[2.5rem] text-center">U/M</Th>

            {dates.map((date) => {
              const wd = dayOf(date);
              const weekend = wd === 0 || wd === 6;
              return (
                <th
                  key={date}
                  scope="col"
                  onClick={(e) => pickDate(date, e.shiftKey)}
                  title="Click to select · shift-click for a range"
                  className={cn(
                    "sticky top-[calc(var(--app-bar-height)+var(--page-shell-height,0px)+var(--schedule-bar-height,0px))] z-30 w-[4rem] min-w-[4rem] cursor-pointer border-b px-0.5 py-1 text-center leading-tight select-none",
                    // Only Mondays keep a divider; every column having one
                    // turned a fortnight into a wall of lines.
                    wd === 1 ? "border-l border-l-border" : "border-l border-l-border/30",
                    date === today && "border-b-2 border-b-primary",
                    inRange(date)
                      ? "bg-primary/20"
                      : date === today
                        ? "bg-brand-muted"
                        : weekend
                          ? "bg-muted"
                          : "bg-card"
                  )}
                >
                  <span
                    className={cn(
                      "block text-[0.5625rem] font-semibold tracking-wide uppercase",
                      date === today ? "text-primary" : "text-muted-foreground/70"
                    )}
                  >
                    {WEEKDAY[wd]}
                  </span>
                  <span
                    className={cn(
                      "block text-[0.8125rem] font-bold tabular-nums",
                      date === today ? "text-primary" : "text-foreground"
                    )}
                  >
                    {shortDate(date)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        {/*
          Day totals per department, at the top where they are read.

          Each in the unit that department counts in - a day is not "4,300"
          of anything when it is stew, bowls and cases at once. They sit under
          the dates rather than at the foot of two hundred rows, because the
          question they answer ("can the kitchen take this?") is asked while
          typing, not after scrolling to the end.
        */}
        <tbody>
          {[...totals.entries()]
            .filter(([, perDate]) => [...perDate.values()].some((v) => v > 0))
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([dept, perDate], index) => {
              const style = styles.get(dept) ?? {
                unit: "lb" as const,
                spine: "bg-muted-foreground/30",
                tint: "bg-muted",
              };
              return (
                <tr key={dept}>
                  <th
                    scope="row"
                    colSpan={LEAD}
                    className={cn(
                      "sticky left-0 z-20 border-l border-border px-2 py-0.5 text-right",
                      index === 0 && "border-t-2 border-t-brand/40",
                      style.tint
                    )}
                  >
                    <span className="flex items-center justify-end gap-1.5">
                      <span
                        className={cn("h-3 w-1 rounded-[1px]", style.spine)}
                      />
                      <span className="text-[0.625rem] font-bold tracking-wide uppercase">
                        {dept}
                      </span>
                      <span className="text-[0.5625rem] text-muted-foreground">
                        {style.unit}
                      </span>
                    </span>
                  </th>
                  {dates.map((date) => {
                    const total = perDate.get(date) ?? 0;
                    return (
                      <td
                        key={date}
                        className={cn(
                          "border-l border-border px-1 text-center text-[0.6875rem] font-bold tabular-nums",
                          index === 0 && "border-t-2 border-t-brand/40",
                          style.tint,
                          inRange(date) && "bg-primary/15"
                        )}
                      >
                        {total > 0 ? fmt(total) : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
        </tbody>


        <tbody>
          {rows.map((row) => (
            <Row
              key={row.path}
              scheduleId={scheduleId}
              readOnly={readOnly}
              locked={locked}
              onLocalChange={onLocalChange}
              dates={dates}
              row={row}
              style={
                styles.get(row.recipe.department ?? "Unassigned") ?? {
                  unit: "lb" as const,
                  spine: "bg-muted-foreground/30",
                  tint: "bg-muted",
                }
              }
              inRange={inRange}
              today={today}
              isExpanded={expanded.has(row.path)}
              onToggle={onToggle}
              onInspect={onInspect}
              inspected={inspectedId === row.recipe.id}
            />
          ))}
        </tbody>

        {rows.length === 0 && (
          <tbody>
            <tr>
              <td
                colSpan={dates.length + LEAD}
                className="px-3 py-10 text-center text-sm text-muted-foreground"
              >
                Nothing here. Try another department, or turn off the filters.
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}

function Th({
  children,
  numeric,
  sticky,
  className,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "sticky top-[calc(var(--app-bar-height)+var(--page-shell-height,0px)+var(--schedule-bar-height,0px))] z-30 border-b border-border bg-brand-muted px-2 py-1.5 text-[0.5625rem] font-semibold tracking-wider text-primary uppercase",
        numeric ? "text-right" : "text-left",
        sticky && "z-40",
        !sticky && "border-l",
        className
      )}
    >
      {children}
    </th>
  );
}

function Row({
  scheduleId,
  readOnly,
  locked,
  onLocalChange,
  dates,
  row,
  style,
  inRange,
  today,
  isExpanded,
  onToggle,
  onInspect,
  inspected,
}: {
  scheduleId: string;
  readOnly?: boolean;
  locked?: boolean;
  onLocalChange?: (recipeId: string, date: string, quantity: number | null) => void;
  dates: string[];
  row: GridRow;
  style: DepartmentStyle;
  inRange: (date: string) => boolean;
  today: string;
  isExpanded: boolean;
  onToggle: (recipeId: string) => void;
  onInspect?: (recipeId: string) => void;
  inspected: boolean;
}) {
  const finished = row.recipe.isFinished;
  const openParent = isExpanded && row.hasChildren;
  const freezeBg = inspected
    ? "bg-primary/15"
    : openParent
      ? "bg-muted/80"
      : "bg-background group-even:bg-muted/25";

  return (
    <tr
      className={cn(
        "group hover:bg-accent/25",
        inspected && "bg-primary/10",
        openParent && !inspected && "bg-muted/50"
      )}
    >
      <td
        className={cn(
          "sticky left-0 z-10 border-b border-border/60 px-2 py-0.5 text-left font-mono text-[0.625rem] text-muted-foreground",
          freezeBg
        )}
      >
        {row.recipe.wipCode}
      </td>

      <th
        scope="row"
        className={cn(
          "sticky left-[4.5rem] z-10 border-b border-border/60 px-2 py-0.5 text-left font-normal",
          freezeBg
        )}
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className={cn("h-3.5 w-0.5 shrink-0 rounded-[1px]", style.spine)} />

          <span
            className="flex min-w-0 items-center gap-1"
            style={{ paddingInlineStart: `${Math.min(row.depth, 5) * 0.6}rem` }}
          >
            {row.hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(row.path)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Collapse" : "Expand"}
                className="shrink-0 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {isExpanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </button>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}

            <button
              type="button"
              onClick={() => onInspect?.(row.recipe.id)}
              title={`${row.recipe.wipCode} — ${row.recipe.name}`}
              className={cn(
                "min-w-0 truncate text-left text-[0.8125rem] hover:underline",
                finished
                  ? "font-semibold text-primary"
                  : row.depth > 1
                    ? "text-muted-foreground"
                    : "text-foreground"
              )}
            >
              {row.recipe.name}
            </button>
            {row.missingDownstream && (
              <span
                title="Other departments still need their numbers for this plan"
                aria-label="Other departments still need numbers"
                className="size-1.5 shrink-0 rounded-full bg-destructive"
              />
            )}
          </span>
        </span>
      </th>

      <td className="border-b border-border/60 border-l border-l-border/40 px-2 py-0.5 text-[0.6875rem]">
        <span
          className="flex items-center gap-1.5 truncate"
          title={row.rootName ? `For ${row.rootName}` : undefined}
        >
          <span className={cn("size-1.5 shrink-0 rounded-[1px]", style.spine)} />
          <span
            className="truncate text-muted-foreground"
            title={row.recipe.department ?? undefined}
          >
            {(row.recipe.department ?? "—").replace(/^MAIN KITCHEN /, "MK ")}
          </span>
        </span>
      </td>

      <td className="border-b border-border/60 border-l border-l-border/40 px-2 py-0.5 text-[0.625rem] text-muted-foreground">
        <span className="block truncate">
          {row.recipe.allergens.length > 0
            ? row.recipe.allergens.join(", ")
            : "—"}
        </span>
      </td>

      <td
        title={
          row.wipOnHand === null
            ? "Never counted"
            : (row.wipNote ?? `${fmt(row.wipOnHand)} ${style.unit} on hand`)
        }
        className={cn(
          "border-b border-border/60 border-l border-l-border/40 px-2 py-0.5 text-right text-[0.6875rem] tabular-nums",
          row.wipOnHand === null
            ? "text-muted-foreground/30"
            : row.stockStranded > 0.01
              ? // Stock that exists but reaches nothing. Amber, not green:
                // it is not helping, and somebody has to decide about it.
                "bg-warning-muted/60 font-semibold text-warning-foreground"
              : row.stockUsed > 0.01
                ? "bg-success/10 font-semibold text-success"
                : "text-muted-foreground/50"
        )}
      >
        <span className="flex items-center justify-end gap-1">
          {row.wipOnHand === null ? "" : fmt(row.wipOnHand)}
          {row.stockStranded > 0.01 && (
            <span
              title={
                row.stockReason
                  ? `${fmt(row.stockStranded)} ${style.unit} reaches nothing — ${row.stockReason}`
                  : `${fmt(row.stockStranded)} ${style.unit} on hand that nothing needs`
              }
              className="inline-flex size-3.5 shrink-0 cursor-help items-center justify-center rounded-[1px] bg-warning-foreground text-[0.5625rem] font-bold text-white"
            >
              ?
            </span>
          )}
        </span>
      </td>

      {/* Open only closes on production that can actually be used: a run
          placed outside the window will be past its best by the day it is
          needed, so it never counts toward the gap. */}
      <td
        className={cn(
          "border-b border-border/60 border-l border-l-border/40 px-2 py-0.5 text-right text-[0.6875rem] font-semibold tabular-nums",
          row.openBalance > 0.01
            ? "bg-destructive/12 text-destructive"
            : row.wasNeeded
              ? "text-success"
              : "text-muted-foreground/40"
        )}
      >
        {(() => {
          // fmt rounds to one decimal, so a surplus under 0.05 reads as "0" -
          // showing "+0" would say "over" about a row that, to a glance, is
          // exactly covered.
          const surplusLabel = fmt(row.surplusInRange);
          const showSurplus =
            row.openBalance <= 0.01 &&
            row.surplusInRange > 0.01 &&
            surplusLabel !== "0";
          return (
            <span
              className="flex items-center justify-end gap-1"
              title={
                showSurplus
                  ? `Covered, with ${surplusLabel} ${style.unit} over what is needed`
                  : undefined
              }
            >
              {row.openBalance > 0.01
                ? fmt(row.openBalance)
                : showSurplus
                  ? `+${surplusLabel}`
                  : row.wasNeeded
                    ? "0"
                    : ""}

          {/* The mark appears only where the number is surprising: work has
              been planned, and Open still will not close because the day it
              was planned on cannot be used. A row nobody has planned yet is
              not a problem to explain - the number already says it. */}
          {row.openBalance > 0.01 &&
            (row.rejectedQuantity > 0.01 || row.stockStranded > 0.01) && (
            <span
              title={
                row.rejectedQuantity > 0.01
                  ? `${fmt(row.rejectedQuantity)} ${style.unit} planned outside the window — ${row.rejectedReason ?? "it cannot cover this"}`
                  : `${fmt(row.stockStranded)} ${style.unit} is on hand but reaches nothing${row.stockReason ? ` — ${row.stockReason}` : ""}, so it does not close this gap`
              }
              className="inline-flex size-3.5 shrink-0 cursor-help items-center justify-center rounded-[1px] bg-destructive text-[0.5625rem] font-bold text-white"
            >
              ?
            </span>
          )}
            </span>
          );
        })()}
      </td>

      <td className="border-b border-border/60 border-l border-l-border/40 border-r-2 border-r-border px-1 py-0.5 text-center text-[0.5625rem] uppercase text-muted-foreground">
        {style.unit}
      </td>

      {dates.map((date) => (
        <Cell
          key={date}
          scheduleId={scheduleId}
          recipeId={row.recipe.id}
          date={date}
          cell={row.cells.get(date)}
          readOnly={readOnly}
          locked={locked}
          onLocalChange={onLocalChange}
          needed={
            // What this day is on the hook for. A run made early carries the
            // number of the day it is covering, so entering rice on the 5th
            // for a need on the 6th settles both cells instead of leaving one
            // asking and the other unexplained.
            (row.cells.get(date)?.allocation?.served ?? 0) +
            (row.unmet.get(date) ?? 0)
          }
          anyOpen={row.openBalance > 0.01}
          // A finished product is where the plan starts. The date typed
          // against it IS the ship day, so there is no upstream demand to be
          // early for and nothing above it that could have asked for less.
          // Marking those cells would put a "?" on almost every number.
          isSource={row.recipe.isFinished || row.depth === 0}
          suggested={row.suggestions.get(date) ?? 0}
          highlighted={inRange(date)}
          isToday={date === today}
          weekStart={dayOf(date) === 1}
          unit={style.unit}
        />
      ))}
    </tr>
  );
}

function Cell({
  scheduleId,
  recipeId,
  date,
  cell,
  readOnly,
  locked,
  onLocalChange,
  needed,
  anyOpen,
  isSource,
  suggested,
  highlighted,
  isToday,
  weekStart,
  unit,
}: {
  scheduleId: string;
  recipeId: string;
  date: string;
  cell: GridCell | undefined;
  readOnly?: boolean;
  locked?: boolean;
  onLocalChange?: (recipeId: string, date: string, quantity: number | null) => void;
  needed: number;
  /** Whether this recipe still has demand nothing covers, anywhere in range. */
  anyOpen: boolean;
  /** A row the plan starts from, rather than one the tree drives. */
  isSource: boolean;
  suggested: number;
  highlighted: boolean;
  isToday: boolean;
  /** Monday, so the week gets a divider and a fortnight stays readable. */
  weekStart: boolean;
  unit: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tookSuggest, setTookSuggest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initial =
    cell?.quantity != null && cell.quantity > 0 ? String(cell.quantity) : "";
  const lastSaved = useRef<string>(initial);

  /*
    The input is uncontrolled so typing is not fighting a prop. Accept, a
    refresh, or another cell's save still have to land the new number in the
    box — defaultValue is ignored after mount, which is why Accept kept
    looking like it did nothing.
  */
  useEffect(() => {
    const next =
      cell?.quantity != null && cell.quantity > 0 ? String(cell.quantity) : "";
    lastSaved.current = next;
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    if (input.value !== next) input.value = next;
  }, [cell?.quantity]);

  const verdict = cell?.allocation?.verdict ?? "unknown";
  const has = (cell?.quantity ?? 0) > 0 || tookSuggest;
  const suggest = !has && suggested > 0.0001;

  /**
   * Red means the day does not match the plan, in one of three ways:
   *
   *   1. less is planned than the tree needs
   *   2. the day falls outside the recipe's timing window
   *   3. more is planned than anything needs
   *
   * A cell that covers what it should is plain. Colour that appears for any
   * other reason teaches people to stop reading it.
   */
  const outside =
    !isSource && (verdict === "too-early" || verdict === "too-late");
  const short = needed > 0.01 && (cell?.quantity ?? 0) < needed - 0.01;

  const surplus = isSource ? 0 : (cell?.allocation?.surplus ?? 0);
  /**
   * Rounding up a batch on a day that is already doing the right work is
   * normal, so it is worth a note and nothing more. A number on a day that is
   * covering nothing at all is the mistake - 50 lb keyed against a date
   * nothing asked for.
   */
  const overrun = surplus > 0.01 && (cell?.allocation?.served ?? 0) > 0.01;
  const stray = surplus > 0.01 && !overrun;
  const serving = cell?.allocation?.primaryDate;
  const wrong = short || outside || stray;

  /**
   * The two reds a number cannot explain on its own. Short already shows the
   * target it is falling behind, so it needs no mark; extra and out-of-window
   * both look like a perfectly good number until you know what is wrong.
   */
  const problem =
    outside && anyOpen
      ? (cell?.allocation?.explanation ?? "Outside this recipe's timing window")
      : stray
        ? `${fmt(surplus)} ${unit} on a day nothing needs it`
        : outside
          ? (cell?.allocation?.explanation ??
            "Outside this recipe's timing window")
          : overrun
            ? `${fmt(surplus)} ${unit} more than needed — fine, just over`
            : null;

  function commit(raw: string) {
    const trimmed = raw.trim();
    const quantity = trimmed === "" ? null : Number(trimmed);
    if (quantity !== null && !Number.isFinite(quantity)) {
      setError("Not a number");
      return;
    }

    /*
      0 and empty both mean "nothing planned" everywhere else - the merge
      with the server drops a 0 entry the same as a missing one, so the box
      has to show the same thing for both. Without normalising here, typing
      "0" writes a quantity the rest of the app treats as no entry at all,
      but cell?.quantity goes from undefined to undefined - nothing for the
      sync effect above to react to - so the literal "0" just sits in the
      box forever. Even Clear day/Clear range can't reach it afterward: from
      the app's side there was never a change to notice.
    */
    const cleared = quantity === null || quantity === 0;
    const displayed = cleared ? "" : trimmed;
    if (displayed === lastSaved.current) return;
    if (cleared) setTookSuggest(false);
    setError(null);

    // The plan is not open for editing, so nothing is written and nothing is
    // remembered - the number in the box goes back to what it was.
    if (locked) return;

    onLocalChange?.(recipeId, date, quantity);
    if (cleared && inputRef.current) inputRef.current.value = "";

    if (readOnly) {
      lastSaved.current = displayed;
      return;
    }

    startTransition(async () => {
      const result = await saveScheduleCell({
        scheduleId,
        recipeId,
        productionDate: date,
        quantity,
      });
      if (result.ok) lastSaved.current = displayed;
      else {
        setTookSuggest(false);
        setError(result.message);
      }
    });
  }

  /** Put the grey number into the cell and save it. Click, Tab, or Accept. */
  function takeSuggestion() {
    const input = inputRef.current;
    if (!input || locked) return;
    // Ceil, not round: a need of 0.2 lb rounding down to 0 would write
    // nothing, the suggestion would never clear, and the cell would stay
    // short forever no matter how many times Accept is clicked.
    const value = String(Math.ceil(suggested));
    input.value = value;
    setTookSuggest(true);
    commit(value);
  }

  /**
   * Moves to the neighbouring cell, the way Excel's arrow keys do - up and
   * down the same date column, left and right along the same row. Blurring
   * the input on the way out commits it, same as Tab does.
   */
  function moveFocus(direction: "up" | "down" | "left" | "right") {
    const input = inputRef.current;
    const td = input?.closest("td");
    const tr = td?.closest("tr");
    if (!input || !td || !tr) return;

    let targetCell: Element | null | undefined;
    if (direction === "left") targetCell = td.previousElementSibling;
    else if (direction === "right") targetCell = td.nextElementSibling;
    else {
      const cellIndex = Array.prototype.indexOf.call(tr.children, td);
      const targetRow =
        direction === "up" ? tr.previousElementSibling : tr.nextElementSibling;
      targetCell = targetRow?.children[cellIndex];
    }

    targetCell?.querySelector<HTMLInputElement>("input")?.focus();
  }

  return (
    <td
      title={
        error ??
        problem ??
        (needed > 0.01
          ? serving && serving !== date
            ? `Covers ${fmt(needed)} ${unit} needed ${serving.slice(5, 7)}/${serving.slice(8, 10)}`
            : `Needs ${fmt(needed)} ${unit}${suggest ? " — click to take it" : ""}`
          : undefined)
      }
      className={cn(
        "border-b border-border/60 p-0",
        weekStart ? "border-l border-l-border" : "border-l border-l-border/25",
        wrong
          ? "bg-destructive/12"
          : highlighted
            ? "bg-primary/10"
            : isToday
              ? "bg-brand-muted/30"
              : undefined,
        cell?.isDraftChange && "ring-1 ring-inset ring-warning-foreground/50"
      )}
    >
      <span className="relative flex items-center">
        {/* What the tree needs, tucked left and faint. It used to sit in the
            placeholder - right-aligned, exactly where the typed number goes -
            which read as a value rather than a target. */}
        {/* Grey until taken. Click anywhere in the cell — the overlay does
            not steal the click; focus on the input is what fills it. */}
        {suggest && !problem && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-1.5 text-[0.6875rem] text-primary/45 tabular-nums"
          >
            {fmt(suggested)}
          </span>
        )}

        {problem ? (
          <span
            title={problem}
            className={cn(
              "absolute left-0.5 inline-flex size-3 cursor-help items-center justify-center rounded-[1px] text-[0.5rem] leading-none font-bold text-white",
              overrun ? "bg-success" : "bg-destructive"
            )}
          >
            ?
          </span>
        ) : (
          needed > 0.01 &&
          !suggest &&
          !has && (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute left-1 text-[0.5625rem] leading-none tabular-nums",
                short ? "text-destructive/70" : "text-muted-foreground/40"
              )}
            >
              {fmt(needed)}
            </span>
          )
        )}

        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          defaultValue={initial}
          aria-label={date}
          readOnly={locked}
          onFocus={(e) => {
            if (locked || !suggest || e.currentTarget.value !== "") return;
            takeSuggestion();
            e.currentTarget.select();
          }}
          onBlur={(e) => {
            if (locked) {
              e.target.value = lastSaved.current;
              return;
            }
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Tab" && suggest && e.currentTarget.value === "") {
              takeSuggestion();
            }
            if (e.key === "Escape") {
              e.currentTarget.value = lastSaved.current;
              e.currentTarget.blur();
            }
            // Excel clears the whole cell on Delete regardless of where the
            // caret sits or what is selected - it is not "delete one digit".
            if (e.key === "Delete") {
              e.preventDefault();
              e.currentTarget.value = "";
              commit("");
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              moveFocus("up");
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              moveFocus("down");
            }
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              moveFocus("left");
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              moveFocus("right");
            }
          }}
          className={cn(
            "h-6 w-full min-w-0 border-0 bg-transparent py-0 pr-1.5 pl-7 text-right text-[0.8125rem] tabular-nums",
            locked
              ? "cursor-default focus:outline-none"
              : "focus:relative focus:z-10 focus:bg-card focus:ring-1 focus:ring-primary focus:outline-none",
            pending && "opacity-40",
            has
              ? wrong
                ? "font-bold text-destructive"
                : "font-semibold text-foreground"
              : "font-normal"
          )}
        />
      </span>
    </td>
  );
}
