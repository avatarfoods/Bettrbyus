"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Search,
} from "lucide-react";
import {
  onHandByRecipe,
  type Freshness,
  type WipCount,
} from "@/lib/production/wip/model";
import type { WipRecipeRow } from "@/lib/production/wip/fetch";
import { cn } from "@/lib/utils";

/**
 * WIP: what is in the cooler.
 *
 * Every recipe is listed, whether or not anything has been counted, because
 * "nothing counted" is itself worth seeing at four in the morning. Colour
 * carries the age - the point of the page is spotting what has to be used
 * today before it is thrown out - and a row opens to show the lots behind
 * its number.
 */

const FRESHNESS: Record<
  Freshness,
  { dot: string; text: string; label: string }
> = {
  expired: {
    dot: "bg-destructive",
    text: "text-destructive",
    label: "Expired",
  },
  last: { dot: "bg-destructive", text: "text-destructive", label: "Last day" },
  soon: {
    dot: "bg-warning-foreground",
    text: "text-warning-foreground",
    label: "Use soon",
  },
  fresh: { dot: "bg-success", text: "text-muted-foreground", label: "Fresh" },
  unknown: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    label: "No shelf life",
  },
};

function shortUom(uom: string | null): string {
  const value = (uom ?? "LB").trim().toUpperCase();
  if (value === "LBS" || value === "POUND") return "lb";
  if (value === "UNIT" || value === "EACH" || value === "EA") return "ea";
  if (value === "CASE" || value === "CS") return "cs";
  return value.toLowerCase();
}

function fmt(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function shortDate(iso: string | null): string {
  return iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : "—";
}

export function WipView({
  recipes,
  counts,
  lineNames,
  today,
  from,
  to,
  missingTable,
  windowsMissing,
}: {
  recipes: WipRecipeRow[];
  counts: WipCount[];
  lineNames: string[];
  today: string;
  from: string;
  to: string;
  missingTable: boolean;
  windowsMissing: boolean;
}) {
  const router = useRouter();
  const [line, setLine] = useState("");
  const [dept, setDept] = useState("");
  const [query, setQuery] = useState("");
  const [onlyCounted, setOnlyCounted] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const shelfLifeByRecipe = useMemo(
    () => new Map(recipes.map((r) => [r.id, r.shelfLife])),
    [recipes]
  );

  const onHand = useMemo(
    () => onHandByRecipe(counts, shelfLifeByRecipe, today),
    [counts, shelfLifeByRecipe, today]
  );

  const departmentsForLine = useMemo(() => {
    const names = new Set<string>();
    for (const recipe of recipes) {
      if (line && recipe.lineName !== line) continue;
      if (recipe.department) names.add(recipe.department);
    }
    return [...names].sort();
  }, [recipes, line]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipes
      .filter((r) => !line || r.lineName === line)
      .filter((r) => !dept || r.department === dept)
      .filter((r) =>
        !needle ? true : `${r.wipCode} ${r.name}`.toLowerCase().includes(needle)
      )
      .map((recipe) => ({ recipe, held: onHand.get(recipe.id) ?? null }))
      .filter((row) => (onlyCounted ? row.held !== null : true));
  }, [recipes, line, dept, query, onlyCounted, onHand]);

  const attention = rows.filter(
    (row) =>
      row.held &&
      (row.held.worst === "expired" ||
        row.held.worst === "last" ||
        row.held.worst === "soon")
  );

  function goRange(nextFrom: string, nextTo: string) {
    router.push(`/production/wip?from=${nextFrom}&to=${nextTo}`);
  }

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-1.5">
          <CalendarRange className="mb-1.5 size-4 text-muted-foreground" />
          <Labelled label="Counted from">
            <input
              type="date"
              value={from}
              onChange={(e) => goRange(e.target.value, to)}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            />
          </Labelled>
          <Labelled label="To">
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => goRange(from, e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            />
          </Labelled>
        </div>

        <div className="flex items-end gap-1.5">
          <Labelled label="Line">
            <select
              value={line}
              onChange={(e) => {
                setLine(e.target.value);
                setDept("");
              }}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="">All lines</option>
              {lineNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Department">
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="">All departments</option>
              {departmentsForLine.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Labelled>
        </div>

        <div className="relative mb-0.5 min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search recipes"
            className="h-8 w-full rounded-md border border-border bg-card pr-2 pl-8 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => setOnlyCounted((v) => !v)}
          aria-pressed={onlyCounted}
          className={cn(
            "mb-0.5 h-8 rounded-md px-2.5 text-sm transition-colors",
            onlyCounted
              ? "bg-accent font-medium text-accent-foreground"
              : "border border-border bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          Counted only
        </button>

        <Link
          href="/production/wip/count"
          className="mb-0.5 ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <ClipboardCheck className="size-3.5" />
          Count WIP
        </Link>
      </div>

      {missingTable && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>No counts can be recorded yet.</strong> Run the{" "}
            <code>20260830_wip_counts</code> migration.
          </span>
        </div>
      )}

      {windowsMissing && !missingTable && (
        <p className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          No timing windows are set, so nothing has a shelf life and nothing
          will show red or yellow.
        </p>
      )}

      {attention.length > 0 && (
        <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs">
          <strong>{attention.length}</strong>{" "}
          {attention.length === 1 ? "item needs" : "items need"} using or
          throwing —{" "}
          {attention
            .slice(0, 4)
            .map((row) => row.recipe.name)
            .join(", ")}
          {attention.length > 4 && ` and ${attention.length - 4} more`}.
        </p>
      )}

      <div className="overflow-x-auto rounded-md ring-1 ring-foreground/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-brand-muted">
              <Th className="w-8" />
              <Th className="w-24">Item #</Th>
              <Th>Recipe</Th>
              <Th className="w-40">Department</Th>
              <Th numeric className="w-24">
                On hand
              </Th>
              <Th className="w-12">U/M</Th>
              <Th numeric className="w-16">
                Lots
              </Th>
              <Th className="w-28">Oldest</Th>
              <Th className="w-32">State</Th>
              <Th className="w-36">Last counted</Th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-muted/30">
            {rows.map(({ recipe, held }) => {
              const isOpen = open.has(recipe.id);
              const state = held ? FRESHNESS[held.worst] : null;
              const oldest = held?.lots[0]?.age ?? null;

              return (
                <FragmentRow
                  key={recipe.id}
                  recipe={recipe}
                  held={held}
                  isOpen={isOpen}
                  state={state}
                  oldest={oldest}
                  onToggle={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(recipe.id)) next.delete(recipe.id);
                      else next.add(recipe.id);
                      return next;
                    })
                  }
                />
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Nothing matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[0.6875rem] text-muted-foreground">
        Showing {rows.length} of {recipes.length}. Counts between {from} and{" "}
        {to}. A lot counted again replaces the earlier number for that lot.
      </p>
    </div>
  );
}

function FragmentRow({
  recipe,
  held,
  isOpen,
  state,
  oldest,
  onToggle,
}: {
  recipe: WipRecipeRow;
  held: ReturnType<typeof onHandByRecipe> extends Map<string, infer V>
    ? V | null
    : never;
  isOpen: boolean;
  state: { dot: string; text: string; label: string } | null;
  oldest: { producedOn: string | null; reason: string } | null;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={cn(held && "cursor-pointer")}
        onClick={held ? onToggle : undefined}
      >
        <Td>
          {held ? (
            isOpen ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )
          ) : null}
        </Td>
        <Td className="font-mono text-[0.6875rem] text-muted-foreground">
          {recipe.wipCode}
        </Td>
        <Td className="text-[0.8125rem]">{recipe.name}</Td>
        <Td className="text-[0.6875rem] text-muted-foreground">
          {recipe.department ?? "—"}
        </Td>
        <Td numeric>
          {held ? (
            <span className="text-[0.9375rem] font-bold tabular-nums">
              {fmt(held.usable)}
              {held.usable !== held.total && (
                <span
                  title={`${fmt(held.total - held.usable)} of the ${fmt(held.total)} counted is expired`}
                  className="ml-1 cursor-help text-[0.625rem] font-normal text-destructive"
                >
                  /{fmt(held.total)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-[0.6875rem] text-muted-foreground">
              not counted
            </span>
          )}
        </Td>
        <Td className="text-[0.625rem] text-muted-foreground uppercase">
          {shortUom(recipe.uom)}
        </Td>
        <Td numeric className="text-[0.6875rem] tabular-nums">
          {held ? held.lots.length : "—"}
        </Td>
        <Td className="text-[0.6875rem] tabular-nums text-muted-foreground">
          {shortDate(oldest?.producedOn ?? null)}
        </Td>
        <Td>
          {state ? (
            <span
              title={oldest?.reason}
              className={cn(
                "inline-flex cursor-help items-center gap-1.5 text-[0.6875rem] font-medium",
                state.text
              )}
            >
              <span className={cn("size-1.5 rounded-full", state.dot)} />
              {state.label}
            </span>
          ) : recipe.shelfLife === null ? (
            <span className="text-[0.625rem] text-muted-foreground">
              no window
            </span>
          ) : (
            <span className="text-[0.625rem] text-muted-foreground">
              keeps {recipe.shelfLife}d
            </span>
          )}
        </Td>
        <Td className="text-[0.625rem] text-muted-foreground">
          {held?.lastCountedAt
            ? `${shortDate(held.lastCountedAt.slice(0, 10))} ${held.lastCountedAt.slice(11, 16)}${held.lastCountedBy ? ` · ${held.lastCountedBy}` : ""}`
            : "—"}
        </Td>
      </tr>

      {isOpen && held && (
        <tr>
          <td />
          <td colSpan={9} className="border-b border-border bg-card px-2 py-1.5">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-2 py-0.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Lot
                  </th>
                  <th className="px-2 py-0.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Found
                  </th>
                  <th className="px-2 py-0.5 text-right text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Quantity
                  </th>
                  <th className="px-2 py-0.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Expires
                  </th>
                  <th className="px-2 py-0.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    Counted by
                  </th>
                </tr>
              </thead>
              <tbody>
                {held.lots.map((lot) => {
                  const look = FRESHNESS[lot.age.freshness];
                  return (
                    <tr key={lot.id}>
                      <td className="px-2 py-0.5 font-mono text-[0.6875rem]">
                        {lot.lotCode}
                      </td>
                      <td className="px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
                        {lot.containers} × {lot.containerSize}{" "}
                        {lot.containerLabel}
                        {lot.containers === 1 ? "" : "s"}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[0.75rem] font-semibold tabular-nums">
                        {fmt(lot.quantity)}
                      </td>
                      <td className="px-2 py-0.5">
                        <span
                          title={lot.age.reason}
                          className={cn(
                            "inline-flex cursor-help items-center gap-1.5 text-[0.6875rem] tabular-nums",
                            look.text
                          )}
                        >
                          <span
                            className={cn("size-1.5 rounded-full", look.dot)}
                          />
                          {lot.age.expiresOn ?? "—"}
                          {lot.age.daysLeft !== null && (
                            <span className="opacity-70">
                              {lot.age.daysLeft < 0
                                ? `${Math.abs(lot.age.daysLeft)}d over`
                                : lot.age.daysLeft === 0
                                  ? "today"
                                  : `${lot.age.daysLeft}d left`}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-0.5 text-[0.625rem] text-muted-foreground">
                        {lot.countedByName ?? "—"}
                        {lot.note && ` · ${lot.note}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({
  children,
  numeric,
  className,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b border-border px-2 py-1.5 text-[0.5625rem] font-semibold tracking-wider text-primary uppercase",
        numeric ? "text-right" : "text-left",
        className
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
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-border px-2 py-1",
        numeric && "text-right",
        className
      )}
    >
      {children}
    </td>
  );
}
