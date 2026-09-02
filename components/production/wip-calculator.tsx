"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, RotateCcw, Search } from "lucide-react";
import { clearWipCounts, saveWipCount } from "@/lib/production/wip-actions";
import { buildableCases } from "@/lib/production/wip-explode";
import type { WipData } from "@/lib/production/fetch-wip";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
  TableTitle,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

/**
 * "The kitchen made X - what can we run with it?"
 *
 * Nothing here changes the schedule. It answers a question about right now,
 * which is why counts live in their own table and no production record is
 * written.
 */
export function WipCalculator({ data }: { data: WipData }) {
  const { finished, subrecipes, plannedByRecipeId, horizons } = data;

  const [counts, setCounts] = useState<Map<string, number | null>>(
    () => new Map(subrecipes.map((s) => [s.id, s.onHand]))
  );
  const [quickSubId, setQuickSubId] = useState("");
  const [quickQty, setQuickQty] = useState("");
  const [horizon, setHorizon] = useState(horizons[0]);
  const [query, setQuery] = useState("");
  const [onlyCounted, setOnlyCounted] = useState(false);
  const [pending, startTransition] = useTransition();

  const countedMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, value] of counts) if (value != null) map.set(id, value);
    return map;
  }, [counts]);

  const planned = (recipeId: string) =>
    plannedByRecipeId[recipeId]?.[horizon] ?? 0;

  function updateCount(recipeId: string, raw: string) {
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && !Number.isFinite(value)) return;

    setCounts((prev) => new Map(prev).set(recipeId, value));
    startTransition(async () => {
      await saveWipCount(recipeId, value);
    });
  }

  // ---- Quick check: one subrecipe against every product that uses it ----
  const quickSub = subrecipes.find((s) => s.id === quickSubId) ?? null;
  const quickQtyValue = quickQty.trim() === "" ? null : Number(quickQty);

  const quickRows = useMemo(() => {
    if (!quickSub || quickQtyValue == null || !Number.isFinite(quickQtyValue)) {
      return [];
    }
    return finished
      .map((product) => {
        const node = product.nodes.find((n) => n.id === quickSub.id);
        if (!node || node.mult <= 0) return null;
        const cases = Math.floor(quickQtyValue / node.mult);
        return {
          product,
          perCase: node.mult,
          cases,
          bowls: product.unitsPerCase ? cases * product.unitsPerCase : null,
          plan: planned(product.id),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.cases - a.cases);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, quickSub, quickQtyValue, horizon, plannedByRecipeId]);

  // ---- Full picture: everything counted, against every product ----
  const buildable = useMemo(() => {
    return finished
      .map((product) => {
        const result = buildableCases(product.nodes, countedMap);
        if (!result) return null;
        return {
          product,
          ...result,
          bowls: product.unitsPerCase
            ? result.cases * product.unitsPerCase
            : null,
          plan: planned(product.id),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.plan - b.cases - (a.plan - a.cases));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, countedMap, horizon, plannedByRecipeId]);

  const visibleSubs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return subrecipes.filter((sub) => {
      if (onlyCounted && counts.get(sub.id) == null) return false;
      if (!needle) return true;
      return `${sub.wipCode} ${sub.name}`.toLowerCase().includes(needle);
    });
  }, [subrecipes, query, onlyCounted, counts]);

  return (
    <div className="flex flex-col gap-6 px-3 py-4 sm:px-4">
      {/* ---------------- Quick check ---------------- */}
      <section>
        <TableTitle>Quick check — one subrecipe</TableTitle>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={quickSubId}
            onChange={(event) => setQuickSubId(event.target.value)}
            aria-label="Choose a subrecipe"
            className="h-8 min-w-0 flex-1 rounded-sm bg-card ring-1 ring-foreground/10 px-2 text-sm sm:max-w-md sm:flex-none"
          >
            <option value="">Choose a subrecipe…</option>
            {subrecipes.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name} · {sub.department ?? "—"}
              </option>
            ))}
          </select>

          <input
            inputMode="decimal"
            value={quickQty}
            onChange={(event) => setQuickQty(event.target.value)}
            placeholder="quantity"
            aria-label="Quantity produced"
            className="h-8 w-28 rounded-sm bg-card ring-1 ring-foreground/10 px-2 text-right tabular-nums"
          />
          <span className="text-sm text-muted-foreground">
            {quickSub?.uom?.toLowerCase() ?? "unit"}
          </span>

          <span className="ml-2 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Window
          </span>
          {horizons.map((days) => (
            <Toggle
              key={days}
              active={horizon === days}
              onClick={() => setHorizon(days)}
            >
              {days} days
            </Toggle>
          ))}
        </div>

        {quickSub && quickQtyValue != null && (
          <>
            <DataTable>
              <THead
                columns={[
                  { label: "Finished product" },
                  { label: "Needs per case", numeric: true },
                  { label: "Cases possible", numeric: true },
                  { label: "Bowls", numeric: true },
                  { label: `Planned next ${horizon} d`, numeric: true },
                  { label: "Status" },
                ]}
              />
              <TBody>
                {quickRows.map((row) => (
                  <TR key={row.product.id}>
                    <TD>
                      <Code>{row.product.wipCode}</Code> {row.product.name}
                    </TD>
                    <TD numeric muted>
                      {fmt(row.perCase, 3)} {quickSub.uom?.toLowerCase() ?? ""}
                    </TD>
                    <TD numeric strong>
                      {fmt(row.cases, 0)}
                    </TD>
                    <TD numeric muted>
                      {row.bowls != null ? fmt(row.bowls, 0) : ""}
                    </TD>
                    <TD numeric muted>
                      {fmt(row.plan, 0)}
                    </TD>
                    <TD>
                      <CoverageTag cases={row.cases} plan={row.plan} />
                    </TD>
                  </TR>
                ))}
                {quickRows.length === 0 && (
                  <TableEmpty colSpan={6}>
                    No finished product uses this subrecipe.
                  </TableEmpty>
                )}
              </TBody>
            </DataTable>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Each product is calculated independently against the full
              quantity — a shared subrecipe is not split between products.
            </p>
          </>
        )}
      </section>

      {/* ---------------- Full picture ---------------- */}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="min-w-0">
          <TableTitle aside={`${countedMap.size} counted`}>
            Full WIP picture — what the kitchen has
          </TableTitle>

          <div className="mb-2 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a subrecipe to count…"
                aria-label="Find a subrecipe"
                className="h-8 w-full rounded-sm bg-card ring-1 ring-foreground/10 pr-2 pl-8 text-sm"
              />
            </div>
            <Toggle
              active={onlyCounted}
              onClick={() => setOnlyCounted((value) => !value)}
            >
              Only counted
            </Toggle>
            <button
              type="button"
              onClick={() => {
                if (!confirm("Clear all WIP counts?")) return;
                setCounts(new Map());
                startTransition(async () => {
                  await clearWipCounts();
                });
              }}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-card ring-1 ring-foreground/10 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <RotateCcw className="size-3.5" />
              Clear
            </button>
            {pending && (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>

          <DataTable>
            <THead
              columns={[
                { label: "Subrecipe" },
                { label: "Department" },
                { label: "On hand", numeric: true },
                { label: "U/M" },
              ]}
            />
            <TBody>
              {visibleSubs.slice(0, 200).map((sub) => (
                <TR key={sub.id}>
                  <TD>
                    <Code>{sub.wipCode}</Code> {sub.name}
                  </TD>
                  <TD muted>{sub.department ?? "—"}</TD>
                  <TD numeric>
                    <input
                      inputMode="decimal"
                      defaultValue={counts.get(sub.id) ?? ""}
                      onBlur={(event) => updateCount(sub.id, event.target.value)}
                      aria-label={`On hand for ${sub.name}`}
                      className="h-7 w-24 rounded border border-border bg-card px-1.5 text-right tabular-nums"
                    />
                  </TD>
                  <TD muted>{sub.uom?.toLowerCase() ?? ""}</TD>
                </TR>
              ))}
              {visibleSubs.length === 0 && (
                <TableEmpty colSpan={4}>
                  Type a subrecipe name above, then enter what was produced.
                </TableEmpty>
              )}
            </TBody>
          </DataTable>
          {visibleSubs.length > 200 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Showing the first 200 of {visibleSubs.length} — narrow the search
              to see the rest.
            </p>
          )}
        </section>

        <section className="min-w-0">
          <TableTitle aside={`vs planned next ${horizon} days`}>
            Buildable cases
          </TableTitle>

          <DataTable>
            <THead
              columns={[
                { label: "Finished product" },
                { label: "Can build", numeric: true },
                { label: "Bowls", numeric: true },
                { label: "Planned", numeric: true },
                { label: "Limited by" },
                { label: "Status" },
              ]}
            />
            <TBody>
              {buildable.map((row) => (
                <TR key={row.product.id}>
                  <TD>
                    <Code>{row.product.wipCode}</Code> {row.product.name}
                    {row.uncountedCount > 0 && (
                      <div className="text-[0.6875rem] text-muted-foreground">
                        {row.uncountedCount} subrecipe
                        {row.uncountedCount > 1 ? "s" : ""} not counted —
                        ignored
                      </div>
                    )}
                  </TD>
                  <TD numeric strong>
                    {fmt(row.cases, 0)}
                  </TD>
                  <TD numeric muted>
                    {row.bowls != null ? fmt(row.bowls, 0) : ""}
                  </TD>
                  <TD numeric muted>
                    {fmt(row.plan, 0)}
                  </TD>
                  <TD muted>
                    {row.limitedBy
                      ? `${row.limitedBy.name} (${fmt(
                          countedMap.get(row.limitedBy.id) ?? 0,
                          0
                        )} ${row.limitedBy.uom?.toLowerCase() ?? ""})`
                      : ""}
                  </TD>
                  <TD>
                    <CoverageTag cases={row.cases} plan={row.plan} />
                  </TD>
                </TR>
              ))}
              {buildable.length === 0 && (
                <TableEmpty colSpan={6}>
                  Enter on-hand quantities on the left.
                </TableEmpty>
              )}
            </TBody>
          </DataTable>
        </section>
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 shrink-0 rounded-md px-2.5 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "border border-border bg-card text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">{children}</span>
  );
}

function CoverageTag({ cases, plan }: { cases: number; plan: number }) {
  if (!plan) {
    return <span className="text-xs text-muted-foreground">not planned</span>;
  }
  if (cases >= plan) {
    return (
      <span className="inline-flex rounded-[1px] bg-success-muted px-2 py-0.5 text-[0.6875rem] font-medium text-success">
        covered
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-[1px] bg-destructive/10 px-2 py-0.5 text-[0.6875rem] font-medium text-destructive">
      short {fmt(plan - cases, 0)} cs
    </span>
  );
}

function fmt(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
