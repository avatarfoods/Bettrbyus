import { z } from "zod";

export const movingDirectionSchema = z.object({
  direction: z.enum(["in", "out"], { error: "Select a direction" }),
});

export const movingItemSchema = z.object({
  itemId: z.uuid("Select an item"),
});

export const movingAmountSchema = z.object({
  amount: z
    .number({ error: "Enter an amount" })
    .positive("Amount must be greater than zero"),
});

// Used for "moving out" — when was it removed from the freezer
export const movingOutDateTimeSchema = z.object({
  movedOutDate: z.string().min(1, "Select a date"),
  movedOutTime: z
    .string()
    .min(1, "Select a time")
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Enter a valid time"),
});

// Used for "moving in" — prep date, lot number (best by is auto-calculated)
export const movingInDetailsSchema = z.object({
  prepDate: z.string().min(1, "Select a prep date"),
  prepTime: z
    .string()
    .min(1, "Select a prep time")
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Enter a valid time"),
  lotNumber: z.string().min(1, "Enter a lot number"),
});

export type MovingDirectionValues = z.infer<typeof movingDirectionSchema>;
export type MovingItemValues = z.infer<typeof movingItemSchema>;
export type MovingAmountValues = z.infer<typeof movingAmountSchema>;
export type MovingOutDateTimeValues = z.infer<typeof movingOutDateTimeSchema>;
export type MovingInDetailsValues = z.infer<typeof movingInDetailsSchema>;

export type MovingFormData = {
  direction: "in" | "out";
  poNumber?: string;
  amount: number;
  // moving in
  itemId?: string;
  itemCode?: string | null;
  itemName?: string | null;
  prepDate?: string;
  prepTime?: string;
  bestByDate?: string;
  bestByTime?: string;
  lotNumber?: string;
  storageType?: "original_case" | "black_container";
  // moving out
  movingId?: string;
  inPoNumber?: string;
  outPoNumber?: string;
  prepDateIso?: string | null;
  bestByIso?: string | null;
  movedOutDate?: string;
  movedOutTime?: string;
};
