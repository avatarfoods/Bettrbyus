/**
 * Schedule arithmetic.
 *
 * Carlos schedules from the finished product down: he types how many cases of
 * a bowl go out on a day, and everything underneath follows from the recipe
 * tree. This module turns those typed numbers into the three things the grid
 * has to show him -
 *
 *   what each subrecipe is needed for, and on which day
 *   whether the day he chose to produce it is inside its timing window
 *   how much of the demand he has not scheduled yet
 *
 * Nothing here is stored. A needed-by date written into the database would go
 * stale the moment a formula changed, and stale dates on a production floor
 * are worse than no dates.
 */

import {
  isFinishedProduct,
  linePerOutputUnit,
} from "@/lib/production/wip-explode";
import type { WipRecipe, WipRecipeLine } from "@/lib/production/wip-explode";

export type ScheduleEntry = {
  recipeId: string;
  /** ISO date, yyyy-mm-dd. */
  productionDate: string;
  quantity: number;
};

/**
 * When a step may run, as negative offsets from the day its finished product
 * ships. -5 -> -2 means "no earlier than five days before, ready by two days
 * before". Zero is same-day. Null on either side means no limit that way.
 */
export type TimingWindow = {
  /** Furthest ahead it may be made. -5 = five days before. */
  earliestOffset: number | null;
  /** Closest to the ship day it may be left. 0 = the day itself. */
  latestOffset: number | null;
};

/**
 * How long it keeps, in days.
 *
 * Not stored: something that may be made five days ahead is something that
 * keeps five days, so the earliest offset already says it. A second field
 * would only give the two a way to disagree.
 */
export function shelfLifeDays(window: TimingWindow | undefined): number | null {
  if (!window || window.earliestOffset === null) return null;
  return Math.abs(window.earliestOffset);
}

/**
 * The window as the sentence someone would say out loud.
 *
 * `against` names what the offsets are measured from. A nested step's window
 * is written against the step above it, and saying "before it ships" there
 * would be plainly wrong.
 */
export function describeWindow(
  window: TimingWindow | undefined,
  against?: string
): string {
  if (!window) return "No limit";
  const { earliestOffset: early, latestOffset: late } = window;
  if (early === null && late === null) return "No limit";

  const suffix = against ? ` ${against}` : "";
  const day = (n: number) =>
    n === 0
      ? `the day${suffix ? ` of${suffix}` : " itself"}`
      : `${Math.abs(n)} ${Math.abs(n) === 1 ? "day" : "days"} before${suffix}`;

  if (early !== null && late !== null) {
    if (early === late) {
      return early === 0 ? "Same day only" : `Exactly ${day(early)}`;
    }
    return `No earlier than ${day(early)}, ready by ${day(late)}`;
  }
  if (early !== null) return `No earlier than ${day(early)}`;
  return `Ready by ${day(late!)}`;
}

export type ScheduleInput = {
  entries: ScheduleEntry[];
  recipesById: Map<string, WipRecipe>;
  linesByRecipeId: Map<string, WipRecipeLine[]>;
  windows: Map<string, TimingWindow>;
  /** Company-wide uplift, 0 unless an admin raises it. */
};


/** One day of demand on one recipe, and where it came from. */
export type DemandDay = {
  date: string;
  quantity: number;
  /** Finished products driving it, largest first, for the tooltip. */
  drivers: { recipeId: string; name: string; quantity: number }[];
};

export type RecipeDemand = {
  recipeId: string;
  /** Date -> what is needed that day. Sorted by date. */
  days: DemandDay[];
  total: number;
};

/**
 * What every subrecipe is needed for, derived from the finished products on
 * the schedule.
 *
 * A finished product needs its components on the day it is assembled, so
 * demand lands on the finished product's own date. Moving production earlier
 * is the scheduler's job, and the timing window is what says how far.
 */
export function deriveDemand(input: ScheduleInput): Map<string, RecipeDemand> {
  const { entries, recipesById, linesByRecipeId, windows } = input;

  // recipeId -> date -> { qty, drivers }
  const demand = new Map<
    string,
    Map<string, { quantity: number; drivers: Map<string, number> }>
  >();

  // What is actually planned, so the cascade can follow decisions rather than
  // assumptions. Sorted, because the earliest run is the one that binds.
  const plannedDates = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.quantity) continue;
    const list = plannedDates.get(entry.recipeId) ?? [];
    list.push(entry.productionDate);
    plannedDates.set(entry.recipeId, list);
  }
  for (const list of plannedDates.values()) list.sort();

  /**
   * The day a step's own ingredients have to be ready by.
   *
   * If nothing is planned yet, that is the day it is needed. But once a
   * decision has been made - the stew is being made three days early - then
   * everything under it has to be ready before THAT day, not before the day
   * the stew was theoretically due. Moving a step earlier drags its whole
   * branch earlier with it; the dressing can never be made after the stew
   * that contains it.
   */
  function startsOn(recipeId: string, neededBy: string): string {
    const planned = plannedDates.get(recipeId);
    if (!planned || planned.length === 0) return neededBy;

    // The earliest run that could serve this need. Anything later than the
    // need date is serving a different day.
    for (const date of planned) {
      if (date <= neededBy) return date;
    }
    return neededBy;
  }

  function record(
    recipeId: string,
    date: string,
    quantity: number,
    rootId: string
  ) {
    let byDate = demand.get(recipeId);
    if (!byDate) {
      byDate = new Map();
      demand.set(recipeId, byDate);
    }
    const cell = byDate.get(date) ?? {
      quantity: 0,
      drivers: new Map<string, number>(),
    };
    cell.quantity += quantity;
    cell.drivers.set(rootId, (cell.drivers.get(rootId) ?? 0) + quantity);
    byDate.set(date, cell);
  }

  /**
   * Walk one branch, carrying the day its parent starts.
   *
   * Level by level rather than a flat explosion, because each step's deadline
   * depends on when the step above it actually runs - which is only knowable
   * one level at a time.
   */
  function walk(
    recipeId: string,
    parentStartsOn: string,
    multiplier: number,
    rootId: string,
    depth: number,
    trail: Set<string>
  ): void {
    if (depth > 12 || trail.has(recipeId)) return;

    const recipe = recipesById.get(recipeId);
    if (!recipe) return;

    const lines = linesByRecipeId.get(recipeId) ?? [];
    trail.add(recipeId);

    for (const line of lines) {
      if (!line.subRecipeId) continue;

      const child = recipesById.get(line.subRecipeId);
      if (!child) continue;

      // The shared arithmetic, so the plan and the batch sheet never disagree
      // about how much a run takes.
      const perParent = linePerOutputUnit(recipe, line, lines).quantity;

      const quantity = multiplier * perParent;
      if (!quantity) continue;

      // Ready by its own deadline, measured from when its parent starts.
      const latest = windows.get(line.subRecipeId)?.latestOffset ?? 0;
      const neededBy = shiftDate(parentStartsOn, latest);

      record(line.subRecipeId, neededBy, quantity, rootId);

      walk(
        line.subRecipeId,
        startsOn(line.subRecipeId, neededBy),
        quantity,
        rootId,
        depth + 1,
        trail
      );
    }

    trail.delete(recipeId);
  }

  for (const entry of entries) {
    if (!entry.quantity) continue;

    const root = recipesById.get(entry.recipeId);
    if (!root) continue;

    // Only finished products drive demand. A subrecipe typed directly is a
    // deliberate top-up, not something that cascades again - counting it
    // would double every layer beneath it.
    if (!isFinishedProduct(root)) continue;

    walk(
      entry.recipeId,
      entry.productionDate,
      entry.quantity,
      entry.recipeId,
      0,
      new Set()
    );
  }

  const result = new Map<string, RecipeDemand>();
  for (const [recipeId, byDate] of demand) {
    const days: DemandDay[] = [...byDate.entries()]
      .map(([date, cell]) => ({
        date,
        quantity: cell.quantity,
        drivers: [...cell.drivers.entries()]
          .map(([id, quantity]) => ({
            recipeId: id,
            name: recipesById.get(id)?.name ?? "Unknown",
            quantity,
          }))
          .sort((a, b) => b.quantity - a.quantity),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    result.set(recipeId, {
      recipeId,
      days,
      total: days.reduce((sum, day) => sum + day.quantity, 0),
    });
  }

  return result;
}

/** Move a date by an offset in days. Negative goes earlier. */
export function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type WindowVerdict = "ok" | "too-early" | "too-late" | "unknown";

/** What a scheduled cell is serving, and whether the timing works. */
export type CellAllocation = {
  /** The need dates this production covers, earliest first. */
  servesDates: string[];
  /** The date shown under the cell - the first thing it is for. */
  primaryDate: string | null;
  verdict: WindowVerdict;
  /** Plain-language reason, shown behind the "?" when not ok. */
  explanation: string | null;
  /**
   * Quantity from this run that is covering demand, wherever that demand
   * falls. A run on the 5th serving the 6th carries the 6th's number here,
   * so the cell can ask for it on the day the work is actually happening.
   */
  served: number;
  /** Quantity produced that no demand accounts for. */
  surplus: number;
};

/**
 * Allocates what is produced against what is needed, oldest need first.
 *
 * FIFO is how the floor actually works - a batch made Monday is consumed by
 * the earliest order still open, not reserved for a particular one - and it
 * is what makes a single date meaningful under each cell.
 */
/**
 * A lot already sitting in the cooler, from a WIP count.
 *
 * Stock is supply that has already happened, so it covers demand before any
 * new production does - both because that is what FIFO means and because
 * something used is something not thrown away.
 */
export type StockLot = {
  lotCode: string;
  quantity: number;
  /** Null means nothing was ever set, so it keeps indefinitely. */
  expiresOn: string | null;
};

export type Allocation = {
  /** Keyed by production date: what that run is serving, and whether it works. */
  byRun: Map<string, CellAllocation>;
  /**
   * Keyed by demand date: how much of that day's need nothing covers.
   *
   * This is what a cell should ask for, not the raw demand. Rice needed on
   * the 6th and made on the 5th is covered - the 6th has nothing left to ask
   * for, and showing it as short would send someone to fix a problem that
   * does not exist.
   */
  unmetByNeed: Map<string, number>;
  /** How much of the counted stock is covering demand. */
  stockUsed: number;
  /**
   * Stock that reaches nothing, and why.
   *
   * Almost always because it is past its date by the day it is wanted. It
   * has to be said out loud: silently ignoring buckets somebody can see in
   * the cooler is the one behaviour nobody would forgive.
   */
  stockStranded: number;
  stockReason: string | null;
};

/**
 * Allocates what is produced against what is needed, oldest need first.
 *
 * FIFO is how the floor actually works - a batch made Monday is consumed by
 * the earliest order still open, not reserved for a particular one - and it
 * is what makes a single date meaningful under each cell.
 *
 * A run that falls outside the window does not consume anything. It is going
 * to be past its best by the day it is needed, so letting it cover a need
 * would report a real shortfall as covered.
 */
export function allocateRecipe(
  produced: { date: string; quantity: number }[],
  demand: RecipeDemand | undefined,
  window: TimingWindow | undefined,
  stock: StockLot[] = []
): Allocation {
  const byRun = new Map<string, CellAllocation>();

  const needs = (demand?.days ?? []).map((day) => ({
    date: day.date,
    remaining: day.quantity,
  }));

  /*
    Counted stock is spent first, oldest lot first.

    A lot is judged by its own expiry rather than by the timing window: the
    window says how far ahead something MAY be made, the expiry says how long
    what was actually made will last, and for something already in the cooler
    only the second one is a fact.
  */
  let stockUsed = 0;
  let stockStranded = 0;
  let stockReason: string | null = null;

  const lots = [...stock]
    .filter((lot) => lot.quantity > 0.0001)
    .sort((a, b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"));

  for (const lot of lots) {
    let left = lot.quantity;
    for (const need of needs) {
      if (left <= 0.0001) break;
      if (need.remaining <= 0.0001) continue;
      // Past its date by the day it is wanted, so it cannot serve it.
      if (lot.expiresOn !== null && need.date > lot.expiresOn) continue;
      const take = Math.min(left, need.remaining);
      need.remaining -= take;
      left -= take;
      stockUsed += take;
    }

    if (left > 0.0001) {
      stockStranded += left;
      const firstOpen = needs.find((need) => need.remaining > 0.0001);
      if (!stockReason && firstOpen && lot.expiresOn !== null) {
        stockReason =
          `lot ${lot.lotCode} expired ${monthDay(lot.expiresOn)}` +
          `, too old for ${monthDay(firstOpen.date)}`;
      }
    }
  }

  const runs = [...produced]
    .filter((run) => run.quantity > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const run of runs) {
    // Which need this run would serve: the earliest still open that it could
    // reach. Judging the window needs a target before anything is consumed.
    const target = needs.find((need) => need.remaining > 0.0001) ?? null;
    const { verdict, explanation } = judgeWindow(
      run.date,
      target?.date ?? null,
      window
    );

    if (verdict === "too-early" || verdict === "too-late") {
      byRun.set(run.date, {
        servesDates: target ? [target.date] : [],
        primaryDate: target?.date ?? null,
        verdict,
        explanation,
        served: 0,
        // Nothing was consumed, so the whole run is unaccounted for. Whether
        // that reads as "mistimed" or "extra" depends on whether any need is
        // still open, which only the caller can see.
        surplus: run.quantity,
      });
      continue;
    }

    let left = run.quantity;
    const serves: string[] = [];
    let served = 0;
    for (const need of needs) {
      if (left <= 0.0001) break;
      if (need.remaining <= 0.0001) continue;
      const take = Math.min(left, need.remaining);
      need.remaining -= take;
      left -= take;
      served += take;
      if (!serves.includes(need.date)) serves.push(need.date);
    }

    byRun.set(run.date, {
      servesDates: serves,
      primaryDate: serves[0] ?? null,
      verdict,
      explanation,
      served,
      surplus: left > 0.0001 ? left : 0,
    });
  }

  const unmetByNeed = new Map<string, number>();
  for (const need of needs) {
    if (need.remaining > 0.0001) unmetByNeed.set(need.date, need.remaining);
  }

  return { byRun, unmetByNeed, stockUsed, stockStranded, stockReason };
}

/** Days from production to need. Positive means produced in advance. */
export function daysBetween(productionDate: string, needDate: string): number {
  const a = Date.UTC(
    Number(productionDate.slice(0, 4)),
    Number(productionDate.slice(5, 7)) - 1,
    Number(productionDate.slice(8, 10))
  );
  const b = Date.UTC(
    Number(needDate.slice(0, 4)),
    Number(needDate.slice(5, 7)) - 1,
    Number(needDate.slice(8, 10))
  );
  return Math.round((b - a) / 86_400_000);
}

/** 2026-09-06 as 09/06. Tooltips are read at a glance, not parsed. */
function monthDay(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

function judgeWindow(
  productionDate: string,
  needDate: string | null,
  window: TimingWindow | undefined
): { verdict: WindowVerdict; explanation: string | null } {
  if (!needDate) {
    return { verdict: "unknown", explanation: null };
  }

  // The day it is made, expressed the same way the window is: an offset from
  // the day it is needed. Made two days early is -2.
  const offset = -daysBetween(productionDate, needDate);

  /*
    Day zero is structural, not a shelf-life question.

    Nothing can be made after the day it is wanted - you cannot assemble a
    bowl on the 7th for a bowl that ships on the 6th - so the late edge holds
    whether or not anyone has configured a window. Only the early edge depends
    on a shelf life, because without one the app genuinely cannot say how far
    ahead is too far.
  */
  const latest = window?.latestOffset ?? 0;
  if (offset > latest) {
    const late = offset - latest;
    return {
      verdict: "too-late",
      explanation: `${late} ${dayWord(late)} too late for ${monthDay(needDate)}`,
    };
  }

  if (!window || window.earliestOffset === null) {
    return { verdict: "unknown", explanation: null };
  }

  if (window.earliestOffset !== null && offset < window.earliestOffset) {
    const over = window.earliestOffset - offset;
    return {
      verdict: "too-early",
      explanation: `${over} ${dayWord(over)} too early for ${monthDay(needDate)}`,
    };
  }

  return { verdict: "ok", explanation: null };
}

function dayWord(n: number): string {
  return Math.abs(n) === 1 ? "day" : "days";
}

/**
 * Demand inside a date range that has not been scheduled.
 *
 * This is the "open balance" from the workbook: what is still to be planned,
 * as opposed to what is planned and merely not made yet.
 */
export function openBalance(
  demand: Map<string, RecipeDemand>,
  entries: ScheduleEntry[],
  from: string,
  to: string
): Map<string, number> {
  const scheduled = new Map<string, number>();
  for (const entry of entries) {
    if (entry.productionDate < from || entry.productionDate > to) continue;
    scheduled.set(
      entry.recipeId,
      (scheduled.get(entry.recipeId) ?? 0) + (entry.quantity ?? 0)
    );
  }

  const open = new Map<string, number>();
  for (const [recipeId, recipeDemand] of demand) {
    const needed = recipeDemand.days
      .filter((day) => day.date >= from && day.date <= to)
      .reduce((sum, day) => sum + day.quantity, 0);
    const made = scheduled.get(recipeId) ?? 0;
    const gap = needed - made;
    if (gap > 0.0001) open.set(recipeId, gap);
  }

  return open;
}

export type DayTotals = {
  date: string;
  /** Weight-based recipes, summed in lb. */
  pounds: number;
  /** Each-based recipes (bowls, burritos). */
  units: number;
  /** Finished product cases, when a case count is known. */
  cases: number;
  recipeCount: number;
};

/** Per-day totals for the strip under the grid. */
export function dayTotals(
  entries: ScheduleEntry[],
  recipesById: Map<string, WipRecipe>,
  unitsPerCase?: Map<string, number>
): DayTotals[] {
  const byDate = new Map<string, DayTotals>();

  for (const entry of entries) {
    if (!entry.quantity) continue;
    const recipe = recipesById.get(entry.recipeId);
    const uom = (recipe?.uom ?? "LB").trim().toUpperCase();

    const totals = byDate.get(entry.productionDate) ?? {
      date: entry.productionDate,
      pounds: 0,
      units: 0,
      cases: 0,
      recipeCount: 0,
    };

    if (uom === "LB" || uom === "LBS" || uom === "POUND") {
      totals.pounds += entry.quantity;
    } else if (uom === "OZ") {
      totals.pounds += entry.quantity / 16;
    } else {
      totals.units += entry.quantity;
    }

    const perCase = unitsPerCase?.get(entry.recipeId);
    if (perCase && perCase > 0) totals.cases += entry.quantity / perCase;

    totals.recipeCount += 1;
    byDate.set(entry.productionDate, totals);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Every date in a range, inclusive. The grid's columns. */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}


export type TreeRow = {
  /**
   * Unique per position in the tree, not per recipe.
   *
   * The same subrecipe genuinely appears under several bowls - cilantro is in
   * nine of them - so a recipe id cannot identify a row. Deduplicating by
   * recipe hid nine of Chipotle Veggie's fourteen steps behind bowls that
   * happened to come first alphabetically.
   */
  path: string;
  recipeId: string;
  /** The path of the step directly above. Null for a finished product. */
  parentPath: string | null;
  /** 0 for a finished product, 1 for what it contains, and so on. */
  depth: number;
  /** The finished product this branch hangs from. */
  rootId: string;
  /** How much of it one unit of the root takes. */
  perRoot: number;
  /** True when nothing below this row. */
  isLeaf: boolean;
};

/**
 * The schedule in the order the food is actually built.
 *
 * A finished product first, then everything it contains indented beneath it,
 * then the next finished product. This is how Carlos plans - start from the
 * bowl and follow the tree down - so it is how the rows are ordered.
 *
 * Every occurrence is listed. A subrecipe in six bowls appears six times,
 * because "what goes into this bowl" has to be answerable for each of them.
 * The cells behind those rows are the same underlying day and recipe, so
 * typing into one is typing into all of them.
 */
export function buildScheduleTree(input: {
  rootIds: string[];
  recipesById: Map<string, WipRecipe>;
  linesByRecipeId: Map<string, WipRecipeLine[]>;
}): TreeRow[] {
  const { rootIds, recipesById, linesByRecipeId } = input;
  const rows: TreeRow[] = [];

  for (const rootId of rootIds) {
    /**
     * One entry per recipe this root reaches, not per branch it reaches it
     * through.
     *
     * A step can feed the same bowl by more than one route - Chipotle
     * Dressing goes into both the rice mix and the cheese mix - but it is
     * still one job on the floor, made once for the combined amount. Two rows
     * would share a cell, so typing 100 into one would show 100 in the other
     * and read as 200.
     *
     * Recipes still repeat across roots: each bowl shows its own full tree.
     */
    const reach = new Map<
      string,
      { quantity: number; depth: number; parentId: string | null }
    >();

    (function walk(
      recipeId: string,
      parentId: string | null,
      depth: number,
      perRoot: number,
      trail: Set<string>
    ): void {
      // Depth and the in-progress set together stop a recipe that (wrongly)
      // contains itself from walking forever.
      if (depth > 12 || trail.has(recipeId)) return;

      const recipe = recipesById.get(recipeId);
      if (!recipe) return;

      const seen = reach.get(recipeId);
      if (!seen) {
        reach.set(recipeId, { quantity: perRoot, depth, parentId });
      } else {
        // The amounts add up - both mixes need dressing - but the row sits at
        // the shallowest place it appears, which is where someone looks first.
        seen.quantity += perRoot;
        if (depth < seen.depth) {
          seen.depth = depth;
          seen.parentId = parentId;
        }
      }

      trail.add(recipeId);
      const recipeLines = linesByRecipeId.get(recipeId) ?? [];
      for (const line of recipeLines) {
        if (!line.subRecipeId) continue;
        // The shared arithmetic, so the tree and the cascade never disagree
        // about how much of something a bowl takes.
        const quantity =
          perRoot * linePerOutputUnit(recipe, line, recipeLines).quantity;

        walk(line.subRecipeId, recipeId, depth + 1, quantity, trail);
      }
      trail.delete(recipeId);
    })(rootId, null, 0, 1, new Set());

    // Emit shallowest-first so a row's parent path always exists by the time
    // the row that hangs off it is written.
    const pathOf = new Map<string, string>();
    const ordered = [...reach.entries()].sort((a, b) => a[1].depth - b[1].depth);

    for (const [recipeId, at] of ordered) {
      const parentPath = at.parentId ? (pathOf.get(at.parentId) ?? null) : null;
      const path = parentPath === null ? rootId : `${parentPath}/${recipeId}`;
      pathOf.set(recipeId, path);

      const children = (linesByRecipeId.get(recipeId) ?? []).filter(
        (line) => line.subRecipeId
      );

      rows.push({
        path,
        recipeId,
        parentPath,
        depth: at.depth,
        rootId,
        perRoot: at.quantity,
        // A step whose children all sit elsewhere in the tree has nothing to
        // open, so it should not offer a caret.
        isLeaf: !children.some(
          (line) => reach.get(line.subRecipeId!)?.parentId === recipeId
        ),
      });
    }
  }

  return rows;
}

export type ResolvedWindow = {
  /** Absolute offset from the ship day, accumulated down the branch. */
  earliest: number | null;
  latest: number | null;
  /** The typed pair, which is relative to the step above. */
  relativeEarliest: number | null;
  relativeLatest: number | null;
};

/**
 * Where each step's window actually falls, relative to the ship day.
 *
 * A window is written against the step above it - raw chicken is "-5 to -1
 * before the marinade", not before the bowl - so the position on a T-minus
 * chart has to accumulate down the branch:
 *
 *   BOWL                              T-0
 *     STEW       -2 -> -1 vs bowl  ->  T-2 .. T-1
 *       MARINADE -3 -> -1 vs stew  ->  T-5 .. T-2
 *
 * A child hangs off its parent's EARLIEST, not its latest. The parent might
 * be made on the first day its window allows, and the child has to be ready
 * either way; anchoring to the latest would quietly assume everything runs
 * as late as permitted.
 *
 * The same subrecipe under two different bowls can therefore land on two
 * different absolute days. That is correct - the path to T-0 differs - and it
 * is why the stored pair stays relative and only the drawing moves.
 */
export function resolveWindows(input: {
  rootId: string;
  linesByRecipeId: Map<string, WipRecipeLine[]>;
  windows: Map<string, TimingWindow>;
}): Map<string, ResolvedWindow> {
  const { rootId, linesByRecipeId, windows } = input;
  const resolved = new Map<string, ResolvedWindow>();

  function walk(recipeId: string, parentEarliest: number, depth: number): void {
    if (depth > 12 || resolved.has(recipeId)) return;

    const own = windows.get(recipeId);
    const relEarly = own?.earliestOffset ?? null;
    const relLate = own?.latestOffset ?? null;

    // The root ships on day zero; everything else stacks onto its parent.
    const earliest =
      depth === 0 ? 0 : relEarly === null ? parentEarliest : parentEarliest + relEarly;
    const latest =
      depth === 0 ? 0 : relLate === null ? parentEarliest : parentEarliest + relLate;

    resolved.set(recipeId, {
      earliest,
      latest,
      relativeEarliest: relEarly,
      relativeLatest: relLate,
    });

    for (const line of linesByRecipeId.get(recipeId) ?? []) {
      if (!line.subRecipeId) continue;
      walk(line.subRecipeId, earliest, depth + 1);
    }
  }

  walk(rootId, 0, 0);
  return resolved;
}
