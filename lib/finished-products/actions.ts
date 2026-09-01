"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export type SpecResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

/** Optional number: empty string and null both mean "not set". */
const optionalNumber = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => {
    if (value === null || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  });

const specSchema = z.object({
  id: z.string().uuid().optional(),
  /** Set when the spec is being saved from its recipe, which is the norm. */
  recipeId: z.string().uuid().optional(),
  /**
   * Nullable so a recipe can carry a spec before anyone has picked its Odoo
   * product. Zero from an empty picker is treated as "not chosen".
   */
  odooProductId: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  itemCode: z.string().trim().min(1, "Item code is required").max(40),
  name: z.string().trim().min(1, "Name is required").max(200),
  customerGroup: z.string().trim().max(60).nullable(),
  storageType: z.enum(["freezer", "cooler", "dry"]).nullable(),

  bowlsPerCase: optionalNumber,
  productsPerCase: z.number().int().min(1).max(50),
  netWeightPerCase: optionalNumber,

  caseGtin: z.string().trim().max(20).nullable(),
  unitUpc: z.string().trim().max(20).nullable(),
  labelUrl: z.string().trim().max(2000).nullable(),
  labelFilename: z.string().trim().max(200).nullable(),
  artworkOwner: z.enum(["avatar", "brand"]),

  casesPerLayer: optionalNumber,
  layersHigh: optionalNumber,
  caseWidthIn: optionalNumber,
  caseLengthIn: optionalNumber,
  caseHeightIn: optionalNumber,
  palletBaseHeightIn: optionalNumber,
  maxPalletHeightIn: optionalNumber,
  palletsPerStack: z.number().int().min(1).max(20),
  partialPolicy: z.enum(["accepted", "conditional", "not_accepted"]),

  shelfLifeValue: optionalNumber,
  shelfLifeUnit: z.enum(["months", "days"]),
  expirationOffsetDays: z.number().int().min(-31).max(31),
  lotFormat: z.string().trim().min(1).max(20),

  ingredientStatement: z.string().nullable().optional(),
  handlingInstructions: z.string().nullable().optional(),
  heatingInstructions: z.string().nullable().optional(),
  guaranteedShelfLifeDays: z.number().int().min(0).nullable().optional(),
  palletWeightLb: z.number().min(0).nullable().optional(),
  caseWeightLb: z.number().min(0).nullable().optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  active: z.boolean(),
  notes: z.string().trim().max(1000).nullable(),
});

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can change this" };
  }
  return { ok: true, userId: profile.id };
}

export async function saveFinishedProduct(input: unknown): Promise<SpecResult> {
  const parsed = specSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Those details are not valid",
    };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const v = parsed.data;

  const row = {
    odoo_product_id: v.odooProductId,
    recipe_id: v.recipeId ?? null,
    item_code: v.itemCode,
    name: v.name,
    customer_group: v.customerGroup,
    storage_type: v.storageType,
    bowls_per_case: v.bowlsPerCase,
    products_per_case: v.productsPerCase,
    net_weight_per_case: v.netWeightPerCase,
    case_gtin: v.caseGtin,
    unit_upc: v.unitUpc,
    label_url: v.labelUrl,
    label_filename: v.labelFilename,
    artwork_owner: v.artworkOwner,
    cases_per_layer: v.casesPerLayer,
    layers_high: v.layersHigh,
    case_width_in: v.caseWidthIn,
    case_length_in: v.caseLengthIn,
    case_height_in: v.caseHeightIn,
    pallet_base_height_in: v.palletBaseHeightIn,
    max_pallet_height_in: v.maxPalletHeightIn,
    pallets_per_stack: v.palletsPerStack,
    ingredient_statement: v.ingredientStatement ?? null,
    handling_instructions: v.handlingInstructions ?? null,
    heating_instructions: v.heatingInstructions ?? null,
    guaranteed_shelf_life_days: v.guaranteedShelfLifeDays ?? null,
    pallet_weight_lb: v.palletWeightLb ?? null,
    case_weight_lb: v.caseWeightLb ?? null,
    partial_policy: v.partialPolicy,
    shelf_life_value: v.shelfLifeValue,
    shelf_life_unit: v.shelfLifeUnit,
    expiration_offset_days: v.expirationOffsetDays,
    lot_format: v.lotFormat,
    valid_from: v.validFrom,
    active: v.active,
    notes: v.notes,
    updated_at: new Date().toISOString(),
    updated_by: gate.userId,
  };

  const query = v.id
    ? supabase.from("finished_products").update(row).eq("id", v.id).select("id")
    : supabase.from("finished_products").insert(row).select("id");

  const { data, error } = await query.maybeSingle();

  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "That Odoo product already has a specification"
          : error.message,
    };
  }

  revalidatePath("/production/finished-products");
  if (v.recipeId) revalidatePath(`/recipes/${v.recipeId}`);
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteFinishedProduct(
  id: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { error } = await supabase.from("finished_products").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/production/finished-products");
  return { ok: true };
}
