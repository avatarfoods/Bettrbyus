import type { SupabaseClient } from "@supabase/supabase-js";
import {
  inventoryCheckTemplateItemSchema,
  type InventoryCheckTemplateItemInput,
} from "@/lib/validations/inventory-check-template";
import type { InventoryCheckItem } from "@/lib/inventory-checks/types";

export const TEMPLATE_ITEM_SAVE_ERROR_MESSAGE =
  "Something went wrong while saving this item. Please contact your manager.";

function normalizeUnit(unit: string | null | undefined) {
  const trimmed = unit?.trim();
  return trimmed ? trimmed : null;
}

function toDbRow(input: InventoryCheckTemplateItemInput) {
  return {
    department_id: input.departmentId,
    item_code: input.itemCode.trim(),
    item_name: input.itemName.trim(),
    par_quantity: input.parQuantity ?? null,
    unit: normalizeUnit(input.unit),
  };
}

export async function updateInventoryCheckTemplateItem(
  supabase: SupabaseClient,
  itemId: string,
  input: InventoryCheckTemplateItemInput
): Promise<{ success: true; data: InventoryCheckItem } | { success: false }> {
  const parsed = inventoryCheckTemplateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false };
  }

  const { data, error } = await supabase
    .from("inventory_check_items")
    .update(toDbRow(parsed.data))
    .eq("id", itemId)
    .select(
      "id, department_id, item_code, item_name, par_quantity, unit, sort_order, departments!inventory_check_items_department_id_fkey ( id, name )"
    )
    .single();

  if (error || !data) {
    console.error("Failed to update inventory check item:", error);
    return { success: false };
  }

  return { success: true, data: data as InventoryCheckItem };
}

export async function createInventoryCheckTemplateItem(
  supabase: SupabaseClient,
  input: InventoryCheckTemplateItemInput
): Promise<{ success: true; data: InventoryCheckItem } | { success: false }> {
  const parsed = inventoryCheckTemplateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false };
  }

  const { data: lastItem, error: sortError } = await supabase
    .from("inventory_check_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sortError) {
    console.error("Failed to resolve next sort order:", sortError);
    return { success: false };
  }

  const sortOrder = (lastItem?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("inventory_check_items")
    .insert({
      ...toDbRow(parsed.data),
      sort_order: sortOrder,
    })
    .select(
      "id, department_id, item_code, item_name, par_quantity, unit, sort_order, departments!inventory_check_items_department_id_fkey ( id, name )"
    )
    .single();

  if (error || !data) {
    console.error("Failed to create inventory check item:", error);
    return { success: false };
  }

  return { success: true, data: data as InventoryCheckItem };
}
