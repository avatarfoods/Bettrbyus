import type { SupabaseClient } from "@supabase/supabase-js";
import type { Material, MaterialWithOnHand } from "@/lib/purchasing/types";

type CurrentInventoryRow = {
  material_id: string;
  qty_on_hand: number;
  source: "odoo_api" | "file_upload" | "manual_override";
  fetched_at: string;
};

export async function fetchMaterialsWithOnHand(
  supabase: SupabaseClient
): Promise<{ data: MaterialWithOnHand[]; error: string | null }> {
  const [materialsResult, inventoryResult] = await Promise.all([
    supabase
      .from("purchasing_materials")
      .select(
        "id, item_code, name, odoo_product_id, odoo_category, storage_type, lbs_per_case, is_protein, thaw_buffer_days, lead_time_days, price, active, last_synced_at"
      )
      .order("item_code", { ascending: true }),
    supabase
      .from("purchasing_current_inventory")
      .select("material_id, qty_on_hand, source, fetched_at"),
  ]);

  if (materialsResult.error) {
    console.error("Failed to fetch purchasing materials:", materialsResult.error);
    return { data: [], error: materialsResult.error.message };
  }
  if (inventoryResult.error) {
    console.error("Failed to fetch current inventory:", inventoryResult.error);
    return { data: [], error: inventoryResult.error.message };
  }

  const inventoryByMaterial = new Map<string, CurrentInventoryRow>(
    ((inventoryResult.data ?? []) as CurrentInventoryRow[]).map((row) => [
      row.material_id,
      row,
    ])
  );

  const data = ((materialsResult.data ?? []) as Material[]).map((material) => {
    const inventory = inventoryByMaterial.get(material.id);
    return {
      ...material,
      on_hand: inventory?.qty_on_hand ?? null,
      on_hand_source: inventory?.source ?? null,
      on_hand_fetched_at: inventory?.fetched_at ?? null,
    };
  });

  return { data, error: null };
}
