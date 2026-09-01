"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Snowflake,
  X,
} from "lucide-react";
import {
  clearMaterialWindow,
  saveMaterialWindow,
  saveTimingWindow,
} from "@/lib/production/schedule/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { describeWindow, shelfLifeDays } from "@/lib/production/schedule/model";
import { cn } from "@/lib/utils";

/** A raw material that can be given its own window - a thaw, usually. */
export type MaterialOption = {
  materialId: string;
  itemCode: string;
  name: string;
  /** The step that uses it, so the row can sit under it. */
  usedInRecipeId: string;
  usedInName: string;
  depth: number;
  earliestOffset: number | null;
  latestOffset: number | null;
  /** What the window is about. Thawing is drawn in red. */
  windowKind: MaterialWindowKind;
  /** Where it lands once its step's own position is accounted for. */
  absoluteEarliest?: number | null;
  absoluteLatest?: number | null;
};

export type MaterialWindowKind = "thaw" | "temper" | "soak" | "prep" | "other";

export const WINDOW_KINDS: { value: MaterialWindowKind; label: string }[] = [
  { value: "thaw", label: "Thawing" },
  { value: "temper", label: "Tempering" },
  { value: "soak", label: "Soaking" },
  { value: "prep", label: "Prep" },
  { value: "other", label: "Other" },
];

export type TimingRow = {
  /** A recipe row, or a material row given its own window. */
  kind?: "recipe" | "material";
  recipeId: string;
  wipCode: string;
  name: string;
  department: string | null;
  uom: string | null;
  depth: number;
  /** Furthest ahead it may be made, as a negative offset. -5 = five days. */
  earliestOffset: number | null;
  /** Closest to the ship day it may be left. 0 = the day itself. */
  latestOffset: number | null;
  /** For a raw material that has to come out of the freezer first. */
  thawDays?: number | null;
  /** Set on material rows; decides the bar colour. */
  windowKind?: MaterialWindowKind;
  /**
   * Where the window actually falls once the tree is walked. A window is
   * written against the step above it, so a marinade at -5 under a stew at -5
   * sits at T-10, not T-5.
   */
  absoluteEarliest?: number | null;
  absoluteLatest?: number | null;
};

/**
 * When each step runs, laid out against the day the product ships.
 *
 * Two readings of one thing. The table is for setting numbers; the chart is
 * for seeing whether the shape is right - whether the dressing really can be
 * made twelve days out, whether the mixing genuinely has to be same-day, and
 * whether anything is stacked on a day that cannot hold it.
 *
 * Offsets are negative because that is how the chart reads and how people say
 * it: T-5 is minus five. Zero is the ship day itself, and is a real value -
 * "same day only" - distinct from blank, which means no limit.
 *
 * Shelf life is not a field. It is the earliest offset: something that may be
 * made five days ahead keeps five days.
 */
export function TimingWindowTab({
  rows,
  materials,
  missingTable,
  materialsMissingTable,
  canEdit,
}: {
  rows: TimingRow[];
  /** Raw materials in this tree that could carry a window. */
  materials: MaterialOption[];
  missingTable: boolean;
  materialsMissingTable?: boolean;
  canEdit: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [shape, setShape] = useState<"table" | "chart">("table");

  // A material only appears on the chart once someone has given it a window;
  // otherwise every recipe would drag 30 raw lines onto a timeline that is
  // about steps, not shopping.
  const withWindows = materials.filter(
    (m) => m.earliestOffset !== null || m.latestOffset !== null
  );

  const merged: TimingRow[] = [];
  for (const row of rows) {
    merged.push({ ...row, kind: "recipe" });
    for (const material of withWindows) {
      if (material.usedInRecipeId !== row.recipeId) continue;
      merged.push({
        kind: "material",
        recipeId: material.materialId,
        wipCode: material.itemCode,
        name: material.name,
        department: null,
        uom: null,
        depth: row.depth + 1,
        earliestOffset: material.earliestOffset,
        latestOffset: material.latestOffset,
        // Where it lands once its step's own position is accounted for: a
        // thaw at -4 under a step at T-14 sits at T-18, not T-4.
        absoluteEarliest: material.absoluteEarliest ?? null,
        absoluteLatest: material.absoluteLatest ?? null,
        windowKind: material.windowKind,
      });
    }
  }
  rows = merged;

  // A missing table is not a reason to show nothing. The tree, the steps and
  // the chart all come from the recipes, which exist - only the saved windows
  // do not. So everything renders and only saving is off.
  const canSave = canEdit && !missingTable;

  const configured = rows.filter(
    (row) => row.earliestOffset !== null || row.latestOffset !== null
  ).length;

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {(["table", "chart"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setShape(option)}
              aria-pressed={shape === option}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs transition-colors",
                shape === option
                  ? "bg-accent font-medium text-accent-foreground"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {option === "table" ? "Table" : "Chart"}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          <strong>T-0</strong> is the day this ships. <code>-5 → -2</code> means
          make it no earlier than five days before, ready by two days before.
          The earliest is also how long it keeps.
        </p>

        <span className="ml-auto text-[0.6875rem] text-muted-foreground">
          {configured} of {rows.length} set
        </span>

        {canEdit && !materialsMissingTable && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground hover:bg-muted"
          >
            <Plus className="size-3.5" />
            Add raw material
          </button>
        )}
      </div>

      {missingTable && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>Windows cannot be saved yet.</strong> The tree below is
            real and the chart is live, but there is nowhere to store a window
            until <code>PENDING_MIGRATIONS.sql</code> has been run.
          </span>
        </div>
      )}

      <MaterialPicker
        open={picking}
        onOpenChange={setPicking}
        materials={materials}
      />

      {shape === "table" ? (
        <TimingTable rows={rows} canEdit={canSave} />
      ) : (
        <TimingChart rows={rows} canEdit={canSave} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chart                                                               */
/* ------------------------------------------------------------------ */

function TimingChart({
  rows,
  canEdit,
}: {
  rows: TimingRow[];
  canEdit: boolean;
}) {
  // Wide enough for the longest window and any thaw that runs before it,
  // with a couple of spare columns so the earliest bar is not flush left.
  const span = useMemo(() => {
    let furthest = 10;
    for (const row of rows) {
      const start = Math.abs(row.absoluteEarliest ?? row.earliestOffset ?? 0);
      if (start > furthest) furthest = start;
    }
    return Math.min(furthest + 2, 60);
  }, [rows]);

  const columns = useMemo(
    () => Array.from({ length: span + 1 }, (_, i) => -(span - i)),
    [span]
  );

  return (
    <div className="overflow-x-auto rounded-md ring-1 ring-foreground/10">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 min-w-[15rem] border-b border-border bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
              Step
            </th>
            {columns.map((offset) => (
              <th
                key={offset}
                className={cn(
                  "min-w-[2.5rem] border-b border-l border-border px-1 py-1 text-center text-[0.5625rem] font-semibold tabular-nums",
                  offset === 0
                    ? "bg-primary/15 text-primary"
                    : "bg-brand-muted text-muted-foreground"
                )}
              >
                {offset === 0 ? (
                  <>
                    <span className="block">SHIP</span>
                    <span className="block text-[0.6875rem] font-bold">T-0</span>
                  </>
                ) : (
                  <>
                    <span className="block">T</span>
                    <span className="block text-[0.6875rem] font-bold">
                      {offset}
                    </span>
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ChartRow
              key={row.recipeId}
              row={row}
              columns={columns}
              canEdit={canEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartRow({
  row,
  columns,
  canEdit,
}: {
  row: TimingRow;
  columns: number[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Typed against the step above; drawn where the tree puts it.
  const early = row.earliestOffset;
  const late = row.latestOffset;
  const drawEarly = row.absoluteEarliest ?? early;
  const drawLate = row.absoluteLatest ?? late;
  const isSet = early !== null || late !== null;

  // A thaw that runs late loses the whole day behind it, so it does not get
  // to look like every other bar on the chart.
  const isThaw = row.kind === "material" && row.windowKind === "thaw";
  const isMaterial = row.kind === "material";

  function save(nextEarly: number | null, nextLate: number | null) {
    setError(null);
    startTransition(async () => {
      const result = isMaterial
        ? await saveMaterialWindow({
            materialId: row.recipeId,
            earliestOffset: nextEarly,
            latestOffset: nextLate,
            kind: row.windowKind ?? "thaw",
          })
        : await saveTimingWindow({
            recipeId: row.recipeId,
            earliestOffset: nextEarly,
            latestOffset: nextLate,
          });
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  /**
   * Clicking a column moves whichever end is nearer.
   *
   * The column is an absolute day but the stored number is relative to the
   * step above, so the parent's own position is subtracted back out before
   * saving - otherwise a click would silently re-anchor the whole branch.
   */
  const parentBase = (row.absoluteEarliest ?? 0) - (early ?? 0);

  function setEnd(absolute: number) {
    if (!canEdit) return;
    const relative = Math.min(0, absolute - parentBase);

    if (early === null && late === null) {
      save(relative, 0);
      return;
    }
    const e = early ?? late!;
    const l = late ?? early!;
    if (Math.abs(relative - e) <= Math.abs(relative - l)) {
      save(Math.min(relative, l), l);
    } else {
      save(e, Math.max(relative, e));
    }
  }

  const first = drawEarly ?? drawLate;
  const last = drawLate ?? drawEarly;

  return (
    <tr className="even:bg-muted/30">
      <th
        scope="row"
        className="sticky left-0 z-10 border-b border-border bg-background px-2 py-1 text-left font-normal even:bg-muted/30"
      >
        <span
          className="flex min-w-0 items-baseline gap-1"
          style={{ paddingInlineStart: `${Math.min(row.depth, 5) * 0.65}rem` }}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-[1px]",
              isThaw
                ? "bg-destructive"
                : row.depth === 0
                  ? "bg-primary"
                  : "bg-muted-foreground/40"
            )}
          />
          <span
            className={cn(
              "truncate",
              row.depth === 0
                ? "text-[0.8125rem] font-semibold text-primary"
                : "text-[0.75rem]"
            )}
            title={row.name}
          >
            {row.name}
          </span>
          {isThaw && (
            <span className="shrink-0 rounded bg-destructive/15 px-1 text-[0.5rem] font-bold uppercase text-destructive">
              thaw
            </span>
          )}
        </span>
        <span className="block pl-3 text-[0.5625rem] text-muted-foreground">
          {isSet
            ? describeWindow(
                { earliestOffset: early, latestOffset: late },
                row.depth > 0 ? "the step above" : undefined
              )
            : "no window set"}
          {isSet && drawEarly !== null && drawEarly !== early && (
            <span
              title="Written against the step above; this is where it lands against the ship day."
              className="ml-1 cursor-help font-medium"
            >
              · lands T{drawEarly} … T{drawLate}
            </span>
          )}
          {pending && " · saving"}
        </span>
        {error && (
          <span className="block pl-3 text-[0.5625rem] text-destructive">
            {error}
          </span>
        )}
      </th>

      {columns.map((offset) => {
        const inWindow =
          first !== null &&
          last !== null &&
          offset >= first &&
          offset <= last;
        const isFirst = offset === first;
        const isLast = offset === last;

        // The thaw runs before the window opens, in its own quieter band.
        const thawFrom =
          row.thawDays && first !== null ? first - row.thawDays : null;
        const inThaw =
          thawFrom !== null && first !== null && offset >= thawFrom && offset < first;

        return (
          <td
            key={offset}
            onClick={() => setEnd(offset)}
            title={
              canEdit
                ? `Set this end of the window to ${offset}`
                : `T${offset}`
            }
            className={cn(
              "relative border-b border-l border-border p-0",
              canEdit && "cursor-pointer",
              offset === 0 && !inWindow && "bg-primary/5"
            )}
          >
            <span
              className={cn(
                "block h-7",
                inWindow
                  ? isThaw
                    ? "bg-destructive/25"
                    : isMaterial
                      ? "bg-muted-foreground/25"
                      : "bg-primary/25"
                  : inThaw
                    ? "bg-muted-foreground/15"
                    : "hover:bg-muted",
                inWindow &&
                  isFirst &&
                  (isThaw
                    ? "rounded-l-sm border-l-2 border-l-destructive"
                    : isMaterial
                      ? "rounded-l-sm border-l-2 border-l-muted-foreground"
                      : "rounded-l-sm border-l-2 border-l-primary"),
                inWindow &&
                  isLast &&
                  (isThaw
                    ? "rounded-r-sm border-r-2 border-r-destructive"
                    : isMaterial
                      ? "rounded-r-sm border-r-2 border-r-muted-foreground"
                      : "rounded-r-sm border-r-2 border-r-primary")
              )}
            />
          </td>
        );
      })}
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

function TimingTable({
  rows,
  canEdit,
}: {
  rows: TimingRow[];
  canEdit: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md ring-1 ring-foreground/10">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-brand-muted">
            <Th>Item</Th>
            <Th>Step</Th>
            <Th>Department</Th>
            <Th numeric>Earliest</Th>
            <Th numeric>Latest</Th>
            <Th numeric>Keeps</Th>
            <Th numeric>Thawing</Th>
            <Th numeric>?</Th>
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(even)]:bg-muted/30">
          {rows.map((row) => (
            <TableRow key={row.recipeId} row={row} canEdit={canEdit} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="px-3 py-6 text-center text-sm text-muted-foreground"
              >
                Nothing below this recipe to time.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({ row, canEdit }: { row: TimingRow; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const early = row.earliestOffset;
  const late = row.latestOffset;

  function step(which: "early" | "late", by: number) {
    if (!canEdit) return;
    const nextEarly =
      which === "early" ? Math.min(0, (early ?? 0) + by) : early;
    const nextLate = which === "late" ? Math.min(0, (late ?? 0) + by) : late;

    // Keep the pair in order rather than rejecting the click.
    const e = nextEarly ?? null;
    const l = nextLate ?? null;
    const ordered =
      e !== null && l !== null && e > l ? { e: l, l: e } : { e, l };

    setError(null);
    startTransition(async () => {
      // A material row carries a material id, not a recipe id, and its window
      // lives in its own table.
      const result =
        row.kind === "material"
          ? await saveMaterialWindow({
              materialId: row.recipeId,
              earliestOffset: ordered.e,
              latestOffset: ordered.l,
              kind: row.windowKind ?? "thaw",
            })
          : await saveTimingWindow({
              recipeId: row.recipeId,
              earliestOffset: ordered.e,
              latestOffset: ordered.l,
            });
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  function setThaw(on: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await saveMaterialWindow({
        materialId: row.recipeId,
        earliestOffset: early,
        latestOffset: late,
        kind: on ? "thaw" : "other",
      });
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  const keeps = shelfLifeDays({ earliestOffset: early, latestOffset: late });

  return (
    <tr>
      <Td className="font-mono text-[0.6875rem] text-muted-foreground">
        {row.wipCode}
      </Td>
      <Td>
        <span
          className="inline-block truncate"
          style={{ paddingInlineStart: `${Math.min(row.depth, 5) * 0.75}rem` }}
        >
          <span
            className={cn(row.depth === 0 && "font-semibold text-primary")}
          >
            {row.name}
          </span>
        </span>
        {error && (
          <span className="block text-[0.625rem] text-destructive">{error}</span>
        )}
      </Td>
      <Td className="text-[0.6875rem] text-muted-foreground">
        {row.department ?? "—"}
      </Td>
      <Td numeric>
        <Stepper
          value={early}
          disabled={!canEdit || pending}
          onStep={(by) => step("early", by)}
        />
      </Td>
      <Td numeric>
        <Stepper
          value={late}
          disabled={!canEdit || pending}
          onStep={(by) => step("late", by)}
        />
      </Td>
      <Td numeric className="text-[0.75rem] tabular-nums">
        {keeps === null ? "—" : `${keeps} ${keeps === 1 ? "day" : "days"}`}
      </Td>
      <Td numeric>
        {row.kind === "material" ? (
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={() => setThaw(row.windowKind !== "thaw")}
            aria-pressed={row.windowKind === "thaw"}
            title={
              row.windowKind === "thaw"
                ? "This is a thaw — shown red on the chart. Click to unmark."
                : "Mark this as a thaw so it shows red on the chart."
            }
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[0.625rem] font-semibold uppercase transition-colors disabled:opacity-40",
              row.windowKind === "thaw"
                ? "bg-destructive/15 text-destructive"
                : "border border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            <Snowflake className="size-3" />
            Thawing
          </button>
        ) : (
          <span className="text-[0.625rem] text-muted-foreground">—</span>
        )}
      </Td>
      <Td numeric>
        <span
          title={
            describeWindow(
              { earliestOffset: early, latestOffset: late },
              row.depth > 0 ? "the step above" : undefined
            ) +
            (row.absoluteEarliest !== null && row.absoluteEarliest !== undefined
              ? ` — lands T${row.absoluteEarliest} to T${row.absoluteLatest} against the ship day.`
              : "")
          }
          className="inline-flex size-4 cursor-help items-center justify-center rounded-[1px] bg-muted text-[0.5625rem] font-bold text-muted-foreground"
        >
          ?
        </span>
      </Td>
    </tr>
  );
}

/** Negative-only stepper: left makes it earlier, right makes it later. */
function Stepper({
  value,
  disabled,
  onStep,
}: {
  value: number | null;
  disabled: boolean;
  onStep: (by: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onStep(-1)}
        aria-label="One day earlier"
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronLeft className="size-3" />
      </button>
      <span className="w-8 text-center text-[0.8125rem] font-semibold tabular-nums">
        {value === null ? "—" : value}
      </span>
      <button
        type="button"
        disabled={disabled || value === 0}
        onClick={() => onStep(1)}
        aria-label="One day later"
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronRight className="size-3" />
      </button>
    </span>
  );
}

function Th({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      className={cn(
        "border-b border-border px-2 py-1.5 text-[0.5625rem] font-semibold tracking-wider text-primary uppercase",
        numeric ? "text-center" : "text-left"
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  numeric,
  className,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-border px-2 py-1",
        numeric && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}

/**
 * Choosing a raw material to give a window to.
 *
 * Only materials this recipe actually reaches are offered - a window on
 * something the tree never touches would never be drawn, and the list would
 * be 1,090 lines instead of the handful that matter.
 */
function MaterialPicker({
  open,
  onOpenChange,
  materials,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materials: MaterialOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return materials;
    return materials.filter((m) =>
      `${m.itemCode} ${m.name} ${m.usedInName}`.toLowerCase().includes(needle)
    );
  }, [materials, query]);

  function toggle(material: MaterialOption) {
    const has =
      material.earliestOffset !== null || material.latestOffset !== null;
    setError(null);
    startTransition(async () => {
      const result = has
        ? await clearMaterialWindow({ materialId: material.materialId })
        : // A sensible starting pair: out of the freezer up to four days
          // ahead, ready the day before. Both are then adjustable.
          await saveMaterialWindow({
            materialId: material.materialId,
            earliestOffset: -4,
            latestOffset: -1,
            kind: "thaw",
          });
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Raw materials on the chart</DialogTitle>
          <DialogDescription>
            Add a material to give it a window of its own — a frozen protein
            that has to be pulled before the step that uses it can start.
          </DialogDescription>
        </DialogHeader>

        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search materials in this recipe…"
            aria-label="Search materials"
            autoFocus
            className="h-11 w-full bg-transparent pr-4 pl-10 text-sm focus:outline-none"
          />
        </div>

        {error && (
          <p className="border-b border-border bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}

        <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto">
          {matches.map((material) => {
            const has =
              material.earliestOffset !== null ||
              material.latestOffset !== null;
            return (
              <li key={material.materialId}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(material)}
                  className="flex w-full items-baseline gap-2 px-4 py-2 text-left text-sm hover:bg-muted disabled:opacity-60"
                >
                  <span className="w-20 shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                    {material.itemCode}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{material.name}</span>
                    <span className="block truncate text-[0.625rem] text-muted-foreground">
                      used in {material.usedInName}
                    </span>
                  </span>
                  {has ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-primary uppercase">
                      {material.earliestOffset} → {material.latestOffset}
                      <X className="size-2.5" />
                    </span>
                  ) : (
                    <span className="shrink-0 text-[0.5625rem] uppercase text-muted-foreground">
                      add
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {matches.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No materials match.
            </li>
          )}
        </ul>

        <p className="border-t border-border px-4 py-2 text-[0.6875rem] text-muted-foreground">
          Adding one starts it at <code>-4 → -1</code>. Adjust it on the chart
          or in the table. Click a material that is already on to take it off.
        </p>
      </DialogContent>
    </Dialog>
  );
}
