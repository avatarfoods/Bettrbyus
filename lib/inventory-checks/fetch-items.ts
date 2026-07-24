import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryCheckItem } from "@/lib/inventory-checks/types";

export async function fetchInventoryCheckItems(
  supabase: SupabaseClient
): Promise<{ data: InventoryCheckItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from("inventory_check_items")
    .select(
      "id, department_id, item_code, item_name, par_quantity, unit, sort_order, departments!inventory_check_items_department_id_fkey ( id, name )"
    )
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch inventory check items:", error);
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as InventoryCheckItem[], error: null };
}
