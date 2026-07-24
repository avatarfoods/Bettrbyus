import type { SupabaseClient } from "@supabase/supabase-js";
import {
  inventoryCheckSubmitSchema,
  type InventoryCheckSubmitInput,
} from "@/lib/validations/inventory-check";

export const INVENTORY_CHECK_SUBMIT_ERROR_MESSAGE =
  "Something went wrong while saving this inventory check. Please contact your manager.";

export const INVENTORY_CHECK_SUBMIT_SUCCESS_MESSAGE =
  "Inventory check saved successfully.";

type ItemDepartmentMap = Map<string, string>;

function groupEntriesByDepartment(
  entries: InventoryCheckSubmitInput["entries"],
  itemDepartmentMap: ItemDepartmentMap
) {
  const grouped = new Map<
    string,
    InventoryCheckSubmitInput["entries"]
  >();

  for (const entry of entries) {
    const hasValue =
      entry.actualQuantity != null ||
      (entry.notes != null && entry.notes.trim() !== "");
    if (!hasValue) continue;

    const departmentId = itemDepartmentMap.get(entry.itemId);
    if (!departmentId) continue;

    const existing = grouped.get(departmentId) ?? [];
    existing.push(entry);
    grouped.set(departmentId, existing);
  }

  return grouped;
}

export async function submitInventoryCheck(
  supabase: SupabaseClient,
  input: InventoryCheckSubmitInput,
  itemDepartmentMap: ItemDepartmentMap
): Promise<{ success: true } | { success: false; message?: string }> {
  const parsed = inventoryCheckSubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Invalid inventory check data." };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false };
  }

  const grouped = groupEntriesByDepartment(parsed.data.entries, itemDepartmentMap);
  const now = new Date().toISOString();

  for (const [departmentId, entries] of grouped) {
    const { data: check, error: checkError } = await supabase
      .from("inventory_checks")
      .upsert(
        {
          check_date: parsed.data.checkDate,
          department_id: departmentId,
          checked_by: user.id,
          updated_at: now,
        },
        { onConflict: "check_date,department_id" }
      )
      .select("id")
      .single();

    if (checkError || !check) {
      console.error("Failed to upsert inventory check:", checkError);
      return { success: false };
    }

    const rows = entries.map((entry) => ({
      inventory_check_id: check.id,
      inventory_check_item_id: entry.itemId,
      actual_quantity: entry.actualQuantity ?? null,
      notes: entry.notes?.trim() ? entry.notes.trim() : null,
    }));

    const { error: entriesError } = await supabase
      .from("inventory_check_entries")
      .upsert(rows, { onConflict: "inventory_check_id,inventory_check_item_id" });

    if (entriesError) {
      console.error("Failed to upsert inventory check entries:", entriesError);
      return { success: false };
    }
  }

  return { success: true };
}
