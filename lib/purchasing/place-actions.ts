"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import type { ConfigResult } from "@/lib/production/config-actions";
import { isMissingTable } from "@/lib/supabase/missing";
import { createClient } from "@/lib/supabase/server";

const placeSchema = z.object({
  odooCompanyId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
});

async function requireAdmin(): Promise<ConfigResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can change this" };
  }
  return { ok: true };
}

function revalidate() {
  revalidatePath("/purchasing");
  revalidatePath("/purchasing/materials");
  revalidatePath("/purchasing/settings/places");
}

/**
 * Replaces the Odoo companies Purchasing reads. Presence of a row is the
 * selection; an empty table is "every company", so saving nothing is
 * refused — that would look identical to "never configured".
 */
export async function savePurchasingPlaces(
  input: unknown
): Promise<ConfigResult> {
  const parsed = z
    .array(placeSchema)
    .min(1, "Pick at least one place")
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid places",
    };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const rows = parsed.data.map((place, index) => ({
    odoo_company_id: place.odooCompanyId,
    name: place.name,
    sort_order: index + 1,
    updated_at: new Date().toISOString(),
  }));

  const selectedIds = parsed.data.map((place) => place.odooCompanyId);

  const { error: upsertError } = await supabase
    .from("purchasing_places")
    .upsert(rows, { onConflict: "odoo_company_id" });

  if (upsertError) {
    if (isMissingTable(upsertError)) {
      return {
        ok: false,
        message:
          "The places table does not exist yet. Run the 20260904_purchasing_places migration first.",
      };
    }
    return { ok: false, message: upsertError.message };
  }

  const { error: deleteError } = await supabase
    .from("purchasing_places")
    .delete()
    .not("odoo_company_id", "in", `(${selectedIds.join(",")})`);

  if (deleteError) return { ok: false, message: deleteError.message };

  revalidate();
  return { ok: true };
}
