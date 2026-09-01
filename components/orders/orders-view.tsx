"use client";

import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";
import type { OrdersData } from "@/lib/orders/fetch-orders";
import {
  splitOrdersByStock,
  type OrderRow,
  type ProductGroup,
  type StockSplitLine,
} from "@/lib/orders/model";
import { ButtonTabBar, type TabItem } from "@/components/ui/tab-bar";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
import { SearchPanel } from "@/components/ui/search-panel";
import {
  CompletionDateCell,
  CoveredHint,
  GroupStatusHint,
  Metric,
  StatusPill,
  fmt,
  shortDate,
} from "@/components/orders/order-bits";
import { cn } from "@/lib/utils";

/**
 * The order schedule - what used to be the Yaya spreadsheet.
 *
 * The sheet existed because Odoo shows one sales order at a time and the plant
 * needs the opposite: every open order for a product, summed, netted against
 * what is already in the freezer. That is what this view is.
 */
type ListFilter = "unscheduled" | "to-produce" | "covered";

const ORDER_FILTER_GROUPS = [
  {
    exclusive: true,
    items: [
      { id: "to-produce", label: "To produce" },
      { id: "covered", label: "Covered by stock" },
    ],
  },
  {
    items: [{ id: "unscheduled", label: "Missing scheduled" }],
  },
];

export function OrdersView({ data }: { data: OrdersData }) {
  const [tab, setTab] = useState<string>(data.lines[0]?.key ?? "late");
  const [byProduct, setByProduct] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  /** Show only what is required on or before this date. */
  const [requiredBy, setRequiredBy] = useState("");
  /**
   * Ticked order lines. The spreadsheet habit this replaces is selecting a
   * block of quantity cells and reading the SUM off the corner - so the total
   * of whatever is ticked shows in a bar at the bottom.
   */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const router = useRouter();
  const [syncing, startSync] = useTransition();

  const tabs: TabItem[] = [
    ...data.lines.map((line) => ({
      id: line.key,
      label: line.label,
      count: line.totals.orders,
    })),
    { id: "late", label: "Late orders", count: data.late.length },
  ];

  const activeLine = data.lines.find((line) => line.key === tab) ?? null;

  const groups = useMemo(() => {
    if (!activeLine) return [];
    const needle = query.trim().toLowerCase();
    const wantMake = filters.includes("to-produce");
    const wantCovered = filters.includes("covered");
    const wantUnscheduled = filters.includes("unscheduled");
    if (!needle && !requiredBy && filters.length === 0) return activeLine.groups;

    return activeLine.groups
      .map((group) => {
        const split =
          wantMake || wantCovered
            ? splitOrdersByStock(group.lines, group.onHand)
            : null;
        const makeIds = split
          ? new Set(split.toMake.map((line) => line.row.id))
          : null;
        const coveredIds = split
          ? new Set(split.covered.map((line) => line.row.id))
          : null;

        const lines = group.lines.filter((row) => {
          if (needle && !matches(row, needle)) return false;
          if (requiredBy && row.neededBy && row.neededBy > requiredBy) {
            return false;
          }
          if (wantUnscheduled && row.completionDate) return false;
          if (wantMake && makeIds && !makeIds.has(row.id)) return false;
          if (wantCovered && coveredIds && !coveredIds.has(row.id)) {
            return false;
          }
          return true;
        });

        return {
          ...group,
          lines,
          lateCount: lines.filter((row) => row.late).length,
          unscheduledCount: lines.filter(
            (row) => row.status === "TO BE SCHEDULED"
          ).length,
        };
      })
      .filter((group) => group.lines.length > 0);
  }, [activeLine, query, requiredBy, filters]);

  const emptyMessage = filters.includes("unscheduled")
    ? "No orders missing a scheduled date."
    : filters.includes("to-produce")
      ? "Nothing left to produce."
      : filters.includes("covered")
        ? "No orders covered by stock."
        : query || requiredBy
          ? "No orders match."
          : "Nothing open for this line.";

  const coverageFilter: ListFilter | null = filters.includes("to-produce")
    ? "to-produce"
    : filters.includes("covered")
      ? "covered"
      : null;

  const flatRows = useMemo(
    () => groups.flatMap((group) => group.lines),
    [groups]
  );

  /**
   * Summed across every product line, not just the visible tab - if someone
   * ticks rows, switches tab and ticks more, the total should still be the
   * total. Finished lines contribute nothing, same as everywhere else.
   */
  const selection = useMemo(() => {
    const everyRow = [
      ...data.lines.flatMap((line) =>
        line.groups.flatMap((group) => group.lines)
      ),
      ...data.late,
    ];
    const seen = new Set<number>();
    let cases = 0;
    let count = 0;
    for (const row of everyRow) {
      if (!selected.has(row.id) || seen.has(row.id)) continue;
      seen.add(row.id);
      count += 1;
      if (row.status !== "FINISHED") cases += row.qtyNeeded;
    }
    return { count, cases };
  }, [data, selected]);

  const toggleSelected = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setManySelected = useCallback((ids: number[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  function toggle(productId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function applyFilters(next: string[]) {
    setFilters(next);
    if (!activeLine) return;
    if (next.includes("unscheduled")) {
      setExpanded(
        new Set(
          activeLine.groups
            .filter((group) => group.unscheduledCount > 0)
            .map((group) => group.productId)
        )
      );
    } else if (next.includes("to-produce")) {
      setExpanded(
        new Set(
          activeLine.groups
            .filter((group) => group.toProduce > 0)
            .map((group) => group.productId)
        )
      );
    } else if (next.includes("covered")) {
      setExpanded(
        new Set(
          activeLine.groups
            .filter((group) => group.onHand > 0)
            .map((group) => group.productId)
        )
      );
    }
  }

  if (data.error) {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Could not read Odoo</p>
            <p className="mt-1">{data.error}</p>
            <div className="mt-3">
              <SyncButton
                syncing={syncing}
                onSync={() => startSync(() => router.refresh())}
                label="Try again"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-stretch border-b border-border bg-card">
        <ButtonTabBar
          items={tabs}
          activeId={tab}
          onSelect={setTab}
          className="min-w-0 flex-1 border-b-0"
        />
        <div className="flex shrink-0 items-center gap-2 px-3 sm:px-4">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            as of{" "}
            <time dateTime={data.fetchedAt} suppressHydrationWarning>
              {new Date(data.fetchedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </span>
          <SyncButton
            syncing={syncing}
            onSync={() => startSync(() => router.refresh())}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-3 py-4 sm:px-4">
        {tab === "late" ? (
          <LatePanel rows={data.late} />
        ) : activeLine ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Open orders" value={activeLine.totals.orders} />
              <Metric label="Cases ordered" value={activeLine.totals.cases} />
              <Metric
                label="On hand"
                value={activeLine.totals.onHand}
                tone="good"
              />
              <Metric
                label="To produce"
                value={activeLine.totals.toProduce}
                tone={activeLine.totals.toProduce > 0 ? "warn" : "good"}
              />
              <Metric
                label="Unscheduled"
                value={activeLine.totals.unscheduled}
                tone={activeLine.totals.unscheduled > 0 ? "warn" : "plain"}
              />
              <Metric
                label="Late"
                value={activeLine.totals.late}
                tone={activeLine.totals.late > 0 ? "bad" : "good"}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SearchPanel
                query={query}
                onQueryChange={setQuery}
                placeholder="Search product, SO# or customer…"
                aria-label="Search orders"
                filterGroups={ORDER_FILTER_GROUPS}
                filters={filters}
                onFiltersChange={applyFilters}
              />

              <label className="flex shrink-0 items-center gap-1.5 text-sm">
                <span className="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
                  Required by
                </span>
                <input
                  type="date"
                  value={requiredBy}
                  onChange={(event) => setRequiredBy(event.target.value)}
                  aria-label="Show only orders required on or before this date"
                  className="h-8 rounded-sm border border-border bg-card px-2 text-sm tabular-nums"
                />
                {requiredBy && (
                  <button
                    type="button"
                    onClick={() => setRequiredBy("")}
                    aria-label="Clear required-by filter"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </label>

              <span className="text-[0.6875rem] font-semibold tracking-wider text-primary uppercase">
                Group
              </span>
              <Toggle active={byProduct} onClick={() => setByProduct(true)}>
                By product
              </Toggle>
              <Toggle active={!byProduct} onClick={() => setByProduct(false)}>
                By order
              </Toggle>

              {byProduct && (
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(
                      expanded.size > 0
                        ? new Set()
                        : new Set(groups.map((g) => g.productId))
                    )
                  }
                  className="h-8 rounded-sm px-2.5 text-sm text-primary hover:bg-brand-muted"
                >
                  {expanded.size > 0 ? "Collapse all" : "Expand all"}
                </button>
              )}

            </div>

            {byProduct ? (
              <ProductTable
                groups={groups}
                expanded={expanded}
                onToggle={toggle}
                selected={selected}
                onSelect={toggleSelected}
                empty={emptyMessage}
                coverage={coverageFilter === "to-produce" || coverageFilter === "covered" ? coverageFilter : null}
              />
            ) : (
              <OrderTable
                rows={flatRows}
                selected={selected}
                onSelect={toggleSelected}
                onSelectMany={setManySelected}
                empty={emptyMessage}
              />
            )}
          </>
        ) : null}

        {selection.count > 0 && (
          <div className="sticky bottom-3 z-30 ml-auto flex w-fit items-center gap-4 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-lg">
            <span className="text-muted-foreground">
              <b className="text-foreground tabular-nums">{selection.count}</b>{" "}
              selected
            </span>
            <span className="text-muted-foreground">
              Sum{" "}
              <b className="text-foreground tabular-nums">
                {fmt(selection.cases)}
              </b>{" "}
              cases
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded px-1.5 py-0.5 text-xs text-primary hover:bg-muted"
            >
              Clear
            </button>
          </div>
        )}

        {data.unclassified.length > 0 && tab !== "late" && (
          <p className="text-xs text-muted-foreground">
            {data.unclassified.length} open line
            {data.unclassified.length > 1 ? "s" : ""} sit outside Bettr Bowl,
            Pita and Pizza Cupcake, so they appear on no tab. Move the product
            into the right Odoo category to see it here.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Re-reads Odoo.
 *
 * router.refresh() re-runs the server component, and the page is already
 * force-dynamic, so this genuinely re-queries rather than replaying a cache.
 * Quantities move whenever someone ships or confirms an order, so being able
 * to pull fresh numbers without losing your place on the page matters.
 */
function SyncButton({
  syncing,
  onSync,
  label = "Sync",
}: {
  syncing: boolean;
  onSync: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSync}
      disabled={syncing}
      title="Re-read orders and stock from Odoo"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-sm transition-colors",
        "hover:bg-muted disabled:opacity-60"
      )}
    >
      <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
      {syncing ? "Syncing…" : label}
    </button>
  );
}

function matches(row: OrderRow, needle: string): boolean {
  return `${row.itemCode ?? ""} ${row.productName} ${row.saleOrder ?? ""} ${
    row.customer ?? ""
  } ${row.customerRef ?? ""}`
    .toLowerCase()
    .includes(needle);
}

type SortDir = 1 | -1;
type ProductCol =
  | "product"
  | "orders"
  | "cases"
  | "onHand"
  | "toProduce"
  | "required"
  | "scheduled"
  | "status";
type OrderCol =
  | "item"
  | "product"
  | "qty"
  | "so"
  | "customer"
  | "required"
  | "scheduled"
  | "status"
  | "days";

function cmpText(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: SortDir
): number {
  const av = (a ?? "").trim();
  const bv = (b ?? "").trim();
  if (!av && !bv) return 0;
  if (!av) return dir;
  if (!bv) return -dir;
  return (
    av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * dir
  );
}

/** Empty dates sort first on A → Z so a click surfaces anything not filled in. */
function cmpDate(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: SortDir
): number {
  const av = a ?? "";
  const bv = b ?? "";
  if (!av && !bv) return 0;
  if (!av) return -dir;
  if (!bv) return dir;
  return av.localeCompare(bv) * dir;
}

function earliestScheduled(group: ProductGroup): string | null {
  if (group.unscheduledCount > 0) return null;
  let min: string | null = null;
  for (const line of group.lines) {
    if (
      line.completionDate &&
      (min === null || line.completionDate < min)
    ) {
      min = line.completionDate;
    }
  }
  return min;
}

function compareGroup(
  a: ProductGroup,
  b: ProductGroup,
  key: ProductCol,
  dir: SortDir
): number {
  switch (key) {
    case "product":
      return (
        cmpText(a.productName, b.productName, dir) ||
        cmpText(a.itemCode, b.itemCode, dir)
      );
    case "orders":
      return (a.lines.length - b.lines.length) * dir;
    case "cases":
      return (a.totalNeeded - b.totalNeeded) * dir;
    case "onHand":
      return (a.onHand - b.onHand) * dir;
    case "toProduce":
      return (a.toProduce - b.toProduce) * dir;
    case "required":
      return cmpDate(a.earliestNeeded, b.earliestNeeded, dir);
    case "scheduled":
      return cmpDate(earliestScheduled(a), earliestScheduled(b), dir);
    case "status":
      return (
        (a.lateCount - b.lateCount) * dir ||
        (a.unscheduledCount - b.unscheduledCount) * dir
      );
  }
}

function compareOrderRow(
  a: OrderRow,
  b: OrderRow,
  key: OrderCol,
  dir: SortDir
): number {
  switch (key) {
    case "item":
      return cmpText(a.itemCode, b.itemCode, dir);
    case "product":
      return cmpText(a.productName, b.productName, dir);
    case "qty":
      return (a.qtyNeeded - b.qtyNeeded) * dir;
    case "so":
      return cmpText(a.saleOrder, b.saleOrder, dir);
    case "customer":
      return cmpText(a.customer, b.customer, dir);
    case "required":
      return cmpDate(a.neededBy, b.neededBy, dir);
    case "scheduled":
      return cmpDate(a.completionDate, b.completionDate, dir);
    case "status":
      return cmpText(a.status, b.status, dir);
    case "days":
      return ((a.daysUntilNeeded ?? 9999) - (b.daysUntilNeeded ?? 9999)) * dir;
  }
}

function sortHint(opts: {
  key: string;
  sort: string | null;
  dir: SortDir;
  date?: boolean;
}): string {
  const active = opts.sort === opts.key;
  if (opts.date) {
    if (active && opts.dir > 0) return "Sorted earliest first. Click for latest first";
    if (active) return "Sorted latest first. Click for earliest first";
    return "Sort earliest first";
  }
  if (active && opts.dir > 0) return "Sorted A → Z. Click for Z → A";
  if (active) return "Sorted Z → A. Click for A → Z";
  return "Sort A → Z";
}

function useColumnSort<K extends string>() {
  const [sort, setSort] = useState<K | null>(null);
  const [dir, setDir] = useState<SortDir>(1);

  function toggleSort(key: K) {
    if (sort === key) setDir((value) => (value === 1 ? -1 : 1));
    else {
      setSort(key);
      setDir(1);
    }
  }

  function col(key: K, extra?: { numeric?: boolean; date?: boolean }) {
    return {
      onSort: () => toggleSort(key),
      sorted: sort === key,
      dir,
      numeric: extra?.numeric,
      title: sortHint({ key, sort, dir, date: extra?.date }),
    };
  }

  return { sort, dir, col };
}

/** The planning view: one row per product, orders folded underneath. */
function ProductTable({
  groups,
  expanded,
  onToggle,
  selected,
  onSelect,
  empty,
  coverage,
}: {
  groups: ProductGroup[];
  expanded: Set<number>;
  onToggle: (productId: number) => void;
  selected: Set<number>;
  onSelect: (id: number) => void;
  empty: string;
  coverage: "to-produce" | "covered" | null;
}) {
  const [closedMake, setClosedMake] = useState<Set<number>>(new Set());
  const [openCovered, setOpenCovered] = useState<Set<number>>(new Set());
  const { sort, dir, col } = useColumnSort<ProductCol>();

  const sortedGroups = useMemo(() => {
    if (!sort) return groups;
    return [...groups].sort((a, b) => compareGroup(a, b, sort, dir));
  }, [groups, sort, dir]);

  const childSort: OrderCol | null =
    sort === "required"
      ? "required"
      : sort === "scheduled"
        ? "scheduled"
        : sort === "status"
          ? "status"
          : sort === "cases"
            ? "qty"
            : null;

  function toggleMake(productId: number) {
    setClosedMake((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleCovered(productId: number) {
    setOpenCovered((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  return (
    <DataTable>
      <THead
        columns={[
          { label: "Product", ...col("product") },
          { label: "Orders", ...col("orders", { numeric: true }) },
          { label: "Cases ordered", ...col("cases", { numeric: true }) },
          { label: "On hand", ...col("onHand", { numeric: true }) },
          { label: "To produce", ...col("toProduce", { numeric: true }) },
          { label: "First required", ...col("required", { date: true }) },
          { label: "Scheduled", ...col("scheduled", { date: true }) },
          { label: "Status", ...col("status") },
        ]}
      />
      <TBody>
        {sortedGroups.map((group) => {
          const open = expanded.has(group.productId);
          const split = open
            ? splitOrdersByStock(
                group.lines,
                coverage === "to-produce"
                  ? 0
                  : coverage === "covered"
                    ? Number.POSITIVE_INFINITY
                    : group.onHand
              )
            : null;
          const makeOpen = open && !closedMake.has(group.productId);
          const coveredOpen = open && openCovered.has(group.productId);

          return [
            <TR key={group.productId} onClick={() => onToggle(group.productId)}>
              <TD>
                <span className="flex items-center gap-1.5">
                  {open ? (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-mono text-xs text-muted-foreground">
                    {group.itemCode ?? ""}
                  </span>
                  <span className="font-semibold">{group.productName}</span>
                </span>
              </TD>
              <TD numeric muted>
                {group.lines.length}
              </TD>
              <TD numeric strong>
                {fmt(group.totalNeeded)}
              </TD>
              <TD numeric muted>
                {fmt(group.onHand)}
              </TD>
              <TD numeric>
                {group.toProduce > 0 ? (
                  <span className="font-bold text-destructive">
                    {fmt(group.toProduce)}
                  </span>
                ) : (
                  <CoveredHint
                    surplus={group.surplus}
                    uom={group.uom}
                    lots={group.extraLots}
                  />
                )}
              </TD>
              <TD muted>{shortDate(group.earliestNeeded)}</TD>
              <TD muted>—</TD>
              <TD>
                <GroupStatusHint
                  lateCount={group.lateCount}
                  unscheduledCount={group.unscheduledCount}
                />
              </TD>
            </TR>,
            ...(open && split
              ? [
                  ...orderBucketRows({
                    key: `${group.productId}-make`,
                    label: "To produce",
                    hint: "Orders leaving last — stock does not cover these",
                    lines: split.toMake,
                    open: makeOpen,
                    onToggle: () => toggleMake(group.productId),
                    selected,
                    onSelect,
                    tone: "make",
                    childSort,
                    dir,
                  }),
                  ...orderBucketRows({
                    key: `${group.productId}-stock`,
                    label: "Covered by stock",
                    hint: "Earliest orders, already filled from on hand",
                    lines: split.covered,
                    open: coveredOpen,
                    onToggle: () => toggleCovered(group.productId),
                    selected,
                    onSelect,
                    tone: "stock",
                    childSort,
                    dir,
                  }),
                ]
              : []),
          ];
        })}
        {sortedGroups.length === 0 && (
          <TableEmpty colSpan={8}>{empty}</TableEmpty>
        )}
      </TBody>
    </DataTable>
  );
}

function orderBucketRows({
  key,
  label,
  hint,
  lines,
  open,
  onToggle,
  selected,
  onSelect,
  tone,
  childSort,
  dir,
}: {
  key: string;
  label: string;
  hint: string;
  lines: StockSplitLine[];
  open: boolean;
  onToggle: () => void;
  selected: Set<number>;
  onSelect: (id: number) => void;
  tone: "make" | "stock";
  childSort: OrderCol | null;
  dir: SortDir;
}): ReactNode[] {
  if (lines.length === 0) return [];

  const ordered = childSort
    ? [...lines].sort((a, b) => compareOrderRow(a.row, b.row, childSort, dir))
    : lines;

  const cases =
    tone === "make"
      ? lines.reduce((sum, line) => sum + line.toMake, 0)
      : lines.reduce((sum, line) => sum + line.fromStock, 0);

  const header = (
    <tr key={`${key}-head`} className="border-b border-zinc-100 bg-brand-muted/40">
      <td colSpan={8} className="px-2.5 py-1">
        <button
          type="button"
          title={hint}
          onClick={onToggle}
          className="flex w-full items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "text-[0.6875rem] font-semibold tracking-wider uppercase",
              tone === "make" ? "text-destructive" : "text-success"
            )}
          >
            {label}
          </span>
          <span className="text-xs text-muted-foreground">
            {lines.length} {lines.length === 1 ? "order" : "orders"} · {fmt(cases)}{" "}
            cases
          </span>
        </button>
      </td>
    </tr>
  );

  if (!open) return [header];

  return [
    header,
    ...ordered.map((line) => (
      <tr key={line.row.id} className="border-b border-zinc-100 bg-brand-muted/15">
        <TD className="pl-8">
          <span className="flex min-w-0 items-center gap-2">
            <input
              type="checkbox"
              checked={selected.has(line.row.id)}
              onChange={() => onSelect(line.row.id)}
              aria-label={`Select ${line.row.saleOrder ?? line.row.pickingName}`}
              className="size-3.5 shrink-0"
            />
            <span className="shrink-0 font-mono text-xs">
              {line.row.saleOrder ?? line.row.pickingName}
            </span>
            <span className="min-w-0 truncate text-muted-foreground">
              {line.row.customer}
            </span>
          </span>
        </TD>
        <TD numeric muted>
          —
        </TD>
        <TD numeric strong>
          {fmt(line.row.qtyNeeded)}
        </TD>
        <TD numeric muted>
          {line.fromStock > 0 ? fmt(line.fromStock) : "—"}
        </TD>
        <TD numeric>
          {line.toMake > 0 ? (
            <span className="font-bold text-destructive">{fmt(line.toMake)}</span>
          ) : (
            <span className="text-success">—</span>
          )}
        </TD>
        <TD muted>{shortDate(line.row.neededBy)}</TD>
        <TD>
          <CompletionDateCell row={line.row} />
        </TD>
        <TD>
          <span className="flex flex-wrap items-center gap-1.5">
            {tone === "stock" ? (
              <span className="rounded-full bg-success-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-success">
                COVERED
              </span>
            ) : (
              <StatusPill status={line.row.status} />
            )}
          </span>
        </TD>
      </tr>
    )),
  ];
}

/** The flat list, closest to the original spreadsheet. */
function OrderTable({
  rows,
  selected,
  onSelect,
  onSelectMany,
  empty,
}: {
  rows: OrderRow[];
  selected: Set<number>;
  onSelect: (id: number) => void;
  onSelectMany: (ids: number[], on: boolean) => void;
  empty: string;
}) {
  const { sort, dir, col } = useColumnSort<OrderCol>();
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => compareOrderRow(a, b, sort, dir));
  }, [rows, sort, dir]);
  const ids = sorted.map((row) => row.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  return (
    <DataTable>
      <THead
        columns={[
          {
            label: (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onSelectMany(ids, !allSelected)}
                aria-label="Select every visible order"
                className="size-3.5"
              />
            ),
            className: "w-8",
          },
          { label: "Item #", ...col("item") },
          { label: "Product", ...col("product") },
          { label: "Qty", ...col("qty", { numeric: true }) },
          { label: "SO#", ...col("so") },
          { label: "Customer", ...col("customer") },
          { label: "Required date", ...col("required", { date: true }) },
          { label: "Completion date", ...col("scheduled", { date: true }) },
          { label: "Status", ...col("status") },
        ]}
      />
      <TBody>
        {sorted.map((row) => (
          <TR key={row.id}>
            <TD>
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => onSelect(row.id)}
                aria-label={`Select ${row.saleOrder ?? row.pickingName}`}
                className="size-3.5"
              />
            </TD>
            <TD mono muted>
              {row.itemCode}
            </TD>
            <TD strong>{row.productName}</TD>
            <TD numeric strong>
              {fmt(row.qtyNeeded)}
            </TD>
            <TD mono muted>
              {row.saleOrder}
            </TD>
            <TD muted className="max-w-48 truncate">
              {row.customer}
            </TD>
            <TD muted>
              <span className={cn(row.pastDue && "font-semibold text-destructive")}>
                {shortDate(row.neededBy)}
              </span>
            </TD>
            <TD>
              <CompletionDateCell row={row} />
            </TD>
            <TD>
              <StatusPill status={row.status} />
            </TD>
          </TR>
        ))}
        {sorted.length === 0 && (
          <TableEmpty colSpan={9}>{empty}</TableEmpty>
        )}
      </TBody>
    </DataTable>
  );
}

/**
 * Late orders, across every product line - the list customer service needs to
 * see, because somebody has to tell the customer.
 */
function LatePanel({ rows }: { rows: OrderRow[] }) {
  const [showStale, setShowStale] = useState(false);
  const { sort, dir, col } = useColumnSort<OrderCol>();

  const active = rows.filter((row) => !row.stale);
  const stale = rows.filter((row) => row.stale);
  const sorted = useMemo(() => {
    const list = showStale ? rows : rows.filter((row) => !row.stale);
    if (!sort) return list;
    return [...list].sort((a, b) => compareOrderRow(a, b, sort, dir));
  }, [rows, showStale, sort, dir]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-success/30 bg-success-muted p-6 text-center">
        <p className="font-semibold text-success">Nothing is late.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Every open order is either scheduled on time or already finished.
        </p>
      </div>
    );
  }

  const overdue = active.filter((row) => row.pastDue).length;
  const promisedLate = active.filter((row) => row.status === "DELAYED").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Late orders" value={active.length} tone="bad" />
        <Metric label="Past the needed date" value={overdue} tone="bad" />
        <Metric label="Scheduled after needed" value={promisedLate} tone="warn" />
        <Metric label="Abandoned (90d+)" value={stale.length} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          An order is late when it is scheduled after the date the customer
          needs it, or when that date has already passed. Customer service
          should be told about every row here.
          {stale.length > 0 && (
            <>
              {" "}
              {stale.length} more {stale.length === 1 ? "is" : "are"} over 90
              days overdue — almost always transfers nobody ever closed, not
              work the plant is behind on.
            </>
          )}
        </p>
        {stale.length > 0 && (
          <Toggle active={showStale} onClick={() => setShowStale((v) => !v)}>
            {showStale ? "Hide" : "Show"} abandoned
          </Toggle>
        )}
      </div>

      <DataTable>
        <THead
          columns={[
            { label: "Item #", ...col("item") },
            { label: "Product", ...col("product") },
            { label: "Qty", ...col("qty", { numeric: true }) },
            { label: "SO#", ...col("so") },
            { label: "Customer", ...col("customer") },
            { label: "Required date", ...col("required", { date: true }) },
            { label: "Days", ...col("days", { numeric: true }) },
            { label: "Completion date", ...col("scheduled", { date: true }) },
            { label: "Status", ...col("status") },
          ]}
        />
        <TBody>
          {sorted.map((row) => (
            <TR key={row.id}>
              <TD mono muted>
                {row.itemCode}
              </TD>
              <TD strong>{row.productName}</TD>
              <TD numeric strong>
                {fmt(row.qtyNeeded)}
              </TD>
              <TD mono muted>
                {row.saleOrder}
              </TD>
              <TD muted className="max-w-48 truncate">
                {row.customer}
              </TD>
              <TD>
                <span className="font-semibold text-destructive">
                  {shortDate(row.neededBy)}
                </span>
              </TD>
              <TD numeric>
                {row.daysUntilNeeded === null ? (
                  "—"
                ) : (
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      row.daysUntilNeeded < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {row.daysUntilNeeded < 0
                      ? `${Math.abs(row.daysUntilNeeded)} late`
                      : `in ${row.daysUntilNeeded}`}
                  </span>
                )}
              </TD>
              <TD>
                <CompletionDateCell row={row} />
              </TD>
              <TD>
                <StatusPill status={row.status} />
              </TD>
            </TR>
          ))}
        </TBody>
      </DataTable>
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
        "h-8 shrink-0 rounded-sm px-2.5 text-sm transition-colors",
        active
          ? "bg-brand font-medium text-brand-foreground"
          : "border border-zinc-300 bg-card text-zinc-600 hover:bg-brand-muted hover:text-primary dark:border-zinc-600 dark:text-zinc-300"
      )}
    >
      {children}
    </button>
  );
}
