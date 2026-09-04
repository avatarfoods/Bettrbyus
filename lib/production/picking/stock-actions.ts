"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { fetchWarehouseSources } from "@/lib/production/warehouses";
import { fetchStockLevels, fetchStockLots } from "@/lib/odoo/orders";

export type MaterialStock = {
  materialId: string;
  itemCode: string;
  name: string;
  company: string | null;
  odooProductId: number | null;
  /** From Odoo, at the configured stock locations. Null when Odoo failed. */
  onHand: number | null;
  incoming: number | null;
  outgoing: number | null;
  lots: { lotName: string; quantity: number; expiration: string | null }[];
  /** Odoo's Product Spec, as last read. */
  packSize: number | null;
  packUom: string | null;
  caseDescription: string | null;
  storage: string | null;
  packSyncedAt: string | null;
  /** The Bettrbyus-side count, for comparison. */
  countedOnHand: number | null;
  countedAt: string | null;
  error: string | null;
};

/**
 * What Odoo holds of one material, read live when the picker asks.
 *
 * The sheet shows the last inventory read as a number; this is the detail
 * behind it - each lot, how much, when it expires - fetched only for the row
 * somebody clicked, so the sheet itself stays fast.
 */
export async function fetchMaterialStock(materialId: string): Promise<MaterialStock | null> {
  if (!materialId) return null;
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return null;

  const [{ data: material }, { data: pick }, { data: counted }, warehouses] = await Promise.all([
    supabase
      .from("purchasing_materials")
      .select("id, item_code, name, odoo_product_id, odoo_company_name")
      .eq("id", materialId)
      .maybeSingle(),
    supabase
      .from("production_picking_materials")
      .select("pack_size, pack_uom, case_description, odoo_storage, pack_synced_at")
      .eq("material_id", materialId)
      .maybeSingle(),
    supabase
      .from("purchasing_current_inventory")
      .select("qty_on_hand, fetched_at")
      .eq("material_id", materialId)
      .maybeSingle(),
    fetchWarehouseSources(supabase),
  ]);
  if (!material) return null;

  const out: MaterialStock = {
    materialId,
    itemCode: material.item_code as string,
    name: material.name as string,
    company: (material.odoo_company_name as string | null) ?? null,
    odooProductId: material.odoo_product_id === null ? null : Number(material.odoo_product_id),
    onHand: null,
    incoming: null,
    outgoing: null,
    lots: [],
    packSize: pick?.pack_size === null || pick?.pack_size === undefined ? null : Number(pick.pack_size),
    packUom: (pick?.pack_uom as string | null) ?? null,
    caseDescription: (pick?.case_description as string | null) ?? null,
    storage: (pick?.odoo_storage as string | null) ?? null,
    packSyncedAt: (pick?.pack_synced_at as string | null) ?? null,
    countedOnHand: counted?.qty_on_hand === null || counted?.qty_on_hand === undefined ? null : Number(counted.qty_on_hand),
    countedAt: (counted?.fetched_at as string | null) ?? null,
    error: null,
  };

  if (out.odooProductId === null) {
    out.error = "Not linked to an Odoo product";
    return out;
  }

  try {
    const [levels, lots] = await Promise.all([
      fetchStockLevels([out.odooProductId], warehouses.stockLocationIds),
      fetchStockLots([out.odooProductId], warehouses.stockLocationIds),
    ]);
    const level = levels.get(out.odooProductId);
    if (level) {
      out.onHand = level.onHand;
      out.incoming = level.incoming;
      out.outgoing = level.outgoing;
    }
    out.lots = (lots.get(out.odooProductId) ?? [])
      .map((lot) => ({ lotName: lot.lotName, quantity: lot.quantity, expiration: lot.expiration }))
      .sort((a, b) => (a.expiration ?? "9999").localeCompare(b.expiration ?? "9999"));
  } catch (error) {
    out.error = error instanceof Error ? error.message : "Odoo could not be reached";
  }
  return out;
}
