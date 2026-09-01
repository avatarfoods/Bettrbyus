import type { OdooOrderLine, OdooStockLevel, OdooStockLot } from "@/lib/odoo/orders";

/**
 * Turns raw Odoo delivery lines into the view the plant actually plans from.
 *
 * Two things happen here that Odoo will not do on its own:
 *  1. Orders are summed per product, because production runs a product, not an
 *     order - one day's run covers a 135, a 45 and a 90 all at once.
 *  2. That total is netted against stock in the warehouses the plant is
 *     watching, so the list shows what must be MADE rather than what was SOLD.
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

export type ProductLotExtra = {
  lotName: string;
  /** Quantity still sitting on this lot after covering open orders. */
  extra: number;
  expiration: string | null;
};

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
  /** On hand minus orders. Zero when we still have to make some. */
  surplus: number;
  /** Leftover cases by lot, after covering the orders (oldest lot first). */
  extraLots: ProductLotExtra[];
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
  stock: Map<number, OdooStockLevel>,
  lotsByProduct: Map<number, OdooStockLot[]> = new Map()
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
        surplus: 0,
        extraLots: [],
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
    group.surplus = Math.max(0, group.onHand - group.totalNeeded);
    group.extraLots = leftoverLots(
      lotsByProduct.get(group.productId) ?? [],
      group.totalNeeded
    );
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

/**
 * Walks lots oldest-first and spends them on open orders. What is left on
 * each lot is the extra sitting in the freezer after those orders are covered.
 */
export function leftoverLots(
  lots: OdooStockLot[],
  needed: number
): ProductLotExtra[] {
  const ordered = [...lots].sort((a, b) => {
    const ae = a.expiration ?? "9999-99-99";
    const be = b.expiration ?? "9999-99-99";
    if (ae !== be) return ae.localeCompare(be);
    return a.lotName.localeCompare(b.lotName);
  });

  let remaining = Math.max(0, needed);
  const extras: ProductLotExtra[] = [];

  for (const lot of ordered) {
    const used = Math.min(lot.quantity, remaining);
    remaining -= used;
    const extra = lot.quantity - used;
    if (extra > 0.0001) {
      extras.push({
        lotName: lot.lotName,
        extra,
        expiration: lot.expiration,
      });
    }
  }

  return extras;
}

export type StockSplitLine = {
  row: OrderRow;
  /** Cases this order can take from freezer stock. */
  fromStock: number;
  /** Cases still to make after stock is applied. */
  toMake: number;
};

/**
 * Spends on-hand against the earliest ship dates first. What is left to make
 * is the orders leaving last — the 914 on a 3,646/2,732 product.
 */
export function splitOrdersByStock(
  lines: OrderRow[],
  onHand: number
): { toMake: StockSplitLine[]; covered: StockSplitLine[] } {
  const open: OrderRow[] = [];
  const finished: StockSplitLine[] = [];

  for (const row of lines) {
    if (row.status === "FINISHED") {
      finished.push({ row, fromStock: row.qtyNeeded, toMake: 0 });
    } else {
      open.push(row);
    }
  }

  open.sort((a, b) =>
    (a.neededBy ?? "9999").localeCompare(b.neededBy ?? "9999")
  );

  let stock = Math.max(0, onHand);
  const toMake: StockSplitLine[] = [];
  const covered: StockSplitLine[] = [];

  for (const row of open) {
    const fromStock = Math.min(row.qtyNeeded, stock);
    stock -= fromStock;
    const remaining = row.qtyNeeded - fromStock;
    const split = { row, fromStock, toMake: remaining };
    if (remaining > 0.0001) toMake.push(split);
    else covered.push(split);
  }

  toMake.sort((a, b) =>
    (b.row.neededBy ?? "").localeCompare(a.row.neededBy ?? "")
  );

  return { toMake, covered: [...finished, ...covered] };
}
