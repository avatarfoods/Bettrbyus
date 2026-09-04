import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingSchema } from "@/lib/supabase/missing";
import { odooSession } from "@/lib/odoo/client";
import { tabLines, type ProductionConfig } from "@/lib/production/config";
import type { FinishedProduct } from "@/lib/finished-products/model";

/**
 * Finished product specs, plus the Odoo products they can be attached to.
 *
 * The product is created in Odoo; the spec is created here and linked to it.
 * The picker only offers products from the categories the production lines
 * point at, so nobody attaches a spec to a raw material by accident.
 */

export type OdooFinishedOption = {
  odooProductId: number;
  itemCode: string;
  name: string;
  categoryName: string | null;
  /** True when a spec already exists for it. */
  taken: boolean;
};

export type FinishedProductsData = {
  products: FinishedProduct[];
  options: OdooFinishedOption[];
  missingTable: boolean;
  odooError: string | null;
};

type Row = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toProduct(row: Row): FinishedProduct {
  return {
    id: row.id as string,
    odooProductId: num(row.odoo_product_id) ?? 0,
    itemCode: (row.item_code as string) ?? "",
    name: (row.name as string) ?? "",
    customerGroup: str(row.customer_group),
    storageType: (str(row.storage_type) as FinishedProduct["storageType"]) ?? null,

    bowlsPerCase: num(row.bowls_per_case),
    caseUnit: str(row.case_unit),
    productsPerCase: (row.products_per_case as number) ?? 1,
    netWeightPerCase: num(row.net_weight_per_case),

    caseGtin: str(row.case_gtin),
    unitUpc: str(row.unit_upc),
    labelUrl: str(row.label_url),
    labelFilename: str(row.label_filename),
    artworkOwner:
      (str(row.artwork_owner) as FinishedProduct["artworkOwner"]) ?? "avatar",

    casesPerLayer: num(row.cases_per_layer),
    layersHigh: num(row.layers_high),
    caseWidthIn: num(row.case_width_in),
    caseLengthIn: num(row.case_length_in),
    caseHeightIn: num(row.case_height_in),
    palletBaseHeightIn: num(row.pallet_base_height_in),
    maxPalletHeightIn: num(row.max_pallet_height_in),
    palletsPerStack: (row.pallets_per_stack as number) ?? 1,
    partialPolicy:
      (str(row.partial_policy) as FinishedProduct["partialPolicy"]) ?? "accepted",

    shelfLifeValue: num(row.shelf_life_value),
    shelfLifeUnit:
      (str(row.shelf_life_unit) as FinishedProduct["shelfLifeUnit"]) ?? "months",
    expirationOffsetDays: (row.expiration_offset_days as number) ?? -1,
    lotFormat: (str(row.lot_format) as string) ?? "MMDDYYYY",

    ingredientStatement: str(row.ingredient_statement),
    handlingInstructions: str(row.handling_instructions),
    heatingInstructions: str(row.heating_instructions),
    guaranteedShelfLifeDays: num(row.guaranteed_shelf_life_days),
    palletWeightLb: num(row.pallet_weight_lb),
    caseWeightLb: num(row.case_weight_lb),

    validFrom: (row.valid_from as string) ?? "",
    active: (row.active as boolean) ?? true,
    notes: str(row.notes),
  };
}

export async function fetchFinishedProducts(
  supabase: SupabaseClient,
  config: ProductionConfig
): Promise<FinishedProductsData> {
  const specResult = await supabase
    .from("finished_products")
    .select("*")
    .order("item_code");

  if (specResult.error) {
    return { products: [], options: [], missingTable: true, odooError: null };
  }

  const products = ((specResult.data ?? []) as Row[]).map(toProduct);
  const taken = new Set(products.map((p) => p.odooProductId));

  const { options, error: odooError } = await fetchOdooFinishedOptions(
    config,
    taken
  );

  return { products, options, missingTable: false, odooError };
}

/**
 * Finished-goods products to choose from in Odoo.
 *
 * Split out so a recipe page can offer the picker without first reading every
 * specification in the table. Odoo being unreachable is returned rather than
 * thrown - the spec form still works, it just cannot offer the list.
 */
export async function fetchOdooFinishedOptions(
  config: ProductionConfig,
  taken: Set<number> = new Set()
): Promise<{ options: OdooFinishedOption[]; error: string | null }> {
  const categoryIds = tabLines(config).flatMap((line) => line.odooCategoryIds);
  if (categoryIds.length === 0) return { options: [], error: null };

  try {
    const { call } = await odooSession();
    const rows = (await call(
      "product.product",
      "search_read",
      [[["categ_id", "in", categoryIds], ["default_code", "!=", false]]],
      { fields: ["id", "default_code", "name", "categ_id"], limit: 500 }
    )) as Row[];

    const options = rows
      .map((row) => ({
        odooProductId: row.id as number,
        itemCode: (row.default_code as string) ?? "",
        name: (row.name as string) ?? "",
        categoryName: Array.isArray(row.categ_id)
          ? ((row.categ_id as [number, string])[1] ?? null)
          : null,
        taken: taken.has(row.id as number),
      }))
      .sort((a, b) => a.itemCode.localeCompare(b.itemCode));

    return { options, error: null };
  } catch (error) {
    return {
      options: [],
      error: error instanceof Error ? error.message : "Could not reach Odoo",
    };
  }
}

export async function fetchFinishedProduct(
  supabase: SupabaseClient,
  id: string
): Promise<FinishedProduct | null> {
  const { data, error } = await supabase
    .from("finished_products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return toProduct(data as Row);
}

/**
 * The specification attached to a recipe, if it has one.
 *
 * Returns whether the table is missing separately from whether the spec is
 * missing: the first is "run the migration", the second is "nobody has filled
 * this in yet", and the recipe page says something different for each.
 */
export async function fetchSpecForRecipe(
  supabase: SupabaseClient,
  recipeId: string
): Promise<{ spec: FinishedProduct | null; missingTable: boolean }> {
  const { data, error } = await supabase
    .from("finished_products")
    .select("*")
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (error) {
    // 42P01 table missing; 42703 / PGRST204 the recipe_id column not added
    // yet (Postgres and PostgREST report it differently). All three mean "run
    // the migration", and none should take the recipe page down.
    return { spec: null, missingTable: isMissingSchema(error) };
  }
  return {
    spec: data ? toProduct(data as Row) : null,
    missingTable: false,
  };
}
