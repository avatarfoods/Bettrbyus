import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getProfileDisplayName,
  getProfileSummary,
  type InventoryCheckItemHistoryRecord,
} from "@/lib/inventory-checks/types";

export async function fetchInventoryCheckItemHistory(
  supabase: SupabaseClient,
  itemId: string
): Promise<{ data: InventoryCheckItemHistoryRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from("inventory_check_entries")
    .select(
      `
      id,
      actual_quantity,
      notes,
      inventory_checks!inner (
        check_date,
        checker:profiles!inventory_checks_checked_by_fkey (
          id,
          full_name,
          email
        )
      )
    `
    )
    .eq("inventory_check_item_id", itemId);

  if (error) {
    console.error("Failed to fetch inventory check item history:", error);
    return { data: [], error: error.message };
  }

  const records = (data ?? []).flatMap((row) => {
    const check = Array.isArray(row.inventory_checks)
      ? row.inventory_checks[0]
      : row.inventory_checks;

    if (!check) return [];

    return [
      {
        id: row.id as string,
        checkDate: check.check_date as string,
        actualQuantity: row.actual_quantity as number | null,
        notes: row.notes as string | null,
        checker: check.checker as InventoryCheckItemHistoryRecord["checker"],
        checkerName: getProfileDisplayName(
          getProfileSummary(
            check.checker as InventoryCheckItemHistoryRecord["checker"]
          )
        ),
      } satisfies InventoryCheckItemHistoryRecord,
    ];
  });

  records.sort((a, b) => b.checkDate.localeCompare(a.checkDate));

  return { data: records, error: null };
}
