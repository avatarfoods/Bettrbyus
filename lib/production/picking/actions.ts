"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/supabase/missing";
import { allRows } from "@/lib/supabase/all-rows";
import { fetchOdooPackInfo } from "@/lib/production/picking/odoo-pack";

export type PickingActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const PICKING_PATH = "/production/picking";
const MIGRATION_NOTE =
  "The picking table is missing. Run supabase/migrations/20260904_picking.sql in the Supabase SQL editor, then try again.";

function fail(message: string): PickingActionResult {
  return { ok: false, message };
}

/**
 * Reads Pack Size, U/M, Case Description and Storage from Odoo for every
 * active material that has an Odoo product, and stores them on the picking
 * row. The department and type the sheet groups by are left alone - those
 * are the plant's, not Odoo's.
 */
export async function syncPackSizes(): Promise<PickingActionResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!isAdminProfile(profile)) return fail("Only an administrator can refresh pack sizes");

  const materials = await allRows<{ id: string; odoo_product_id: number | null }>(
    (start, end) =>
      supabase
        .from("purchasing_materials")
        .select("id, odoo_product_id")
        .eq("active", true)
        .not("odoo_product_id", "is", null)
        .range(start, end)
  );
  if (materials.error) return fail(materials.error);

  const byProduct = new Map<number, string>();
  for (const row of materials.rows) {
    if (row.odoo_product_id !== null) byProduct.set(Number(row.odoo_product_id), row.id);
  }
  if (byProduct.size === 0) return fail("No material is linked to an Odoo product yet");

  let info;
  try {
    info = await fetchOdooPackInfo([...byProduct.keys()]);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Odoo could not be reached");
  }

  const now = new Date().toISOString();
  const rows = info
    .map((entry) => {
      const materialId = byProduct.get(entry.productId);
      if (!materialId) return null;
      return {
        material_id: materialId,
        pack_size: entry.packSize,
        pack_uom: entry.packUom,
        case_description: entry.caseDescription,
        odoo_storage: entry.storage,
        pack_synced_at: now,
        updated_at: now,
        updated_by: profile.id,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  let withSize = 0;
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    const { error } = await supabase
      .from("production_picking_materials")
      .upsert(batch, { onConflict: "material_id" });
    if (error) return fail(isMissingTable(error) ? MIGRATION_NOTE : error.message);
    withSize += batch.filter((row) => row.pack_size !== null).length;
  }

  revalidatePath(PICKING_PATH);
  return {
    ok: true,
    message: `Read ${rows.length} products from Odoo; ${withSize} carry a pack size`,
  };
}

/**
 * Sets the sheet's department and type for one material, or overrides the
 * pack size by hand when Odoo has none. Empty strings clear a field; a null
 * pack size means "back to whatever Odoo says next time".
 */
export async function savePickingMaterial(input: {
  materialId: string;
  department?: string | null;
  type?: string | null;
  packSize?: number | null;
  packUom?: string | null;
}): Promise<PickingActionResult> {
  if (!input.materialId) return fail("Missing material");
  if (
    input.packSize !== undefined &&
    input.packSize !== null &&
    (!Number.isFinite(input.packSize) || input.packSize <= 0)
  ) {
    return fail("Pack size must be a number above zero");
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!isAdminProfile(profile)) return fail("Only an administrator can change the picking sheet");

  const row: Record<string, unknown> = {
    material_id: input.materialId,
    updated_at: new Date().toISOString(),
    updated_by: profile.id,
  };
  if (input.department !== undefined) {
    row.pick_department = input.department?.trim().toUpperCase() || null;
  }
  if (input.type !== undefined) row.pick_type = input.type?.trim().toUpperCase() || null;
  if (input.packSize !== undefined) row.pack_size = input.packSize;
  if (input.packUom !== undefined) row.pack_uom = input.packUom?.trim() || null;

  const { error } = await supabase
    .from("production_picking_materials")
    .upsert(row, { onConflict: "material_id" });
  if (error) return fail(isMissingTable(error) ? MIGRATION_NOTE : error.message);

  revalidatePath(PICKING_PATH);
  return { ok: true, message: "Saved" };
}
