import { z } from "zod";

export const inventoryCheckEntrySchema = z.object({
  itemId: z.uuid(),
  actualQuantity: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const inventoryCheckSubmitSchema = z.object({
  checkDate: z.string().min(1, "Select a date"),
  entries: z.array(inventoryCheckEntrySchema),
});

export type InventoryCheckEntryInput = z.infer<typeof inventoryCheckEntrySchema>;
export type InventoryCheckSubmitInput = z.infer<typeof inventoryCheckSubmitSchema>;
