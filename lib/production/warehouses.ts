import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_PICKING_TYPE_IDS,
  STOCK_LOCATION_IDS,
} from "@/lib/odoo/constants";
import { isMissingTable } from "@/lib/supabase/missing";

/**
 * Odoo warehouses the order schedule is allowed to read.
 *
 * These used to be two constants (Avatar and Americold). They are business
 * configuration - a third 3PL or a warehouse that should stop appearing
 * should not need a deploy - so they live in a table an admin can edit.
 *
 * An empty or missing table falls back to the original pair, so the orders
 * page keeps working before the migration runs.
 */

export type ProductionWarehouse = {
  id: string;
  odooId: number;
  name: string;
  code: string | null;
  pickingTypeId: number;
  stockLocationId: number;
  sortOrder: number;
};

export type WarehouseSources = {
  warehouses: ProductionWarehouse[];
  pickingTypeIds: number[];
  stockLocationIds: number[];
  /** True when the table is missing or has never been saved. */
  usingFallback: boolean;
  /** True when the migration has not been run. Saves will not stick. */
  tableMissing: boolean;
};

export async function fetchWarehouseSources(
  supabase: SupabaseClient
): Promise<WarehouseSources> {
  const { data, error } = await supabase
    .from("production_warehouses")
    .select(
      "id, odoo_id, name, code, picking_type_id, stock_location_id, sort_order"
    )
    .order("sort_order")
    .order("name");

  if (error || !data || data.length === 0) {
    return {
      warehouses: [],
      pickingTypeIds: [...DELIVERY_PICKING_TYPE_IDS],
      stockLocationIds: [...STOCK_LOCATION_IDS],
      usingFallback: true,
      tableMissing: isMissingTable(error),
    };
  }

  const warehouses: ProductionWarehouse[] = data.map((row) => ({
    id: row.id as string,
    odooId: row.odoo_id as number,
    name: row.name as string,
    code: (row.code as string | null) ?? null,
    pickingTypeId: row.picking_type_id as number,
    stockLocationId: row.stock_location_id as number,
    sortOrder: (row.sort_order as number) ?? 0,
  }));

  return {
    warehouses,
    pickingTypeIds: warehouses.map((warehouse) => warehouse.pickingTypeId),
    stockLocationIds: warehouses.map((warehouse) => warehouse.stockLocationId),
    usingFallback: false,
    tableMissing: false,
  };
}
