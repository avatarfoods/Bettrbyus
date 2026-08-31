"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Marks a recipe as a finished product, or unmarks it.
 *
 * This is the flag the schedule cascades from, so changing it changes what
 * drives demand for everything underneath. That is exactly why it is an
 * explicit tick rather than something inferred from which sheet a recipe
 * arrived on.
 */
export async function setRecipeFinishedProduct(input: {
  recipeId: string;
  isFinished: boolean;
}): Promise<ActionResult> {
  if (!input.recipeId) return { ok: false, message: "Missing recipe" };

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return {
      ok: false,
      message: "Only an administrator can change what counts as a finished product",
    };
  }

  const { error } = await supabase
    .from("purchasing_recipes")
    .update({ is_finished_product: input.isFinished })
    .eq("id", input.recipeId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${input.recipeId}`);
  revalidatePath("/production/schedule");
  return { ok: true };
}

/**
 * Moves a recipe to another department.
 *
 * The department decides which schedule group it appears under and which
 * batch sheets it prints with, so it has to be changeable from the recipe
 * rather than only by re-importing the workbook.
 */
export async function setRecipeDepartment(input: {
  recipeId: string;
  department: string | null;
}): Promise<ActionResult> {
  if (!input.recipeId) return { ok: false, message: "Missing recipe" };

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return {
      ok: false,
      message: "Only an administrator can move a recipe between departments",
    };
  }

  const { error } = await supabase
    .from("purchasing_recipes")
    .update({ department: input.department?.trim() || null })
    .eq("id", input.recipeId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${input.recipeId}`);
  revalidatePath("/production/schedule");
  return { ok: true };
}
