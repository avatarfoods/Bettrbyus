import { odooSession } from "@/lib/odoo/client";
import {
  DELIVERY_PICKING_TYPE_IDS,
  PROGRESS_ON_PRODUCTION,
  STOCK_LOCATION_IDS,
} from "@/lib/odoo/constants";

/**
 * Delivery orders and stock, read straight from Odoo.
 *
 * This replaces re-typing every sales order into a spreadsheet. Odoo already
 * holds all of it; what it will not do is show one grouped, summed view across
 * orders, which is the only reason the sheet existed.
 *
 * Field names below were confirmed against the live database - this Odoo has
 * several Studio fields with identical labels, and only one of each pair is
 * actually populated. See the comments for which and why.
 */

export {
  DELIVERY_PICKING_TYPE_IDS,
  PRODUCT_LINES,
  PROGRESS_ON_PRODUCTION,
  STOCK_LOCATION_IDS,
  type ProductLineKey,
} from "@/lib/odoo/constants";


// Confirmed by usage across the 400 most recent transfers: the twin fields
// x_studio_needed_by, x_studio_so_completion_date, x_studio_production_completion_date
// and x_studio_customer_po_reference are all empty on every record.
const F_NEEDED_BY = "x_studio_needed_by_1";
const F_COMPLETION_DATE = "x_studio_completion_date";
const F_PROGRESS = "x_studio_progress";
const F_CUSTOMER_REF = "x_studio_related_field_4ch_1jajv1ua1";

export type OdooOrderLine = {
  /** stock.move id. */
  id: number;
  pickingId: number;
  /** Transfer reference, e.g. WH1/OUT/03608. */
  pickingName: string;
  /** Sales order number from the Source Document. */
  saleOrder: string | null;
  customer: string | null;
  /** Customer Reference - what the sheet calls AVATAR PO#. */
  customerRef: string | null;
  productId: number;
  itemCode: string | null;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  /** Cases ordered. */
  qtyNeeded: number;
  uom: string | null;
  /** When the customer needs it. */
  neededBy: string | null;
  /** Production completion date - the one field the floor sets. */
  completionDate: string | null;
  progress: string | null;
  state: string;
  warehouse: string | null;
};

export type OdooStockLevel = {
  productId: number;
  itemCode: string | null;
  onHand: number;
  outgoing: number;
  incoming: number;
};

type Many2One = [number, string] | false;

function m2oId(value: unknown): number | null {
  return Array.isArray(value) && typeof value[0] === "number" ? value[0] : null;
}
function m2oName(value: unknown): string | null {
  return Array.isArray(value) && typeof value[1] === "string" ? value[1] : null;
}
function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
/** Odoo returns false for empty dates; normalise to yyyy-mm-dd or null. */
function dateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.slice(0, 10);
}

/**
 * Every open delivery line out of the two warehouses that matter.
 *
 * Cancelled and completed transfers are excluded: a finished order is not
 * something anyone needs to schedule.
 */
export async function fetchOpenOrderLines(): Promise<OdooOrderLine[]> {
  const { call } = await odooSession();

  const pickings = (await call(
    "stock.picking",
    "search_read",
    [
      [
        ["picking_type_id", "in", DELIVERY_PICKING_TYPE_IDS],
        ["state", "not in", ["cancel", "done"]],
      ],
    ],
    {
      fields: [
        "id",
        "name",
        "origin",
        "state",
        "date_deadline",
        "partner_id",
        "picking_type_id",
        F_NEEDED_BY,
        F_COMPLETION_DATE,
        F_PROGRESS,
        F_CUSTOMER_REF,
      ],
      limit: 2000,
      order: "id desc",
    }
  )) as Record<string, unknown>[];

  if (pickings.length === 0) return [];

  const pickingById = new Map(pickings.map((p) => [p.id as number, p]));
  const pickingIds = pickings.map((p) => p.id as number);

  // Chunked: a domain with a couple of thousand ids is slow and can be refused.
  const moves: Record<string, unknown>[] = [];
  for (let i = 0; i < pickingIds.length; i += 200) {
    const chunk = (await call(
      "stock.move",
      "search_read",
      [[["picking_id", "in", pickingIds.slice(i, i + 200)]]],
      {
        fields: ["id", "picking_id", "product_id", "product_uom_qty", "product_uom", "state"],
        limit: 10000,
      }
    )) as Record<string, unknown>[];
    moves.push(...chunk);
  }

  const productIds = [
    ...new Set(moves.map((m) => m2oId(m.product_id)).filter((v): v is number => v !== null)),
  ];

  const products = (await call("product.product", "read", [productIds], {
    fields: ["id", "default_code", "name", "categ_id"],
  })) as Record<string, unknown>[];
  const productById = new Map(products.map((p) => [p.id as number, p]));

  const lines: OdooOrderLine[] = [];

  for (const move of moves) {
    const pickingId = m2oId(move.picking_id);
    const productId = m2oId(move.product_id);
    if (pickingId === null || productId === null) continue;

    const picking = pickingById.get(pickingId);
    const product = productById.get(productId);
    if (!picking || !product) continue;

    lines.push({
      id: move.id as number,
      pickingId,
      pickingName: (picking.name as string) ?? "",
      saleOrder: textOrNull(picking.origin),
      customer: m2oName(picking.partner_id),
      customerRef: textOrNull(picking[F_CUSTOMER_REF]),
      productId,
      itemCode: textOrNull(product.default_code),
      productName: (product.name as string) ?? "",
      categoryId: m2oId(product.categ_id),
      categoryName: m2oName(product.categ_id),
      qtyNeeded: num(move.product_uom_qty),
      uom: m2oName(move.product_uom),
      // date_deadline is the fallback when nobody filled the Studio field.
      neededBy:
        dateOrNull(picking[F_NEEDED_BY]) ?? dateOrNull(picking.date_deadline),
      completionDate: dateOrNull(picking[F_COMPLETION_DATE]),
      progress: textOrNull(picking[F_PROGRESS]),
      state: (picking.state as string) ?? "",
      warehouse: m2oName(picking.picking_type_id),
    });
  }

  return lines;
}

/**
 * On hand / outgoing / incoming for the given products, counted only in
 * WH1/Stock and AW/Stock. The location context is what scopes it - without it
 * Odoo sums all twenty warehouses and the numbers are meaningless here.
 */
export async function fetchStockLevels(
  productIds: number[]
): Promise<Map<number, OdooStockLevel>> {
  const levels = new Map<number, OdooStockLevel>();
  if (productIds.length === 0) return levels;

  const { call } = await odooSession();

  for (let i = 0; i < productIds.length; i += 200) {
    const rows = (await call("product.product", "read", [productIds.slice(i, i + 200)], {
      fields: ["id", "default_code", "qty_available", "outgoing_qty", "incoming_qty"],
      context: { location: STOCK_LOCATION_IDS },
    })) as Record<string, unknown>[];

    for (const row of rows) {
      levels.set(row.id as number, {
        productId: row.id as number,
        itemCode: textOrNull(row.default_code),
        onHand: num(row.qty_available),
        outgoing: num(row.outgoing_qty),
        incoming: num(row.incoming_qty),
      });
    }
  }

  return levels;
}

export type OdooCategory = {
  id: number;
  name: string;
  /** Full path, e.g. "All / Saleable / 50104 Bettrs Bowl". */
  fullName: string;
};

/**
 * Saleable product categories, for the line picker in Production settings.
 *
 * Nobody should have to know that Bettr Bowl is category 80 - they pick the
 * name and the id is stored behind it.
 */
export async function fetchSaleableCategories(): Promise<OdooCategory[]> {
  const { call } = await odooSession();

  const rows = (await call(
    "product.category",
    "search_read",
    [[["complete_name", "like", "Saleable"]]],
    { fields: ["id", "name", "complete_name"], limit: 200 }
  )) as Record<string, unknown>[];

  return rows
    .map((row) => ({
      id: row.id as number,
      name: (row.name as string) ?? "",
      fullName: (row.complete_name as string) ?? "",
    }))
    // "All / Saleable" itself is a parent, not something to point a line at.
    .filter((category) => category.fullName !== "All / Saleable")
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Sets the production Completion Date on a transfer. */
export async function setCompletionDate(
  pickingId: number,
  date: string | null
): Promise<void> {
  const { call } = await odooSession();
  await call("stock.picking", "write", [
    [pickingId],
    { [F_COMPLETION_DATE]: date ?? false },
  ]);
}

/** Moves a transfer to "2. On Production". */
export async function setOnProduction(pickingId: number): Promise<void> {
  const { call } = await odooSession();
  await call("stock.picking", "write", [
    [pickingId],
    { [F_PROGRESS]: PROGRESS_ON_PRODUCTION },
  ]);
}

export type Many2OneValue = Many2One;
