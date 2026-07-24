import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveManualOnHand(
  supabase: SupabaseClient,
  materialId: string,
  qtyOnHand: number
): Promise<{ success: boolean }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("purchasing_inventory_snapshots").insert({
    material_id: materialId,
    qty_on_hand: qtyOnHand,
    source: "manual_override",
    fetched_at: new Date().toISOString(),
    created_by: user?.id ?? null,
  });

  if (error) {
    console.error("Failed to save manual on-hand override:", error);
    return { success: false };
  }

  return { success: true };
}
