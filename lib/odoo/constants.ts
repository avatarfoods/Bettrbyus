/**
 * Odoo identifiers that both server and browser code need.
 *
 * Kept apart from lib/odoo/orders.ts on purpose: that module holds credentials
 * and RPC calls, so importing a constant from it would drag the Odoo client
 * into the browser bundle.
 */

/** Delivery-order operation types: AvatarNaturalFoods (2) and Americold (110). */
export const DELIVERY_PICKING_TYPE_IDS = [2, 110];

/** Stock locations that count: WH1/Stock and AW/Stock. Everything else ignored. */
export const STOCK_LOCATION_IDS = [8, 258];

/** Product categories that become tabs. */
export const PRODUCT_LINES = [
  { id: 80, key: "bettr-bowl", label: "Bettr Bowl" },
  { id: 79, key: "pita", label: "Pita" },
  { id: 85, key: "pizza-cupcake", label: "Pizza Cupcake" },
] as const;

export type ProductLineKey = (typeof PRODUCT_LINES)[number]["key"];

/**
 * "2. On Production" is stored as the literal string "NOT USED" - whoever set
 * up the selection renamed the labels but left the placeholder values. Writing
 * anything else puts the record in a state Odoo will not display.
 */
export const PROGRESS_ON_PRODUCTION = "NOT USED";
