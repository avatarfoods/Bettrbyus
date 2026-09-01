"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { saveWipCount } from "@/lib/production/wip/actions";
import { ageLot, dateToLot, lotToDate } from "@/lib/production/wip/model";
import type { WipRecipeRow } from "@/lib/production/wip/fetch";
import { cn } from "@/lib/utils";

/**
 * WIP Count, as used on a phone at four in the morning.
 *
 * Written for a thumb, in a cold room, by someone holding a clipboard in the
 * other hand. That rules out most of what a desktop form does: no small
 * targets, no typing where a button will do, no scrolling back up to find out
 * where you are.
 *
 * Three things carry it.
 *
 * The list is by department, because that is the order you physically walk -
 * Main Kitchen, then Fresh Mixing, not alphabetically across the whole
 * cooler. Picking a department is one tap and it becomes the only thing on
 * screen.
 *
 * Nobody weighs. They count buckets of a known size, so the fields are "how
 * many" and "how big", both entered by tapping, and the app multiplies.
 * Arithmetic done half asleep is where a wrong number comes from.
 *
 * One line per lot, because five buckets are not necessarily one lot and a
 * single expiry cannot describe a mixed pile. The lot is a date, so it also
 * says which day's production the stock came from.
 */

type Draft = {
  key: string;
  lotCode: string;
  containers: string;
  containerSize: string;
  /** The part-full bucket, in the recipe's unit. Four and a bit is normal. */
  partial: string;
  containerLabel: string;
  note: string;
};

const CONTAINERS = ["bucket", "cart", "pan", "bin", "case", "bag"];

/** The sizes actually used, offered as taps before anyone types. */
const SIZES = [50, 40, 25, 20, 10, 5];

function newLot(defaultLot: string, size = ""): Draft {
  return {
    key: Math.random().toString(36).slice(2),
    lotCode: defaultLot,
    containers: "",
    containerSize: size,
    partial: "",
    containerLabel: "bucket",
    note: "",
  };
}

/** Whole containers plus whatever was left over in the part-full one. */
function lotTotal(lot: Draft): number {
  const n = Number(lot.containers) || 0;
  const size = Number(lot.containerSize) || 0;
  const partial = Number(lot.partial) || 0;
  return n * size + partial;
}

function fmt(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function dayName(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
  });
}

export function WipCountForm({
  recipes,
  listedIds,
  planned,
  today,
  yesterday,
  missingTable,
}: {
  recipes: WipRecipeRow[];
  /** What was scheduled the day being counted. */
  listedIds: string[];
  planned: Record<string, number>;
  today: string;
  yesterday: string;
  missingTable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [line, setLine] = useState<string>("");
  const [dept, setDept] = useState<string>("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  /** Recipes added by hand, for a batch nobody scheduled. It happens. */
  const [extra, setExtra] = useState<string[]>([]);
  const [lots, setLots] = useState<Record<string, Draft[]>>({});

  const scheduled = useMemo(() => new Set(listedIds), [listedIds]);
  const defaultLot = dateToLot(yesterday);

  /**
   * What is offered to count: what was scheduled, plus anything added.
   *
   * Searching reaches past that into all 199, because a bucket found in the
   * cooler that nobody scheduled still has to be recorded.
   */
  const pool = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inPlay = new Set([...listedIds, ...extra]);
    return recipes.filter((recipe) => {
      if (needle) {
        return `${recipe.wipCode} ${recipe.name}`.toLowerCase().includes(needle);
      }
      return inPlay.has(recipe.id);
    });
  }, [recipes, listedIds, extra, query]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, WipRecipeRow[]>();
    for (const recipe of pool) {
      const key = recipe.department ?? "No department";
      const list = map.get(key) ?? [];
      list.push(recipe);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pool]);

  const lineNames = useMemo(() => {
    const names = new Set<string>();
    for (const recipe of pool) if (recipe.lineName) names.add(recipe.lineName);
    return [...names].sort();
  }, [pool]);

  /** Departments of the chosen line, so the second row narrows the first. */
  const deptChips = useMemo(
    () => byDepartment.filter(([, list]) => !line || list[0]?.lineName === line),
    [byDepartment, line]
  );

  const shown = useMemo(
    () =>
      pool
        .filter((recipe) => !line || recipe.lineName === line)
        .filter((recipe) => !dept || recipe.department === dept),
    [pool, line, dept]
  );

  /** What has been keyed in for one recipe, in its own unit. */
  function totalFor(recipeId: string): number {
    return (lots[recipeId] ?? []).reduce(
      (sum, lot) => sum + lotTotal(lot),
      0
    );
  }

  function setLot(recipeId: string, key: string, patch: Partial<Draft>) {
    setLots((prev) => ({
      ...prev,
      [recipeId]: (prev[recipeId] ?? []).map((lot) =>
        lot.key === key ? { ...lot, ...patch } : lot
      ),
    }));
  }

  function open(recipeId: string) {
    setOpenId((current) => (current === recipeId ? null : recipeId));
    setLots((prev) =>
      prev[recipeId]?.length
        ? prev
        : { ...prev, [recipeId]: [newLot(defaultLot)] }
    );
    // Opening something found by search keeps it in the list once the search
    // is cleared, so an unscheduled batch does not vanish mid-count.
    if (!scheduled.has(recipeId)) {
      setExtra((prev) => (prev.includes(recipeId) ? prev : [...prev, recipeId]));
    }
  }

  const ready = useMemo(() => {
    const out: {
      recipeId: string;
      lotCode: string;
      containers: number;
      containerSize: number;
      partialQuantity: number;
      containerLabel: string;
      note: string | null;
    }[] = [];

    for (const [recipeId, drafts] of Object.entries(lots)) {
      for (const lot of drafts) {
        const containers = Number(lot.containers) || 0;
        const size = Number(lot.containerSize) || 0;
        const partial = Number(lot.partial) || 0;
        // A size is still needed even for a part-only lot, because the
        // database stores containers x size and adds the part on top.
        if (size <= 0) continue;
        if (containers * size + partial <= 0) continue;
        out.push({
          recipeId,
          lotCode: lot.lotCode.trim(),
          containers,
          containerSize: size,
          partialQuantity: partial,
          containerLabel: lot.containerLabel,
          note: lot.note.trim() || null,
        });
      }
    }
    return out;
  }, [lots]);

  const doneCount = new Set(ready.map((lot) => lot.recipeId)).size;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveWipCount({ lots: ready });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push("/production/wip");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-2 pb-20 sm:px-4">
      {/* Where you are, and how far through. Sticky because on a phone the
          list is longer than the screen and the count is the thing you keep
          glancing at. */}
      <header className="sticky top-0 z-20 -mx-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {dayName(yesterday)} {yesterday.slice(5, 7)}/{yesterday.slice(8, 10)}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">
              {doneCount} of {pool.length} counted
            </p>
          </div>
          <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-[1px] bg-muted">
            <div
              className="h-full rounded-[1px] bg-success transition-[width]"
              style={{
                width: `${pool.length ? (doneCount / pool.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Line, then the departments inside it - the way the plant is laid
            out, and the way someone walks it. Picking Bettr Bowl narrows the
            second row to its rooms rather than listing every room there is. */}
        {lineNames.length > 1 && (
          <div className="mt-1.5 -mx-2 flex gap-1 overflow-x-auto px-2 sm:mx-0 sm:px-0">
            <Chip active={line === ""} onClick={() => setLine("")}>
              All lines
            </Chip>
            {lineNames.map((name) => (
              <Chip
                key={name}
                active={line === name}
                onClick={() => {
                  setLine(line === name ? "" : name);
                  setDept("");
                }}
              >
                {name}
              </Chip>
            ))}
          </div>
        )}

        <div className="mt-1.5 -mx-2 flex gap-1 overflow-x-auto px-2 pb-0.5 sm:mx-0 sm:px-0">
          <Chip active={dept === ""} onClick={() => setDept("")} tone="dept">
            All {shown.length}
          </Chip>
          {deptChips.map(([name, list]) => (
            <Chip
              key={name}
              active={dept === name}
              tone="dept"
              onClick={() => setDept(dept === name ? "" : name)}
            >
              {name} {list.length}
            </Chip>
          ))}
        </div>

        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find anything to add…"
            aria-label="Search recipes"
            className="h-9 w-full rounded-md border border-border bg-card pr-8 pl-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      {missingTable && (
        <div className="flex items-start gap-2 rounded-md bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>Counts cannot be saved yet.</strong> Run the{" "}
            <code>20260830_wip_counts</code> migration.
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {shown.length === 0 && (
        <p className="rounded-md bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
          {query
            ? "Nothing matches."
            : listedIds.length === 0
              ? "Nothing was scheduled that day. Search above for whatever you find."
              : "Nothing in this department."}
        </p>
      )}

      <ul className="grid gap-1.5 lg:grid-cols-2">
        {shown.map((recipe) => {
          const total = totalFor(recipe.id);
          const isOpen = openId === recipe.id;
          const unit = (recipe.uom ?? "LB").toLowerCase();
          const want = planned[recipe.id] ?? 0;

          return (
            <li
              key={recipe.id}
              className={cn(
                "overflow-hidden rounded-md bg-card ring-1 transition",
                total > 0 ? "ring-success/50" : "ring-foreground/10",
                isOpen && "ring-2 ring-primary lg:col-span-2"
              )}
            >
              <button
                type="button"
                onClick={() => open(recipe.id)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-[1px] text-[0.625rem] font-bold",
                    total > 0
                      ? "bg-success text-white"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {total > 0 ? <Check className="size-3.5" /> : "—"}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] leading-tight font-semibold">
                    {recipe.name}
                  </span>
                  <span className="block truncate text-[0.625rem] text-muted-foreground">
                    {recipe.wipCode}
                    {recipe.department && ` · ${recipe.department}`}
                    {!scheduled.has(recipe.id) && " · not scheduled"}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  {total > 0 ? (
                    <>
                      <span className="block text-sm leading-tight font-bold tabular-nums text-success">
                        {fmt(total)}
                      </span>
                      <span className="block text-[0.5625rem] text-muted-foreground uppercase">
                        {unit}
                      </span>
                    </>
                  ) : (
                    want > 0 && (
                      <span className="block text-[0.625rem] text-muted-foreground tabular-nums">
                        plan {fmt(want)}
                      </span>
                    )
                  )}
                </span>

                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </button>

              {isOpen && (
                <div className="flex flex-col gap-1.5 border-t border-border bg-muted/30 p-2">
                  {(lots[recipe.id] ?? []).map((lot, index) => (
                    <LotEntry
                      key={lot.key}
                      lot={lot}
                      index={index}
                      unit={unit}
                      shelfLife={recipe.shelfLife}
                      today={today}
                      canRemove={(lots[recipe.id] ?? []).length > 1}
                      onChange={(patch) => setLot(recipe.id, lot.key, patch)}
                      onRemove={() =>
                        setLots((prev) => ({
                          ...prev,
                          [recipe.id]: (prev[recipe.id] ?? []).filter(
                            (entry) => entry.key !== lot.key
                          ),
                        }))
                      }
                    />
                  ))}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setLots((prev) => ({
                          ...prev,
                          [recipe.id]: [
                            ...(prev[recipe.id] ?? []),
                            // The next lot is almost always the same bucket
                            // size as the last, so carry it rather than
                            // making someone pick it again.
                            newLot(
                              defaultLot,
                              prev[recipe.id]?.at(-1)?.containerSize ?? ""
                            ),
                          ],
                        }))
                      }
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded border border-border bg-card text-xs font-medium text-muted-foreground"
                    >
                      <Plus className="size-3.5" />
                      Another lot
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      className="inline-flex h-8 flex-1 items-center justify-center rounded bg-primary text-xs font-medium text-primary-foreground"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {query && shown.length > 0 && (
        <p className="px-1 text-[0.6875rem] text-muted-foreground">
          Tap anything here to count it, even if it was not scheduled.
        </p>
      )}

      {/* Always reachable with a thumb, and it says what it will do. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {ready.length === 0
              ? "Nothing entered yet"
              : `${ready.length} ${ready.length === 1 ? "lot" : "lots"} across ${doneCount} ${doneCount === 1 ? "item" : "items"}`}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={pending || ready.length === 0 || missingTable}
            className="ml-auto inline-flex h-11 min-w-36 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save count
          </button>
        </div>
      </div>
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-16 shrink-0 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  );
}

function Chip({
  active,
  onClick,
  tone = "line",
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** Departments read as the narrower choice, so they sit quieter. */
  tone?: "line" | "dept";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-7 shrink-0 rounded-[1px] px-2.5 text-[0.6875rem] font-medium whitespace-nowrap transition",
        active
          ? tone === "line"
            ? "bg-foreground text-background"
            : "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70"
      )}
    >
      {children}
    </button>
  );
}

/**
 * One lot: which day it was made, how many containers, how big.
 *
 * The lot is entered as a date and stored as MMDDYYYY. Nobody should have to
 * type eight digits with no separators on a phone keyboard to record that
 * something was made yesterday.
 */
function LotEntry({
  lot,
  index,
  unit,
  shelfLife,
  today,
  canRemove,
  onChange,
  onRemove,
}: {
  lot: Draft;
  index: number;
  unit: string;
  shelfLife: number | null;
  today: string;
  canRemove: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const containers = Number(lot.containers) || 0;
  const size = Number(lot.containerSize) || 0;
  const partial = Number(lot.partial) || 0;
  const total = containers * size + partial;
  const madeOn = lotToDate(lot.lotCode);
  const age = madeOn ? ageLot(lot.lotCode, shelfLife, today) : null;

  return (
    <div className="flex flex-col gap-2 rounded-md bg-card p-2.5 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Lot {index + 1} · made
        </span>
        <input
          type="date"
          value={madeOn ?? ""}
          max={today}
          onChange={(event) =>
            onChange({
              lotCode: event.target.value ? dateToLot(event.target.value) : "",
            })
          }
          aria-label="Day this lot was made"
          className="h-8 rounded border border-border bg-card px-1.5 text-sm tabular-nums"
        />
        {age && age.expiresOn && (
          <span
            title={age.reason}
            className={cn(
              "rounded px-1.5 py-0.5 text-[0.625rem] font-semibold",
              age.freshness === "expired"
                ? "bg-destructive text-white"
                : age.freshness === "last"
                  ? "bg-destructive/15 text-destructive"
                  : age.freshness === "soon"
                    ? "bg-warning-muted text-warning-foreground"
                    : "bg-success/15 text-success"
            )}
          >
            {age.freshness === "expired"
              ? "expired"
              : age.daysLeft === 0
                ? "last day"
                : `${age.daysLeft}d left`}
          </span>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this lot"
            className="ml-auto rounded p-1.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {/* How many. Big targets, because this is the number being changed. */}
      <div className="flex items-center gap-1.5">
        <Caption>how many</Caption>
        <button
          type="button"
          aria-label="One fewer"
          onClick={() =>
            onChange({ containers: String(Math.max(0, containers - 1)) })
          }
          className="inline-flex size-9 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground active:bg-muted"
        >
          <Minus className="size-4" />
        </button>
        <input
          value={lot.containers}
          onChange={(event) =>
            onChange({ containers: event.target.value.replace(/[^\d.]/g, "") })
          }
          inputMode="decimal"
          placeholder="0"
          aria-label="How many containers"
          className="h-9 min-w-0 flex-1 rounded border border-border bg-card text-center text-lg font-bold tabular-nums"
        />
        <button
          type="button"
          aria-label="One more"
          onClick={() => onChange({ containers: String(containers + 1) })}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground active:bg-muted"
        >
          <Plus className="size-4" />
        </button>
        <select
          value={lot.containerLabel}
          onChange={(event) => onChange({ containerLabel: event.target.value })}
          aria-label="What kind of container"
          className="h-9 shrink-0 rounded border border-border bg-card px-1.5 text-xs"
        >
          {CONTAINERS.map((name) => (
            <option key={name} value={name}>
              {name}s
            </option>
          ))}
        </select>
      </div>

      {/* How big. Tapped, not typed, until the size is an odd one. */}
      <div className="flex flex-wrap items-center gap-1">
        <Caption>each holds</Caption>
        {SIZES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange({ containerSize: String(value) })}
            aria-pressed={size === value}
            className={cn(
              "h-7 rounded px-2 text-xs font-medium tabular-nums transition",
              size === value
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground"
            )}
          >
            {value}
          </button>
        ))}
        <input
          value={SIZES.includes(size) ? "" : lot.containerSize}
          onChange={(event) =>
            onChange({ containerSize: event.target.value.replace(/[^\d.]/g, "") })
          }
          inputMode="decimal"
          placeholder="other"
          aria-label="Other container size"
          className="h-7 w-14 rounded border border-border bg-card px-1.5 text-center text-xs tabular-nums"
        />
        <span className="text-[0.625rem] text-muted-foreground uppercase">
          {unit}
        </span>
      </div>

      {/*
        The part-full bucket.

        Just a weight. Fractions of a bucket were the wrong unit - nobody
        looks at a part-full pail and thinks "a quarter", they read the scale
        or know it is about thirty pounds, so that is what the box takes.
      */}
      <div className="flex flex-wrap items-center gap-1">
        <Caption>plus part</Caption>
        <input
          value={lot.partial}
          onChange={(event) =>
            onChange({ partial: event.target.value.replace(/[^\d.]/g, "") })
          }
          inputMode="decimal"
          placeholder="0"
          aria-label={`Part bucket amount in ${unit}`}
          className="h-7 w-20 rounded border border-border bg-card px-2 text-center text-sm tabular-nums"
        />
        <span className="text-[0.625rem] text-muted-foreground uppercase">
          {unit}
        </span>

        <span className="ml-auto text-sm font-bold tabular-nums">
          {total > 0 ? (
            <>
              {fmt(total)}{" "}
              <span className="text-[0.625rem] font-normal text-muted-foreground uppercase">
                {unit}
              </span>
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
    </div>
  );
}
