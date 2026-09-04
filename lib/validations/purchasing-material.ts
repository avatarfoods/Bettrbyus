import { z } from "zod";

export const STORAGE_TYPES = ["dry", "refrigerated", "frozen", "produce"] as const;

export const PURCHASING_CATEGORIES = [
  "produce",
  "protein",
  "dairy_refrigerated",
  "dry_goods",
  "packaging",
] as const;

export const PURCHASING_CATEGORY_LABELS: Record<
  (typeof PURCHASING_CATEGORIES)[number],
  string
> = {
  produce: "Produce",
  protein: "Protein",
  dairy_refrigerated: "Dairy & Refrigerated",
  dry_goods: "Dry Goods",
  packaging: "Packaging",
};

export const purchasingMaterialSchema = z.object({
  storageType: z.enum(STORAGE_TYPES).nullable(),
  purchasingCategory: z.enum(PURCHASING_CATEGORIES).nullable(),
  lbsPerCase: z
    .number({ message: "Lbs per case must be a number." })
    .positive("Lbs per case must be greater than zero.")
    .nullable(),
  isProtein: z.boolean(),
  thawBufferDays: z
    .number({ message: "Thaw buffer must be a number." })
    .int("Thaw buffer must be whole days.")
    .min(0, "Thaw buffer cannot be negative.")
    .max(30, "Thaw buffer looks too large."),
  leadTimeDays: z
    .number({ message: "Lead time must be a number." })
    .int("Lead time must be whole days.")
    .min(0, "Lead time cannot be negative.")
    .max(120, "Lead time looks too large."),
});

export type PurchasingMaterialFormValues = z.infer<typeof purchasingMaterialSchema>;

export function parseOptionalNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
