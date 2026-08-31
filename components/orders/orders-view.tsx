"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { OrdersData } from "@/lib/orders/fetch-orders";
import type { OrderRow, ProductGroup } from "@/lib/orders/model";
import { ButtonTabBar, type TabItem } from "@/components/ui/tab-bar";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
import {
  CompletionDateCell,
  Metric,
  OnProductionButton,
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
export function OrdersView({ data }: { data: OrdersData }) {
  const [tab, setTab] = useState<string>(data.lines[0]?.key ?? "late");
  const [byProduct, setByProduct] = useState(true);
  const [query, setQuery] = useState("");
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
    if (!needle && !requiredBy) return activeLine.groups;

    return activeLine.groups
      .map((group) => ({
        ...group,
        lines: group.lines.filter((row) => {
          if (needle && !matches(row, needle)) return false;
          // A row with no required date is never excluded by the date filter -
          // it is unplanned, which is exactly what someone filtering by date
          // is usually hunting for.
          if (requiredBy && row.neededBy && row.neededBy > requiredBy) {
            return false;
          }
          return true;
        }),
      }))
      .filter((group) => group.lines.length > 0);
  }, [activeLine, query, requiredBy]);

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
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search product, SO# or customer…"
                  aria-label="Search orders"
                  className="h-8 w-full rounded-md border border-border bg-card pr-2 pl-8 text-sm"
                />
              </div>

              <label className="flex shrink-0 items-center gap-1.5 text-sm">
                <span className="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
                  Required by
                </span>
                <input
                  type="date"
                  value={requiredBy}
                  onChange={(event) => setRequiredBy(event.target.value)}
                  aria-label="Show only orders required on or before this date"
                  className="h-8 rounded-md border border-border bg-card px-2 text-sm tabular-nums"
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
                  className="h-8 rounded-md px-2.5 text-sm text-primary hover:bg-muted"
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
              />
            ) : (
              <OrderTable
                rows={flatRows}
                selected={selected}
                onSelect={toggleSelected}
                onSelectMany={setManySelected}
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
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm transition-colors",
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

/** The planning view: one row per product, orders folded underneath. */
function ProductTable({
  groups,
  expanded,
  onToggle,
  selected,
  onSelect,
}: {
  groups: ProductGroup[];
  expanded: Set<number>;
  onToggle: (productId: number) => void;
  selected: Set<number>;
  onSelect: (id: number) => void;
}) {
  return (
    <DataTable>
      <THead
        columns={[
          { label: "Product" },
          { label: "Orders", numeric: true },
          { label: "Cases ordered", numeric: true },
          { label: "On hand", numeric: true },
          { label: "To produce", numeric: true },
          { label: "First required" },
          { label: "Flags" },
        ]}
      />
      <TBody>
        {groups.map((group) => {
          const open = expanded.has(group.productId);
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
                <span
                  className={cn(
                    "font-bold",
                    group.toProduce > 0 ? "text-destructive" : "text-success"
                  )}
                >
                  {group.toProduce > 0 ? fmt(group.toProduce) : "covered"}
                </span>
              </TD>
              <TD muted>{shortDate(group.earliestNeeded)}</TD>
              <TD>
                <span className="flex flex-wrap gap-1">
                  {group.lateCount > 0 && (
                    <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-destructive">
                      {group.lateCount} late
                    </span>
                  )}
                  {group.unscheduledCount > 0 && (
                    <span className="rounded-full bg-[oklch(0.95_0.04_300)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[oklch(0.40_0.13_300)]">
                      {group.unscheduledCount} unplanned
                    </span>
                  )}
                </span>
              </TD>
            </TR>,
            ...(open
              ? group.lines.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/70 bg-muted/30"
                  >
                    <td colSpan={7} className="px-2.5 py-0">
                      <OrderMiniRow
                        row={row}
                        checked={selected.has(row.id)}
                        onSelect={onSelect}
                      />
                    </td>
                  </tr>
                ))
              : []),
          ];
        })}
        {groups.length === 0 && (
          <TableEmpty colSpan={7}>Nothing open for this line.</TableEmpty>
        )}
      </TBody>
    </DataTable>
  );
}

/** One order inside an expanded product, laid out to line up with the parent. */
function OrderMiniRow({
  row,
  checked,
  onSelect,
}: {
  row: OrderRow;
  checked: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-1.5 pl-6 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onSelect(row.id)}
        aria-label={`Select ${row.saleOrder ?? row.pickingName}`}
        className="size-3.5 shrink-0"
      />
      <span className="font-mono text-muted-foreground">{row.saleOrder}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {row.customer}
      </span>
      <span className="tabular-nums">
        <span className="text-muted-foreground">qty </span>
        <b>{fmt(row.qtyNeeded)}</b>
      </span>
      <span className="tabular-nums">
        <span className="text-muted-foreground">required </span>
        {shortDate(row.neededBy)}
      </span>
      <CompletionDateCell row={row} />
      <StatusPill status={row.status} />
      <OnProductionButton row={row} />
    </div>
  );
}

/** The flat list, closest to the original spreadsheet. */
function OrderTable({
  rows,
  selected,
  onSelect,
  onSelectMany,
}: {
  rows: OrderRow[];
  selected: Set<number>;
  onSelect: (id: number) => void;
  onSelectMany: (ids: number[], on: boolean) => void;
}) {
  const ids = rows.map((row) => row.id);
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
          { label: "Item #" },
          { label: "Product" },
          { label: "Qty", numeric: true },
          { label: "SO#" },
          { label: "Customer" },
          { label: "Required date" },
          { label: "Completion date" },
          { label: "Status" },
          { label: "" },
        ]}
      />
      <TBody>
        {rows.map((row) => (
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
            <TD>
              <OnProductionButton row={row} />
            </TD>
          </TR>
        ))}
        {rows.length === 0 && (
          <TableEmpty colSpan={10}>No orders match.</TableEmpty>
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

  const active = rows.filter((row) => !row.stale);
  const stale = rows.filter((row) => row.stale);
  const shown = showStale ? rows : active;

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
            { label: "Item #" },
            { label: "Product" },
            { label: "Qty", numeric: true },
            { label: "SO#" },
            { label: "Customer" },
            { label: "Required date" },
            { label: "Days", numeric: true },
            { label: "Completion date" },
            { label: "Status" },
          ]}
        />
        <TBody>
          {shown.map((row) => (
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
