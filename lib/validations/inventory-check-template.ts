import { z } from "zod";

export const inventoryCheckTemplateItemSchema = z.object({
  departmentId: z.uuid("Select a department"),
  itemCode: z.string().trim().min(1, "Enter an item ID"),
  itemName: z.string().trim().min(1, "Enter an item name"),
  parQuantity: z.number().nullable().optional(),
  unit: z.string().trim().nullable().optional(),
});

export type InventoryCheckTemplateItemInput = z.infer<
  typeof inventoryCheckTemplateItemSchema
>;

export function parseParQuantityInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatParQuantityInput(value: number | null | undefined): string {
  if (value == null) return "";
  return Number.isInteger(value) ? String(value) : String(value);
}
