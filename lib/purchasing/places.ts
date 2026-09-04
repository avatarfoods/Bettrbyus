import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/supabase/missing";

/**
 * Odoo companies Purchasing is allowed to read materials from.
 *
 * Same idea as production warehouses: an empty or missing table means
 * "everything the API user can see", so the catalog keeps working before
 * the migration runs. Once an admin saves a selection, only those places
 * are synced and shown.
 */

export type PurchasingPlace = {
  id: string;
  odooCompanyId: number;
  name: string;
  sortOrder: number;
};

export type PurchasingPlaces = {
  places: PurchasingPlace[];
  /** True when the table is missing or has never been saved. */
  usingFallback: boolean;
  /** True when the migration has not been run. Saves will not stick. */
  tableMissing: boolean;
};

export async function fetchPurchasingPlaces(
  supabase: SupabaseClient
): Promise<PurchasingPlaces> {
  const { data, error } = await supabase
    .from("purchasing_places")
    .select("id, odoo_company_id, name, sort_order")
    .order("sort_order")
    .order("name");

  if (error || !data || data.length === 0) {
    return {
      places: [],
      usingFallback: true,
      tableMissing: isMissingTable(error),
    };
  }

  return {
    places: data.map((row) => ({
      id: row.id as string,
      odooCompanyId: row.odoo_company_id as number,
      name: row.name as string,
      sortOrder: (row.sort_order as number) ?? 0,
    })),
    usingFallback: false,
    tableMissing: false,
  };
}

/** Null means every company (nothing saved yet). */
export function selectedCompanyIds(sources: PurchasingPlaces): number[] | null {
  if (sources.usingFallback) return null;
  return sources.places.map((place) => place.odooCompanyId);
}
