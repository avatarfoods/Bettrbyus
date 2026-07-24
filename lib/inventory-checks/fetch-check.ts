import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryCheckRecord } from "@/lib/inventory-checks/types";

export function getPreviousCheckDate(checkDate: string): string {
  const [year, month, day] = checkDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildEntryValuesMap(checks: InventoryCheckRecord[]) {
  const saved = new Map<
    string,
    { actualQuantity: number | null; notes: string | null }
  >();
  for (const check of checks) {
    for (const entry of check.inventory_check_entries ?? []) {
      saved.set(entry.inventory_check_item_id, {
        actualQuantity: entry.actual_quantity,
        notes: entry.notes,
      });
    }
  }
  return saved;
}

export function buildActualQuantityMap(checks: InventoryCheckRecord[]) {
  const quantities: Record<string, number | null> = {};
  for (const check of checks) {
    for (const entry of check.inventory_check_entries ?? []) {
      quantities[entry.inventory_check_item_id] = entry.actual_quantity;
    }
  }
  return quantities;
}

export async function fetchInventoryChecksForDate(
  supabase: SupabaseClient,
  checkDate: string
): Promise<{ data: InventoryCheckRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from("inventory_checks")
    .select(
      `
      id,
      check_date,
      department_id,
      checked_by,
      created_at,
      updated_at,
      inventory_check_entries (
        id,
        inventory_check_item_id,
        actual_quantity,
        notes
      ),
      checker:profiles!inventory_checks_checked_by_fkey (
        id,
        full_name,
        email
      ),
      departments!inventory_checks_department_id_fkey ( id, name )
    `
    )
    .eq("check_date", checkDate);

  if (error) {
    console.error("Failed to fetch inventory checks:", error);
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as InventoryCheckRecord[], error: null };
}
