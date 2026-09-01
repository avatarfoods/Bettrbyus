import {
  fetchOpenOrderLines,
  fetchStockLevels,
  fetchStockLots,
  type OdooStockLot,
} from "@/lib/odoo/orders";
import { tabLines, type ProductionLine } from "@/lib/production/config";
import type { WarehouseSources } from "@/lib/production/warehouses";
import {
  groupByProduct,
  toOrderRow,
  todayIso,
  totalsFor,
  type LineTotals,
  type OrderRow,
  type ProductGroup,
} from "@/lib/orders/model";

export type OrdersLine = {
  key: string;
  label: string;
  categoryIds: number[];
  groups: ProductGroup[];
  totals: LineTotals;
};

export type OrdersData = {
  lines: OrdersLine[];
  /** Every late or overdue row, across all product lines. */
  late: OrderRow[];
  /** Rows whose product sits outside the three configured categories. */
  unclassified: OrderRow[];
  fetchedAt: string;
  today: string;
  error: string | null;
};

const EMPTY: Omit<OrdersData, "error"> = {
  lines: [],
  late: [],
  unclassified: [],
  fetchedAt: "",
  today: "",
};

/**
 * Everything the order schedule needs, in one pass.
 *
 * Returns an error string instead of throwing: Odoo being unreachable should
 * show a banner on an otherwise working page, not a crash.
 */
export async function fetchOrdersData(
  config: import("@/lib/production/config").ProductionConfig,
  sources: WarehouseSources
): Promise<OrdersData> {
  const today = todayIso();

  try {
    const lines = await fetchOpenOrderLines(sources.pickingTypeIds);
    const productIds = [...new Set(lines.map((line) => line.productId))];
    const stock = await fetchStockLevels(productIds, sources.stockLocationIds);
    let lots = new Map<number, OdooStockLot[]>();
    try {
      lots = await fetchStockLots(productIds, sources.stockLocationIds);
    } catch {
      // Lot names are extra detail on "covered". A missing field in Odoo
      // must not take the whole order schedule down.
    }

    const rows = lines.map((line) => toOrderRow(line, today));

    // Tabs come from the production_lines table, so adding a line or
    // repointing one at a different Odoo category needs no deploy.
    const configured: ProductionLine[] = tabLines(config);

    const byLine: OrdersLine[] = configured.map((productLine) => {
      const categoryIds = new Set(productLine.odooCategoryIds);
      // A line can span several categories, so a row belongs to the tab if it
      // matches any of them. Rows can therefore appear on two tabs, which is
      // the point - one view of Bettr Bowl and Pita together is allowed.
      const mine = rows.filter(
        (row) => row.categoryId !== null && categoryIds.has(row.categoryId)
      );
      const groups = groupByProduct(mine, stock, lots);
      return {
        key: productLine.key,
        label: productLine.name,
        categoryIds: [...categoryIds],
        groups,
        totals: totalsFor(groups),
      };
    });

    const knownIds = new Set<number>(
      configured.flatMap((line) => line.odooCategoryIds)
    );

    return {
      lines: byLine,
      late: rows
        .filter(
          (row) =>
            row.late && row.categoryId !== null && knownIds.has(row.categoryId)
        )
        .sort((a, b) => (a.neededBy ?? "").localeCompare(b.neededBy ?? "")),
      unclassified: rows.filter(
        (row) => row.categoryId === null || !knownIds.has(row.categoryId)
      ),
      fetchedAt: new Date().toISOString(),
      today,
      error: null,
    };
  } catch (error) {
    return {
      ...EMPTY,
      today,
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Could not reach Odoo",
    };
  }
}
