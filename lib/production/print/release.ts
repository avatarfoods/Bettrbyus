import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductionDayPrint } from "@/lib/production/print/build";
import { fetchSpecForRecipe } from "@/lib/finished-products/fetch";
import { expirationFor, lotFor, palletMath } from "@/lib/finished-products/model";

/**
 * One finished product on the release sheet.
 *
 * The workbook printed one line per pallet: 500 cases at 135 per pallet space
 * is four lines of the same product, each signed on its own. The pallet space
 * comes from the specification (cases per layer × layers × pallets stacked);
 * a product without one gets a single line rather than a guess.
 */
export type ReleaseProduct = {
  recipeId: string;
  wipCode: string;
  name: string;
  quantity: number;
  uom: string | null;
  /** Cases per pallet space from the spec, or null when there is no spec. */
  perSpace: number | null;
  /** Lines to print: ceil(quantity / perSpace), at least one. */
  pallets: number;
  lot: string;
  expiration: string | null;
  hasSpec: boolean;
};

export async function buildReleaseProducts(
  supabase: SupabaseClient,
  day: ProductionDayPrint,
  onlyRecipeIds?: Set<string> | null
): Promise<ReleaseProduct[]> {
  const rows = onlyRecipeIds
    ? day.finished.filter((row) => onlyRecipeIds.has(row.recipeId))
    : day.finished;

  const out: ReleaseProduct[] = [];
  for (const row of rows) {
    const { spec } = await fetchSpecForRecipe(supabase, row.recipeId);
    const perSpace = spec ? palletMath(spec).casesPerPalletSpace : null;
    const pallets =
      perSpace && perSpace > 0 ? Math.max(1, Math.ceil(row.quantity / perSpace - 1e-9)) : 1;
    out.push({
      recipeId: row.recipeId,
      wipCode: row.wipCode,
      name: row.name,
      quantity: row.quantity,
      uom: row.uom,
      perSpace,
      pallets,
      lot: spec ? lotFor(spec, day.date) : "",
      expiration: spec ? expirationFor(spec, day.date) : null,
      hasSpec: spec !== null,
    });
  }
  return out;
}

/** The comma list in the URL, as a set. Null when nothing was chosen. */
export function recipeFilter(param: string | undefined): Set<string> | null {
  if (!param) return null;
  const ids = param.split(",").map((id) => id.trim()).filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}
