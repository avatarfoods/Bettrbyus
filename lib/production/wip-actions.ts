"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export type WipCountResult = { ok: true } | { ok: false; message: string };

/**
 * Records what the kitchen has on hand for one subrecipe.
 *
 * Passing null clears the count, which is meaningfully different from zero:
 * zero means "counted, none left", null means "not counted", and the
 * calculator ignores uncounted subrecipes rather than treating them as empty.
 */
export async function saveWipCount(
  recipeId: string,
  qtyOnHand: number | null
): Promise<WipCountResult> {
  if (typeof recipeId !== "string" || recipeId.length === 0) {
    return { ok: false, message: "Missing subrecipe" };
  }
  if (
    qtyOnHand !== null &&
    (!Number.isFinite(qtyOnHand) || qtyOnHand < 0)
  ) {
    return { ok: false, message: "Enter a quantity of zero or more" };
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };

  const { error } = await supabase.from("production_wip_counts").upsert(
    {
      recipe_id: recipeId,
      qty_on_hand: qtyOnHand,
      counted_at: new Date().toISOString(),
      counted_by: profile.id,
    },
    { onConflict: "recipe_id" }
  );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/wip");
  return { ok: true };
}

/** Clears every count, for starting a fresh shift. */
export async function clearWipCounts(): Promise<WipCountResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };

  const { error } = await supabase
    .from("production_wip_counts")
    .delete()
    .not("recipe_id", "is", null);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/wip");
  return { ok: true };
}
