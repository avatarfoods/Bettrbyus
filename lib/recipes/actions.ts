"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/supabase/missing";

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Creates a recipe.
 *
 * Only the four things that cannot be worked out later: what it is called,
 * the item number it will be known by, where it is made, and what it is
 * measured in. Ingredients, batch size, instructions and timing all get added
 * on the recipe's own page, because a form that asks for everything up front
 * is a form nobody finishes.
 *
 * The item number is the identity - it is what the floor writes on the sheet
 * and what the schedule is searched by - so a duplicate is refused rather
 * than allowed to become two recipes nobody can tell apart.
 */
export async function createRecipe(input: {
  wipCode: string;
  name: string;
  department: string | null;
  uom: string;
  isFinished: boolean;
}): Promise<ActionResult & { id?: string }> {
  const wipCode = (input.wipCode ?? "").trim();
  const name = (input.name ?? "").trim();

  if (!name) return { ok: false, message: "Give the recipe a name" };
  if (!wipCode) return { ok: false, message: "Give it an item number" };
  if (name.length > 200) return { ok: false, message: "That name is too long" };

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can create a recipe" };
  }

  const { data: clash } = await supabase
    .from("purchasing_recipes")
    .select("id, name")
    .eq("wip_code", wipCode)
    .maybeSingle();

  if (clash) {
    return {
      ok: false,
      message: `${wipCode} is already ${clash.name as string}`,
    };
  }

  const { data, error } = await supabase
    .from("purchasing_recipes")
    .insert({
      wip_code: wipCode,
      name,
      department: input.department,
      uom: input.uom || "LB",
      is_finished_product: input.isFinished,
      active: true,
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };

  revalidatePath("/recipes");
  revalidatePath("/production/schedule");
  return { ok: true, id: data.id as string };
}

/**
 * Renames a recipe, or changes its item number.
 *
 * The item number is the identity - what the floor writes on the sheet, what
 * the plan is searched by - so it has to be correctable in place. Typing it
 * wrong at creation and having no way back would mean archiving a recipe over
 * a typo. A duplicate is still refused: two recipes answering to 160650 is
 * worse than one with the wrong number.
 */
export async function renameRecipe(input: {
  recipeId: string;
  wipCode: string;
  name: string;
}): Promise<ActionResult> {
  const wipCode = (input.wipCode ?? "").trim();
  const name = (input.name ?? "").trim();

  if (!input.recipeId) return { ok: false, message: "Missing recipe" };
  if (!name) return { ok: false, message: "A recipe needs a name" };
  if (!wipCode) return { ok: false, message: "A recipe needs an item number" };
  if (name.length > 200) return { ok: false, message: "That name is too long" };

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can rename a recipe" };
  }

  const { data: clash } = await supabase
    .from("purchasing_recipes")
    .select("id, name")
    .eq("wip_code", wipCode)
    .neq("id", input.recipeId)
    .maybeSingle();

  if (clash) {
    return { ok: false, message: `${wipCode} is already ${clash.name as string}` };
  }

  const { error } = await supabase
    .from("purchasing_recipes")
    .update({ wip_code: wipCode, name })
    .eq("id", input.recipeId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${input.recipeId}`);
  revalidatePath("/production/schedule");
  return { ok: true };
}

/**
 * Archives a recipe, or brings it back.
 *
 * Archiving hides it from every list and stops it being picked as an
 * ingredient, but leaves the record alone: a schedule entry from last month,
 * a printed batch record and an old WIP count all still point at a real
 * recipe. Deleting would break all three, which is why there is no delete.
 *
 * What already uses it keeps working. The caller is told what those are
 * before it happens - archiving something three bowls depend on is a decision
 * somebody should make knowingly.
 */
export async function setRecipeArchived(input: {
  recipeId: string;
  archived: boolean;
}): Promise<ActionResult> {
  if (!input.recipeId) return { ok: false, message: "Missing recipe" };

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can archive a recipe" };
  }

  const { error } = await supabase
    .from("purchasing_recipes")
    .update({
      archived_at: input.archived ? new Date().toISOString() : null,
      archived_by: input.archived ? profile.id : null,
      active: !input.archived,
    })
    .eq("id", input.recipeId);

  if (error) {
    return {
      ok: false,
      message: isMissingColumn(error)
        ? "Archiving needs the 20260901_recipe_archive migration"
        : error.message,
    };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${input.recipeId}`);
  revalidatePath("/production/schedule");
  revalidatePath("/production/wip");
  return { ok: true };
}

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
