"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  fetchOdooCompanies,
  fetchOdooProductDetail,
  fetchOdooProducts,
  type OdooProduct,
  type OdooProductDetail,
} from "@/lib/purchasing/odoo";
import { fetchPurchasingPlaces, selectedCompanyIds } from "@/lib/purchasing/places";
import type { SyncResult } from "@/lib/purchasing/types";

export type ProductDetailResult =
  | {
      ok: true;
      odoo: OdooProductDetail | null;
      odooFormUrl: string | null;
      material: {
        id: string;
        item_code: string;
        name: string;
        odoo_product_id: number | null;
        odoo_category: string | null;
        storage_type: string | null;
        lbs_per_case: number | null;
        is_protein: boolean;
        thaw_buffer_days: number;
        lead_time_days: number;
        price: number | null;
        on_hand: number | null;
        on_hand_source: string | null;
        on_hand_fetched_at: string | null;
      };
      odooError?: string;
    }
  | { ok: false; message: string };

const CHUNK_SIZE = 500;

type CompanyProduct = OdooProduct & { companyId: number; companyName: string };

function dedupeByCode(products: CompanyProduct[]): Map<string, CompanyProduct> {
  const byCode = new Map<string, CompanyProduct>();
  for (const product of products) {
    const code = typeof product.default_code === "string" ? product.default_code.trim() : "";
    if (!code) continue;
    // Prefer active products when Odoo has duplicate internal references
    // (including one item code appearing in more than one company).
    const existing = byCode.get(code);
    if (!existing || (!existing.active && product.active)) {
      byCode.set(code, product);
    }
  }
  return byCode;
}

/**
 * Every purchased material, tagged with the Odoo company it was bought
 * under (Tuscany Cookies, AvatarNaturalFoods, Yaya's, …) - materials are
 * purchased per company, not shared across them, so this is what lets the
 * Materials page and Master PO filter/select "just this place".
 */
async function fetchAllCompanyProducts(
  companyIds?: number[] | null
): Promise<CompanyProduct[]> {
  const companies = await fetchOdooCompanies();
  const wanted =
    companyIds && companyIds.length > 0
      ? companies.filter((company) => companyIds.includes(company.id))
      : companies;
  const allProducts: CompanyProduct[] = [];
  for (const company of wanted) {
    const products = await fetchOdooProducts(company.id);
    for (const product of products) {
      allProducts.push({
        ...product,
        companyId: company.id,
        companyName: company.name,
      });
    }
  }
  return allProducts;
}

/**
 * Sync the materials catalog from Odoo (product.product).
 * Only catalog fields are written; app-managed purchasing fields
 * (lead time, thaw buffer, protein flag, lbs/case, storage type) are untouched.
 */
export async function syncOdooMaterials(): Promise<SyncResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to sync materials." };
  }

  const places = await fetchPurchasingPlaces(supabase);
  const companyIds = selectedCompanyIds(places);

  let products: CompanyProduct[];
  try {
    products = await fetchAllCompanyProducts(companyIds);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Odoo sync failed." };
  }

  const byCode = dedupeByCode(products);
  if (byCode.size === 0) {
    return {
      ok: false,
      message: companyIds
        ? "Odoo returned no products for the selected places."
        : "Odoo returned no products with an internal reference.",
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("purchasing_materials")
    .select("item_code");
  if (existingError) {
    return { ok: false, message: `Could not read materials: ${existingError.message}` };
  }
  const existingCodes = new Set((existing ?? []).map((row) => row.item_code));

  const now = new Date().toISOString();
  const rows = Array.from(byCode.entries()).map(([code, product]) => ({
    item_code: code,
    name: product.name,
    odoo_product_id: product.id,
    odoo_category: Array.isArray(product.categ_id) ? product.categ_id[1] : null,
    odoo_company_id: product.companyId,
    odoo_company_name: product.companyName,
    active: product.active,
    last_synced_at: now,
    updated_at: now,
  }));

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from("purchasing_materials")
      .upsert(chunk, { onConflict: "item_code" });
    if (error) {
      return { ok: false, message: `Materials sync failed: ${error.message}` };
    }
  }

  const created = rows.filter((row) => !existingCodes.has(row.item_code)).length;

  // A material explicitly tagged to a company outside the current place
  // selection no longer belongs in an active catalog scoped to "just this
  // place" - retire it (not delete: old PO lines and on-hand history still
  // resolve). Materials with no company tag at all are left alone here;
  // those are either legacy rows this sync just re-tagged above, or a
  // one-time historical backlog from before per-company tagging existed.
  if (companyIds && companyIds.length > 0) {
    const { error: retireError } = await supabase
      .from("purchasing_materials")
      .update({ active: false, updated_at: now })
      .eq("active", true)
      .not("odoo_company_id", "is", null)
      .not("odoo_company_id", "in", `(${companyIds.join(",")})`);
    if (retireError) {
      return {
        ok: false,
        message: `Materials sync failed while retiring other places: ${retireError.message}`,
      };
    }
  }

  revalidatePath("/purchasing/materials");
  revalidatePath("/purchasing");

  return {
    ok: true,
    created,
    updated: rows.length - created,
    message: `Synced ${rows.length} materials from Odoo (${created} new).`,
  };
}

/**
 * Sync catalog + on-hand in one shot. One Odoo fetch, then upsert materials
 * and write inventory snapshots.
 */
export async function syncFromOdoo(): Promise<SyncResult> {
  const catalogResult = await syncOdooMaterials();
  if (!catalogResult.ok) return catalogResult;

  const inventoryResult = await syncOdooInventory();
  if (!inventoryResult.ok) {
    return {
      ok: false,
      message: `Catalog synced, but on-hand failed: ${inventoryResult.message}`,
      created: catalogResult.created,
      updated: catalogResult.updated,
    };
  }

  return {
    ok: true,
    created: catalogResult.created,
    updated: catalogResult.updated,
    snapshots: inventoryResult.snapshots,
    message: `Synced from Odoo: ${catalogResult.created ?? 0} new materials, ${
      inventoryResult.snapshots ?? 0
    } on-hand quantities.`,
  };
}

/**
 * Snapshot current on-hand quantities from Odoo for all known materials.
 */
export async function syncOdooInventory(): Promise<SyncResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to sync inventory." };
  }

  const places = await fetchPurchasingPlaces(supabase);
  const companyIds = selectedCompanyIds(places);

  let products: CompanyProduct[];
  try {
    products = await fetchAllCompanyProducts(companyIds);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Odoo sync failed." };
  }

  const byCode = dedupeByCode(products);

  const { data: materials, error: materialsError } = await supabase
    .from("purchasing_materials")
    .select("id, item_code");
  if (materialsError) {
    return { ok: false, message: `Could not read materials: ${materialsError.message}` };
  }

  const fetchedAt = new Date().toISOString();
  const snapshots = (materials ?? [])
    .filter((material) => byCode.has(material.item_code))
    .map((material) => ({
      material_id: material.id,
      qty_on_hand: byCode.get(material.item_code)!.qty_available ?? 0,
      source: "odoo_api" as const,
      fetched_at: fetchedAt,
      created_by: user.id,
    }));

  if (snapshots.length === 0) {
    return {
      ok: false,
      message: "No materials matched Odoo products. Run the materials sync first.",
    };
  }

  for (let i = 0; i < snapshots.length; i += CHUNK_SIZE) {
    const chunk = snapshots.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("purchasing_inventory_snapshots").insert(chunk);
    if (error) {
      return { ok: false, message: `Inventory sync failed: ${error.message}` };
    }
  }

  revalidatePath("/purchasing/materials");
  revalidatePath("/purchasing");

  return {
    ok: true,
    snapshots: snapshots.length,
    message: `Saved on-hand quantities for ${snapshots.length} materials.`,
  };
}

/**
 * Load local purchasing settings + live Odoo product fields for the detail dialog.
 */
export async function getProductDetail(materialId: string): Promise<ProductDetailResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in." };
  }

  const { data: material, error: materialError } = await supabase
    .from("purchasing_materials")
    .select(
      "id, item_code, name, odoo_product_id, odoo_category, storage_type, lbs_per_case, is_protein, thaw_buffer_days, lead_time_days, price"
    )
    .eq("id", materialId)
    .single();

  if (materialError || !material) {
    return { ok: false, message: materialError?.message ?? "Material not found." };
  }

  const { data: inventory } = await supabase
    .from("purchasing_current_inventory")
    .select("qty_on_hand, source, fetched_at")
    .eq("material_id", materialId)
    .maybeSingle();

  let odoo: OdooProductDetail | null = null;
  let odooError: string | undefined;
  try {
    odoo = await fetchOdooProductDetail({
      odooProductId: material.odoo_product_id,
      itemCode: material.item_code,
    });
    if (!odoo) {
      odooError = "No matching product found in Odoo.";
    }
  } catch (error) {
    odooError = error instanceof Error ? error.message : "Could not reach Odoo.";
  }

  const baseUrl = process.env.ODOO_URL?.replace(/\/$/, "") ?? null;
  const odooFormUrl =
    odoo && baseUrl
      ? `${baseUrl}/web#id=${odoo.id}&model=product.product&view_type=form`
      : null;

  return {
    ok: true,
    odoo,
    odooFormUrl,
    odooError,
    material: {
      ...material,
      on_hand: inventory?.qty_on_hand ?? null,
      on_hand_source: inventory?.source ?? null,
      on_hand_fetched_at: inventory?.fetched_at ?? null,
    },
  };
}
