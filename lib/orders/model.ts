import type { OdooOrderLine, OdooStockLevel } from "@/lib/odoo/orders";

/**
 * Turns raw Odoo delivery lines into the view the plant actually plans from.
 *
 * Two things happen here that Odoo will not do on its own:
 *  1. Orders are summed per product, because production runs a product, not an
 *     order - one day's run covers a 135, a 45 and a 90 all at once.
 *  2. That total is netted against what is already sitting in the two
 *     warehouses, so the list shows what must be MADE rather than what was SOLD.
 */

export type OrderStatus =
  | "FINISHED"
  | "TO BE SCHEDULED"
  | "DELAYED"
  | "ON-GOING";

export type OrderRow = OdooOrderLine & {
  status: OrderStatus;
  /** Needed date has passed and it is not finished - customer service's problem. */
  pastDue: boolean;
  /** Belongs on the Late tab: promised late, or already overdue. */
  late: boolean;
  /**
   * Overdue by more than a quarter. These are almost always transfers nobody
   * ever closed - returns, one-off tooling lines, write-offs - not work the
   * plant is behind on. Kept, but out of the way.
   */
  stale: boolean;
  daysUntilNeeded: number | null;
};

/** Past this many days overdue, a line is treated as abandoned, not late. */
export const STALE_AFTER_DAYS = 90;

export type ProductGroup = {
  productId: number;
  itemCode: string | null;
  productName: string;
  uom: string | null;
  /** Sum of every open order line for this product. */
  totalNeeded: number;
  onHand: number;
  incoming: number;
  /** What Odoo itself thinks is outgoing, as a cross-check on our sum. */
  odooOutgoing: number;
  /** What actually has to be produced. */
  toProduce: number;
  /** Soonest needed-by across the lines. */
  earliestNeeded: string | null;
  lateCount: number;
  unscheduledCount: number;
  lines: OrderRow[];
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The status column from the spreadsheet, expressed directly:
 *
 *   =IF(D="","", IF(D=0,"FINISHED",
 *      IF(G="","TO BE SCHEDULED", IF(G>F,"DELAYED","ON-GOING"))))
 *
 * D = qty needed, F = expected date, G = date scheduled.
 */
export function deriveStatus(
  qtyNeeded: number,
  neededBy: string | null,
  completionDate: string | null
): OrderStatus {
  if (qtyNeeded === 0) return "FINISHED";
  if (!completionDate) return "TO BE SCHEDULED";
  if (neededBy && completionDate > neededBy) return "DELAYED";
  return "ON-GOING";
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function toOrderRow(line: OdooOrderLine, today: string): OrderRow {
  const status = deriveStatus(
    line.qtyNeeded,
    line.neededBy,
    line.completionDate
  );

  const pastDue =
    status !== "FINISHED" && line.neededBy !== null && line.neededBy < today;

  const daysUntilNeeded = line.neededBy ? daysBetween(today, line.neededBy) : null;

  return {
    ...line,
    status,
    pastDue,
    stale: daysUntilNeeded !== null && daysUntilNeeded < -STALE_AFTER_DAYS,
    // "Late" covers both flavours: promised for after the customer needs it,
    // and simply overdue. Customer service cares about either.
    late: status === "DELAYED" || pastDue,
    daysUntilNeeded,
  };
}

/** Groups rows by product and nets them against stock. */
export function groupByProduct(
  rows: OrderRow[],
  stock: Map<number, OdooStockLevel>
): ProductGroup[] {
  const groups = new Map<number, ProductGroup>();

  for (const row of rows) {
    let group = groups.get(row.productId);

    if (!group) {
      const level = stock.get(row.productId);
      group = {
        productId: row.productId,
        itemCode: row.itemCode,
        productName: row.productName,
        uom: row.uom,
        totalNeeded: 0,
        onHand: level?.onHand ?? 0,
        incoming: level?.incoming ?? 0,
        odooOutgoing: level?.outgoing ?? 0,
        toProduce: 0,
        earliestNeeded: null,
        lateCount: 0,
        unscheduledCount: 0,
        lines: [],
      };
      groups.set(row.productId, group);
    }

    group.lines.push(row);
    // A finished line has nothing left to make, so it must not inflate demand.
    if (row.status !== "FINISHED") group.totalNeeded += row.qtyNeeded;
    if (row.late) group.lateCount += 1;
    if (row.status === "TO BE SCHEDULED") group.unscheduledCount += 1;
    if (
      row.neededBy &&
      (group.earliestNeeded === null || row.neededBy < group.earliestNeeded)
    ) {
      group.earliestNeeded = row.neededBy;
    }
  }

  for (const group of groups.values()) {
    // Never negative: a surplus is not "minus 400 to produce", it is zero.
    group.toProduce = Math.max(0, group.totalNeeded - group.onHand);
    group.lines.sort((a, b) =>
      (a.neededBy ?? "9999").localeCompare(b.neededBy ?? "9999")
    );
  }

  return [...groups.values()].sort((a, b) => {
    // Biggest shortfall first - that is the day's work.
    if (b.toProduce !== a.toProduce) return b.toProduce - a.toProduce;
    return a.productName.localeCompare(b.productName);
  });
}

export type LineTotals = {
  orders: number;
  cases: number;
  onHand: number;
  toProduce: number;
  late: number;
  unscheduled: number;
};

export function totalsFor(groups: ProductGroup[]): LineTotals {
  return groups.reduce<LineTotals>(
    (acc, group) => ({
      orders: acc.orders + group.lines.length,
      cases: acc.cases + group.totalNeeded,
      onHand: acc.onHand + group.onHand,
      toProduce: acc.toProduce + group.toProduce,
      late: acc.late + group.lateCount,
      unscheduled: acc.unscheduled + group.unscheduledCount,
    }),
    { orders: 0, cases: 0, onHand: 0, toProduce: 0, late: 0, unscheduled: 0 }
  );
}
