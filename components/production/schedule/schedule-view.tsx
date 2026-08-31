"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  CheckCircle2,
  History,
  Loader2,
  Save,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  allocateRecipe,
  buildScheduleTree,
  dateRange,
  deriveDemand,
  type ScheduleEntry,
  type TimingWindow,
} from "@/lib/production/schedule/model";
import type { ScheduleRecipe } from "@/lib/production/schedule/fetch";
import type { WipRecipe, WipRecipeLine } from "@/lib/production/wip-explode";
import {
  applySuggestions,
  confirmDraft,
  discardDraft,
  renameDraft,
  reopenDraft,
} from "@/lib/production/schedule/actions";
import type { DraftSummary } from "@/lib/production/schedule/ensure";
import {
  ScheduleGrid,
  type GridRow,
} from "@/components/production/schedule/schedule-grid";
import { RecipePanel } from "@/components/production/schedule/recipe-panel";
import { departmentColor } from "@/lib/production/department-colors";
import { cn } from "@/lib/utils";

/**
 * Planning.
 *
 * One rolling plan that is always open. You choose the date range you want to
 * look at and, optionally, a line and a department; everything else on screen
 * is the grid. The controls that used to sit here - a weeks dropdown, three
 * view shapes, a recipe filter - were each a decision to make before any work
 * could start, and none of them was a decision worth making.
 *
 * Every recipe is listed, in the order the food is built: a finished product,
 * then what it contains beneath it. With 199 of them that ordering is what
 * makes the page navigable at all.
 */

type Props = {
  scheduleId: string | null;
  myDraftId: string | null;
  drafts: DraftSummary[];
  readOnly: boolean;
  setupError: string | null;
  draftChanges: string[];
  today: string;
  /** The range being looked at, from the URL. */
  from: string;
  to: string;
  recipes: ScheduleRecipe[];
  lineNames: string[];
  entries: ScheduleEntry[];
  windows: [string, TimingWindow][];
  recipes4Explode: [string, WipRecipe][];
  recipeLines: [string, WipRecipeLine[]][];
  isAdmin: boolean;
  /** Filters restored from the URL, so a link back lands where you left. */
  initialDept?: string;
  initialQuery?: string;
  /** Department name to the colour key chosen in Settings. */
  departmentColors: [string, string | null][];
};

/**
 * What each department counts in, and its colour.
 *
 * Main Kitchen thinks in pounds, Assembly in bowls, Finished Product in cases.
 * Showing all three as one number was the thing that made the totals row
 * useless - a day is not "4,300" of anything.
 */
const DEPARTMENT_UNIT: { match: RegExp; unit: "lb" | "ea" | "cs" }[] = [
  { match: /finished/i, unit: "cs" },
  { match: /assembly/i, unit: "ea" },
  { match: /packag/i, unit: "cs" },
];

function unitFor(department: string | null, uom: string | null): "lb" | "ea" | "cs" {
  for (const rule of DEPARTMENT_UNIT) {
    if (rule.match.test(department ?? "")) return rule.unit;
  }
  const value = (uom ?? "LB").trim().toUpperCase();
  if (value === "CS" || value === "CASE") return "cs";
  if (value === "EA" || value === "EACH" || value === "UNIT") return "ea";
  return "lb";
}

export function ScheduleView({
  scheduleId,
  myDraftId,
  drafts,
  readOnly,
  setupError,
  draftChanges,
  today,
  from,
  to,
  recipes,
  lineNames,
  entries: serverEntries,
  windows,
  recipes4Explode,
  recipeLines,
  isAdmin,
  initialDept,
  initialQuery,
  departmentColors: departmentColorList,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  /** Non-null once the name box has been touched, so typing is not clobbered. */
  const [draftName, setDraftName] = useState<string | null>(null);
  const [savedName, setSavedName] = useState(false);
  const [line, setLine] = useState("");
  // Opening on finished products is the point: that is where the typing
  // starts, and everything else follows from it.
  const [dept, setDept] = useState<string>(initialDept ?? "__finished__");
  const [inspected, setInspected] = useState<string | null>(null);
  // Closed by default: the page opens as the thirty-two things you type into,
  // and a bowl unfolds only when you ask it to.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hideEmpty, setHideEmpty] = useState(false);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [selection, setSelection] = useState<{ from: string; to: string } | null>(
    null
  );

  /** Typed while there is nowhere to store it - see the banner. */
  const [localEntries, setLocalEntries] = useState<ScheduleEntry[]>([]);

  const changed = useMemo(() => new Set(draftChanges), [draftChanges]);
  const myDraft = drafts.find((draft) => draft.id === myDraftId);
  const departmentColors = useMemo(
    () => new Map(departmentColorList),
    [departmentColorList]
  );

  const entries = useMemo(() => {
    if (localEntries.length === 0) return serverEntries;
    const merged = new Map(
      serverEntries.map((e) => [`${e.recipeId}|${e.productionDate}`, e])
    );
    for (const entry of localEntries) {
      const key = `${entry.recipeId}|${entry.productionDate}`;
      if (entry.quantity === 0) merged.delete(key);
      else merged.set(key, entry);
    }
    return [...merged.values()];
  }, [serverEntries, localEntries]);

  const recipesById = useMemo(() => new Map(recipes4Explode), [recipes4Explode]);
  const linesByRecipeId = useMemo(() => new Map(recipeLines), [recipeLines]);
  const windowMap = useMemo(() => new Map(windows), [windows]);

  const dates = useMemo(() => dateRange(from, to), [from, to]);

  const demand = useMemo(
    () =>
      deriveDemand({
        entries,
        recipesById,
        linesByRecipeId,
        windows: windowMap,
            }),
    [entries, recipesById, linesByRecipeId, windowMap]
  );

  const entriesByRecipe = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.recipeId) ?? [];
      list.push(entry);
      map.set(entry.recipeId, list);
    }
    return map;
  }, [entries]);

  /** Build order: a finished product, then everything beneath it. */
  /** One entry per position in the tree, keyed by path. */
  const tree = useMemo(() => {
    const roots = recipes.filter((r) => r.isFinished).map((r) => r.id);
    return buildScheduleTree({ rootIds: roots, recipesById, linesByRecipeId });
  }, [recipes, recipesById, linesByRecipeId]);

  const nodeByPath = useMemo(
    () => new Map(tree.map((node) => [node.path, node])),
    [tree]
  );

  const childPaths = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const node of tree) {
      if (!node.parentPath) continue;
      const list = map.get(node.parentPath) ?? [];
      list.push(node.path);
      map.set(node.parentPath, list);
    }
    return map;
  }, [tree]);

  /**
   * Opening a row opens everything under it.
   *
   * Clicking down through five levels to reach an onion is not a feature.
   * Collapsing removes only the row itself, so its children keep whatever
   * state they had - close a bowl, reopen it, and it comes back as you left
   * it rather than fully open again.
   */
  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
        return next;
      }
      const stack = [path];
      let guard = 0;
      while (stack.length > 0 && guard++ < 2000) {
        const current = stack.pop()!;
        next.add(current);
        for (const child of childPaths.get(current) ?? []) stack.push(child);
      }
      return next;
    });
  }

  /** True when every step above this position is open. */
  const isExpandedChild = useMemo(() => {
    return (path: string): boolean => {
      const parent = nodeByPath.get(path)?.parentPath ?? null;
      if (!parent) return false;
      let current: string | null = parent;
      let guard = 0;
      while (current && guard++ < 12) {
        if (!expanded.has(current)) return false;
        current = nodeByPath.get(current)?.parentPath ?? null;
      }
      return true;
    };
  }, [nodeByPath, expanded]);

  /** Suggestions from the tree, for recipes nobody has planned by hand. */
  const suggestions = useMemo(() => {
    const byRecipe = new Map<string, Map<string, number>>();
    for (const [recipeId, recipeDemand] of demand) {
      const own = entriesByRecipe.get(recipeId) ?? [];
      if (own.reduce((s, e) => s + e.quantity, 0) > 0.0001) continue;

      const perDate = new Map<string, number>();
      for (const day of recipeDemand.days) {
        if (day.quantity <= 0.0001) continue;
        // Demand already lands on the day it is needed, so the suggestion
        // goes there too.
        perDate.set(day.date, (perDate.get(day.date) ?? 0) + day.quantity);
      }
      if (perDate.size > 0) byRecipe.set(recipeId, perDate);
    }
    return byRecipe;
  }, [demand, entriesByRecipe]);

  const rows: GridRow[] = useMemo(() => {
    const rangeFrom = selection?.from ?? from;
    const rangeTo = selection?.to ?? to;
    const needle = query.trim().toLowerCase();
    const recipeById = new Map(recipes.map((r) => [r.id, r]));

    /** Everything a row needs that comes from the recipe, not its position. */
    function build(recipe: ScheduleRecipe, position: {
      path: string;
      parentPath: string | null;
      depth: number;
      perRoot: number | null;
      rootName: string | null;
      hasChildren: boolean;
    }): GridRow {
      const own = entriesByRecipe.get(recipe.id) ?? [];
      const recipeDemand = demand.get(recipe.id);

      // A nested step's window is written against the step above, so judging
      // a production day against the raw pair would be wrong below the first
      // level. The span is what matters: how many days before it is needed a
      // run may happen, which is the same at any depth.
      const ownWindow = windowMap.get(recipe.id);
      const span =
        ownWindow?.earliestOffset != null && ownWindow?.latestOffset != null
          ? ownWindow.latestOffset - ownWindow.earliestOffset
          : null;

      const allocation = allocateRecipe(
        own.map((e) => ({ date: e.productionDate, quantity: e.quantity })),
        recipeDemand,
        span === null ? undefined : { earliestOffset: -span, latestOffset: 0 }
      );

      const cells = new Map(
        own.map((entry) => [
          entry.productionDate,
          {
            quantity: entry.quantity,
            allocation: allocation.byRun.get(entry.productionDate) ?? null,
            isDraftChange: changed.has(`${recipe.id}|${entry.productionDate}`),
          },
        ])
      );

      const neededInRange = (recipeDemand?.days ?? [])
        .filter((d) => d.date >= rangeFrom && d.date <= rangeTo)
        .reduce((sum, d) => sum + d.quantity, 0);

      // Only production that can actually be used closes the gap. A run
      // outside the window is past its best by the day it is needed, so
      // counting it would report a shortfall as covered.
      const inRangeRuns = own.filter(
        (e) => e.productionDate >= rangeFrom && e.productionDate <= rangeTo
      );

      // Open is the sum of what the cells are still asking for, so the two
      // can never disagree. Taking it from the allocation also means a run
      // sitting just before the range still closes the gap it covers.
      const openBalance = [...allocation.unmetByNeed]
        .filter(([date]) => date >= rangeFrom && date <= rangeTo)
        .reduce((sum, [, quantity]) => sum + quantity, 0);

      // Runs that were planned but land outside the window. These are the
      // reason Open can stay red on a row that looks fully planned, so the
      // row has to be able to say so rather than leaving it a mystery.
      const rejected = inRangeRuns.filter((e) => {
        const verdict = allocation.byRun.get(e.productionDate)?.verdict;
        return verdict === "too-early" || verdict === "too-late";
      });

      return {
        ...position,
        recipe,
        cells,
        suggestions: suggestions.get(recipe.id) ?? new Map<string, number>(),
        demand: recipeDemand,
        unmet: allocation.unmetByNeed,
        wasNeeded: neededInRange > 0.01,
        openBalance,
        rejectedQuantity: rejected.reduce((sum, e) => sum + e.quantity, 0),
        rejectedReason:
          rejected.length === 0
            ? null
            : (allocation.byRun.get(rejected[0].productionDate)?.explanation ??
              `Planned on ${rejected.map((e) => e.productionDate).join(", ")}, which falls outside the window.`),
        neededTotal: recipeDemand?.total ?? 0,
        scheduledTotal: own.reduce((sum, e) => sum + e.quantity, 0),
      };
    }

    const out: GridRow[] = [];

    // One row per position in the tree, in build order.
    for (const node of tree) {
      const recipe = recipeById.get(node.recipeId);
      if (!recipe) continue;
      if (line && recipe.lineName !== line) continue;

      const unfolded = isExpandedChild(node.path);
      if (!unfolded) {
        if (dept === "__finished__" && !recipe.isFinished) continue;
        if (dept === "__all__" && node.depth > 0) continue;
        if (
          dept !== "__finished__" &&
          dept !== "__all__" &&
          recipe.department !== dept
        ) {
          continue;
        }
      }

      out.push(
        build(recipe, {
          path: node.path,
          parentPath: node.parentPath,
          depth: node.depth,
          perRoot: node.perRoot,
          rootName: recipeById.get(node.rootId)?.name ?? null,
          hasChildren: !node.isLeaf,
        })
      );
    }

    // Anything no finished product reaches still has to be plannable.
    const inTree = new Set(tree.map((node) => node.recipeId));
    for (const recipe of recipes) {
      if (inTree.has(recipe.id)) continue;
      if (line && recipe.lineName !== line) continue;
      if (dept === "__finished__" && !recipe.isFinished) continue;
      if (
        dept !== "__finished__" &&
        dept !== "__all__" &&
        recipe.department !== dept
      ) {
        continue;
      }
      out.push(
        build(recipe, {
          path: recipe.id,
          parentPath: null,
          depth: 0,
          perRoot: null,
          rootName: null,
          hasChildren: false,
        })
      );
    }

    return out
      .filter((row) => {
        if (!needle) return true;
        // Anything unfolded from a matching row stays, or searching an item
        // number and then expanding it would find nothing: the children do
        // not carry the parent's code in their names.
        if (isExpandedChild(row.path)) return true;
        return `${row.recipe.wipCode} ${row.recipe.name}`
          .toLowerCase()
          .includes(needle);
      })
      .filter((row) => {
        if (!hideEmpty) return true;
        if (isExpandedChild(row.path)) return true;
        // Excel's "exclude zero": a row earns its place by having something
        // planned or something needed in the range being looked at.
        if (row.scheduledTotal > 0.01) return true;
        if (row.openBalance > 0.01) return true;
        return (row.demand?.days ?? []).some(
          (day) => day.date >= from && day.date <= to && day.quantity > 0.01
        );
      });
  }, [
    recipes,
    tree,
    line,
    dept,
    query,
    entriesByRecipe,
    demand,
    suggestions,
    windowMap,
    changed,
    selection,
    from,
    to,
    hideEmpty,
    isExpandedChild,
  ]);

  /**
   * Indent relative to what is actually on screen.
   *
   * Filtering to a department can put a depth-four step at the top of the
   * list with nothing above it; indenting it four levels would suggest a
   * parent that is not there. So depth is counted from the nearest ancestor
   * that survived the filter, and rows with none start flush left.
   *
   * Rows arrive in tree order, so a parent is always seen before its child.
   */
  const shown = useMemo(() => {
    const depthById = new Map<string, number>();
    return rows.map((row) => {
      const parentDepth =
        row.parentPath !== null && depthById.has(row.parentPath)
          ? depthById.get(row.parentPath)! + 1
          : 0;
      depthById.set(row.path, parentDepth);
      return { ...row, depth: parentDepth };
    });
  }, [rows]);

  const styles = useMemo(() => {
    const map = new Map<
      string,
      { unit: "lb" | "ea" | "cs"; spine: string; tint: string }
    >();
    let i = 0;
    for (const row of shown) {
      const dept = row.recipe.department ?? "Unassigned";
      if (map.has(dept)) continue;
      // A department keeps whatever colour Settings gave it; one nobody has
      // chosen for falls back to the palette in order, which is what the grid
      // did before any of this was configurable.
      const look = departmentColor(departmentColors.get(dept), i);
      i += 1;
      map.set(dept, {
        unit: unitFor(dept, row.recipe.uom),
        spine: look.spine,
        tint: look.tint,
      });
    }
    return map;
  }, [shown, departmentColors]);

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const recipe of recipes) {
      if (line && recipe.lineName !== line) continue;
      if (recipe.department) names.add(recipe.department);
    }
    return [...names].sort();
  }, [recipes, line]);

  /**
   * Totals for the selected days, split by department and each in its own
   * unit. One number for a day is meaningless when a day is 4,300 lb of stew
   * and 5,000 bowls and 500 cases.
   */
  const selectionTotals = useMemo(() => {
    if (!selection) return null;
    const byDept = new Map<string, number>();
    for (const row of shown) {
      const dept = row.recipe.department ?? "Unassigned";
      for (const [date, cell] of row.cells) {
        if (date < selection.from || date > selection.to) continue;
        byDept.set(dept, (byDept.get(dept) ?? 0) + (cell.quantity ?? 0));
      }
    }
    return [...byDept.entries()]
      .filter(([, total]) => total > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [selection, shown]);

  const openInRange = useMemo(
    () => shown.filter((row) => row.openBalance > 0.01).length,
    [shown]
  );

  const inspectedRecipe = useMemo(
    () => recipes.find((r) => r.id === inspected) ?? null,
    [recipes, inspected]
  );

  const suggestionCount = useMemo(() => {
    let n = 0;
    for (const [, perDate] of suggestions) {
      for (const date of perDate.keys()) {
        if (date >= from && date <= to) n += 1;
      }
    }
    return n;
  }, [suggestions, from, to]);

  function goRange(nextFrom: string, nextTo: string) {
    router.push(
      `/production/schedule?from=${nextFrom}&to=${nextTo < nextFrom ? nextFrom : nextTo}`
    );
  }

  function acceptAll() {
    if (!scheduleId) return;
    setError(null);
    const payload: {
      recipeId: string;
      productionDate: string;
      quantity: number;
    }[] = [];
    for (const [recipeId, perDate] of suggestions) {
      for (const [date, quantity] of perDate) {
        if (date < from || date > to) continue;
        payload.push({ recipeId, productionDate: date, quantity });
      }
    }
    if (payload.length === 0) return;
    startTransition(async () => {
      const result = await applySuggestions({ scheduleId, entries: payload });
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  const myChangeCount = changed.size;

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-end gap-3">
        {/* The range you are looking at. */}
        <div className="flex items-end gap-1.5">
          <CalendarRange className="mb-1.5 size-4 text-muted-foreground" />
          <label className="flex flex-col gap-0.5">
            <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              From
            </span>
            <input
              type="date"
              value={from}
              onChange={(event) => goRange(event.target.value, to)}
              aria-label="Range start"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              To
            </span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => goRange(from, event.target.value)}
              aria-label="Range end"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            />
          </label>
          <span className="mb-1.5 text-[0.6875rem] text-muted-foreground">
            {dates.length} {dates.length === 1 ? "day" : "days"}
          </span>
        </div>

        {/* Line, then the departments that belong to it. */}
        <div className="flex items-end gap-1.5">
          <label className="flex flex-col gap-0.5">
            <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Line
            </span>
            <select
              value={line}
              onChange={(event) => {
                setLine(event.target.value);
                setDept("");
              }}
              aria-label="Production line"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="">All lines</option>
              {lineNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Department
            </span>
            <select
              value={dept}
              onChange={(event) => setDept(event.target.value)}
              aria-label="Department"
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="__finished__">Finished products</option>
              <option value="__all__">All departments</option>
              <optgroup label="Department">
                {departmentOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>

        <div className="relative mb-0.5 min-w-0 flex-1 sm:max-w-52">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a recipe…"
            aria-label="Search recipes"
            className="h-8 w-full rounded-md border border-border bg-card pr-2 pl-8 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => setHideEmpty((v) => !v)}
          aria-pressed={hideEmpty}
          title="Hide rows with nothing planned and nothing needed in this range"
          className={cn(
            "mb-0.5 h-8 rounded-md px-2.5 text-sm transition-colors",
            hideEmpty
              ? "bg-accent font-medium text-accent-foreground"
              : "border border-border bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          Hide empty
        </button>

        <button
          type="button"
          onClick={() =>
            setExpanded(
              expanded.size > 0
                ? new Set()
                : new Set(tree.map((node) => node.path))
            )
          }
          className="mb-0.5 h-8 rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground hover:bg-muted"
        >
          {expanded.size > 0 ? "Collapse all" : "Expand all"}
        </button>

        <span className="mb-1.5 text-[0.6875rem] text-muted-foreground">
          {shown.length} of {recipes.length} recipes
        </span>

        <div className="mb-0.5 ml-auto flex items-center gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowDrafts((v) => !v)}
              aria-pressed={showDrafts}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors",
                showDrafts
                  ? "bg-accent font-medium text-accent-foreground"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              <History className="size-3.5" />
              Drafts{drafts.length > 0 && ` (${drafts.length})`}
            </button>
          )}

          {suggestionCount > 0 && !readOnly && (
            <button
              type="button"
              onClick={acceptAll}
              disabled={pending}
              title="Write every greyed number into your draft. You can still change any of them."
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
              Accept {suggestionCount}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}

      {readOnly && (
        <div className="rounded-md bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <strong>Nothing here can be saved yet.</strong> The planning tables do
          not exist in the database. Everything else works — type into a
          finished product and watch it cascade down the tree — but the numbers
          live only in this page. Run <code>PENDING_MIGRATIONS.sql</code> in the
          Supabase SQL editor to make it stick.
          {setupError && <span className="mt-1 block font-medium">{setupError}</span>}
        </div>
      )}

      {!readOnly && myChangeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning-muted px-3 py-1.5">
          <span className="text-xs text-warning-foreground">
            <strong>{myChangeCount}</strong>{" "}
            {myChangeCount === 1 ? "change" : "changes"} in your draft. The floor
            still works from the confirmed plan until you confirm.
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {/* The draft is already stored - every number goes straight into
                it. What was missing is a name, and something that says so out
                loud, because "saved" is not obvious when nothing was clicked. */}
            <input
              value={draftName ?? myDraft?.name ?? ""}
              onChange={(e) => {
                setDraftName(e.target.value);
                setSavedName(false);
              }}
              placeholder="Name this draft"
              aria-label="Draft name"
              className="h-7 w-40 rounded-md border border-border bg-card px-2 text-xs placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const name = (draftName ?? myDraft?.name ?? "").trim();
                if (!myDraftId || !name) return;
                startTransition(async () => {
                  // park: keep the draft and its changes in the list, and
                  // hand back a clean plan to start the next one on.
                  const r = await renameDraft({
                    draftId: myDraftId,
                    name,
                    park: true,
                  });
                  if (r.ok) {
                    setSavedName(true);
                    setDraftName(null);
                    setLocalEntries([]);
                    setShowDrafts(true);
                    router.refresh();
                  } else setError(r.message);
                });
              }}
              disabled={pending || !(draftName ?? myDraft?.name ?? "").trim()}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 text-xs text-muted-foreground hover:bg-muted/70 disabled:opacity-50"
            >
              <Save className="size-3" />
              {savedName ? "Saved" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={() =>
                myDraftId &&
                startTransition(async () => {
                  const r = await discardDraft({ draftId: myDraftId });
                  if (r.ok) router.refresh();
                  else setError(r.message);
                })
              }
              disabled={pending}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
            >
              <Trash2 className="size-3" />
              Discard
            </button>
            <button
              type="button"
              onClick={() =>
                myDraftId &&
                startTransition(async () => {
                  const r = await confirmDraft({ draftId: myDraftId });
                  if (r.ok) router.refresh();
                  else setError(r.message);
                })
              }
              disabled={pending}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3" />
              )}
              Confirm to the plan
            </button>
          </div>
        </div>
      )}

      {!readOnly && showDrafts && (
        <div className="rounded-md ring-1 ring-foreground/10">
          <h3 className="border-b border-border bg-brand-muted px-3 py-1.5 text-[0.625rem] font-semibold tracking-wider text-primary uppercase">
            Open drafts
          </h3>
          {drafts.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Nothing unconfirmed. The plan below is what the floor has.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {drafts.map((draft) => (
                <li
                  key={draft.id}
                  className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs"
                >
                  <span className="font-medium">{draft.name}</span>
                  <span className="text-muted-foreground">
                    {draft.entryCount}{" "}
                    {draft.entryCount === 1 ? "change" : "changes"}
                  </span>
                  <span className="text-muted-foreground">
                    {draft.createdByName} ·{" "}
                    {new Date(draft.updatedAt ?? draft.createdAt).toLocaleString(
                      undefined,
                      {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "numeric",
                        minute: "2-digit",
                      }
                    )}
                  </span>
                  {draft.id === myDraftId ? (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary">
                      open now
                    </span>
                  ) : (
                    !draft.isWorking && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground">
                        saved
                      </span>
                    )
                  )}
                  {(draft.id === myDraftId || isAdmin) && (
                    <span className="ml-auto flex gap-2">
                      {/* A saved draft that could not be picked back up would
                          be a dead end - the point of saving it is coming
                          back to it. */}
                      {!draft.isWorking && draft.status === "draft" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const r = await reopenDraft({ draftId: draft.id });
                              if (r.ok) router.refresh();
                              else setError(r.message);
                            })
                          }
                          className="font-medium text-muted-foreground hover:text-primary disabled:opacity-60"
                        >
                          Reopen
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await discardDraft({ draftId: draft.id });
                            if (r.ok) router.refresh();
                            else setError(r.message);
                          })
                        }
                        className="text-muted-foreground hover:text-destructive disabled:opacity-60"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await confirmDraft({ draftId: draft.id });
                            if (r.ok) router.refresh();
                            else setError(r.message);
                          })
                        }
                        className="font-medium text-primary hover:underline disabled:opacity-60"
                      >
                        Confirm
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selection && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-brand-muted px-3 py-1.5">
          <span className="text-[0.625rem] font-semibold tracking-wider text-primary uppercase">
            {selection.from === selection.to
              ? selection.from
              : `${selection.from} → ${selection.to}`}
          </span>
          {(selectionTotals ?? []).map(([dept, total]) => (
            <span key={dept} className="text-xs">
              <span className="text-muted-foreground">{dept}</span>{" "}
              <strong className="tabular-nums">
                {Math.round(total).toLocaleString()}
              </strong>{" "}
              <span className="text-[0.625rem] text-muted-foreground">
                {styles.get(dept)?.unit ?? "lb"}
              </span>
            </span>
          ))}
          {(selectionTotals ?? []).length === 0 && (
            <span className="text-xs text-muted-foreground">
              Nothing planned in this range.
            </span>
          )}
          {openInRange > 0 && (
            <span className="text-xs text-warning-foreground">
              {openInRange} still open
            </span>
          )}
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex min-h-0 gap-2.5">
      <div className="min-w-0 flex-1">
      <ScheduleGrid
        scheduleId={scheduleId ?? "preview"}
        readOnly={readOnly}
        onLocalChange={(recipeId, date, quantity) =>
          setLocalEntries((prev) => [
            ...prev.filter(
              (e) => !(e.recipeId === recipeId && e.productionDate === date)
            ),
            { recipeId, productionDate: date, quantity: quantity ?? 0 },
          ])
        }
        today={today}
        dates={dates}
        rows={shown}
        styles={styles}
        expanded={expanded}
        onToggle={toggle}
        onSelectionChange={setSelection}
        onInspect={(id) => setInspected((prev) => (prev === id ? null : id))}
        inspectedId={inspected}
      />
      </div>

      {inspectedRecipe && (
        <RecipePanel
          backHref={`/production/schedule?${new URLSearchParams({
            from: selection?.from ?? from,
            to: selection?.to ?? to,
            dept,
            ...(query ? { q: query } : {}),
          })}`}
          recipe={inspectedRecipe}
          window={windowMap.get(inspectedRecipe.id)}
          demand={demand.get(inspectedRecipe.id)}
          rangeFrom={selection?.from ?? from}
          rangeTo={selection?.to ?? to}
          scheduled={(entriesByRecipe.get(inspectedRecipe.id) ?? [])
            .filter(
              (e) =>
                e.productionDate >= (selection?.from ?? from) &&
                e.productionDate <= (selection?.to ?? to)
            )
            .map((e) => ({ date: e.productionDate, quantity: e.quantity }))
            .sort((a, b) => a.date.localeCompare(b.date))}
          ingredients={(linesByRecipeId.get(inspectedRecipe.id) ?? []).map(
            (line) => ({
              name:
                recipesById.get(line.subRecipeId ?? "")?.name ??
                line.ingredientName,
              quantity: line.quantity,
              uom: line.uom,
            })
          )}
          usedIn={[...linesByRecipeId.entries()]
            .filter(([, lines]) =>
              lines.some((l) => l.subRecipeId === inspectedRecipe.id)
            )
            .map(([parentId, lines]) => ({
              id: parentId,
              name: recipesById.get(parentId)?.name ?? "Unknown",
              quantity:
                lines.find((l) => l.subRecipeId === inspectedRecipe.id)
                  ?.quantity ?? 0,
            }))}
          onClose={() => setInspected(null)}
        />
      )}
      </div>

      <p className="text-[0.6875rem] text-muted-foreground">
        Type into a finished product and everything below it fills in. Greyed
        numbers are what the recipe tree suggests — click a cell to take it, or
        type your own. Use ↑ ↓ or the + − buttons to step. Click a date to
        select it, shift-click a second for a range.
      </p>
    </div>
  );
}
