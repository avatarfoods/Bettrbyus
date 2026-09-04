import type { SupabaseClient } from "@supabase/supabase-js";
import type { PurchasingMaterialFormValues } from "@/lib/validations/purchasing-material";
import type { Material } from "@/lib/purchasing/types";

export const MATERIAL_SAVE_ERROR_MESSAGE =
  "Could not save the material. Please try again.";

export async function updatePurchasingMaterial(
  supabase: SupabaseClient,
  materialId: string,
  values: PurchasingMaterialFormValues
): Promise<{ success: true; data: Material } | { success: false }> {
  const { data, error } = await supabase
    .from("purchasing_materials")
    .update({
      storage_type: values.storageType,
      purchasing_category: values.purchasingCategory,
      lbs_per_case: values.lbsPerCase,
      is_protein: values.isProtein,
      thaw_buffer_days: values.thawBufferDays,
      lead_time_days: values.leadTimeDays,
      updated_at: new Date().toISOString(),
    })
    .eq("id", materialId)
    .select(
      "id, item_code, name, odoo_product_id, odoo_category, storage_type, purchasing_category, lbs_per_case, is_protein, thaw_buffer_days, lead_time_days, price, active, last_synced_at"
    )
    .single();

  if (error || !data) {
    console.error("Failed to update purchasing material:", error);
    return { success: false };
  }

  return { success: true, data: data as Material };
}
