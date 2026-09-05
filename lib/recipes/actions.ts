"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn, isMissingTable } from "@/lib/supabase/missing";
import { logRecipeChange } from "@/lib/recipes/change-log";

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
 * recipe. Deleting would break all three, which is why archiving is the
 * normal way out and [deleteRecipe] only takes a recipe nothing points at.
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
 * Deletes a recipe outright.
 *
 * Archiving is how a recipe stops being made; this is for the one that should
 * never have existed - a typo, a duplicate, a test - where leaving an archived
 * ghost in the list is worse than the row being gone.
 *
 * So it only removes a recipe nothing points at. If another recipe lists it,
 * or it appears on a plan, or somebody has counted it, deleting would take
 * that with it: a bowl losing an ingredient, a printed sheet losing the line
 * it was printed from. Those are refused by name, and the answer is to archive
 * instead. What goes with the recipe is only ever its own contents - its
 * ingredient lines, instruction, timing window and specification.
 *
 * The delete runs as the service role rather than as the signed-in user, on
 * purpose: it keeps deletion behind this admin check instead of opening a
 * delete policy that would let any signed-in account remove a recipe.
 */
export async function deleteRecipe(input: {
  recipeId: string;
}): Promise<ActionResult> {
  if (!input.recipeId) return { ok: false, message: "Missing recipe" };

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can delete a recipe" };
  }

  const { data: recipe } = await supabase
    .from("purchasing_recipes")
    .select("wip_code, name")
    .eq("id", input.recipeId)
    .maybeSingle();

  if (!recipe) return { ok: false, message: "That recipe is already gone" };

  /*
    What would be destroyed along with it. Counted rather than left to the
    foreign keys: some of these cascade, so the database would delete a year of
    counts and plan without a word, and the rest raise a constraint name nobody
    can act on.
  */
  const holds = await recipeHolds(supabase, input.recipeId);
  if (holds.length > 0) {
    return {
      ok: false,
      message: `Cannot be deleted: ${listPhrase(holds)}. Archive it instead - it comes out of every list and keeps what points at it working.`,
    };
  }

  const label = `${recipe.wip_code as string} ${recipe.name as string}`;
  // Written before the row goes, and worded so the log still says which recipe
  // it was once the id it pointed at no longer resolves to anything.
  await logRecipeChange(supabase, {
    recipeId: input.recipeId,
    userId: profile.id,
    userName: profile.full_name,
    summary: `Deleted the recipe ${label}`,
  });

  const { error } = await createAdminClient()
    .from("purchasing_recipes")
    .delete()
    .eq("id", input.recipeId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/recipes");
  revalidatePath("/recipes/history");
  revalidatePath("/production/schedule");
  revalidatePath("/production/wip");
  return { ok: true };
}

/**
 * Everything that would lose something if this recipe went, in plain words.
 *
 * A missing table counts as no hold: a plant that has not run the WIP
 * migration yet has no counts to lose, and should not be told it cannot
 * delete a typo because of a table that does not exist.
 */
async function recipeHolds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recipeId: string
): Promise<string[]> {
  const checks: { table: string; column: string; say: (n: number) => string }[] =
    [
      {
        table: "purchasing_recipe_lines",
        column: "sub_recipe_id",
        say: (n) => `${n} ${n === 1 ? "recipe lists" : "recipes list"} it as an ingredient`,
      },
      {
        table: "production_schedule_entries",
        column: "recipe_id",
        say: (n) => `it is on ${n} ${n === 1 ? "day" : "days"} of the plan`,
      },
      {
        table: "purchasing_schedule_entries",
        column: "recipe_id",
        say: (n) => `${n} imported schedule ${n === 1 ? "row" : "rows"} point at it`,
      },
      {
        table: "wip_counts",
        column: "recipe_id",
        say: (n) => `it has ${n} WIP ${n === 1 ? "count" : "counts"}`,
      },
      {
        table: "production_wip_counts",
        column: "recipe_id",
        say: () => "it has an on-hand WIP count",
      },
    ];

  const held: string[] = [];
  for (const check of checks) {
    // The filtered column is what gets selected: production_wip_counts is
    // keyed by recipe_id and has no id of its own.
    const { count, error } = await supabase
      .from(check.table)
      .select(check.column, { count: "exact", head: true })
      .eq(check.column, recipeId);
    if (error) {
      if (isMissingTable(error)) continue;
      // Anything else means the answer is unknown, and "unknown" must not read
      // as "nothing depends on it".
      held.push(`its ${check.table} rows could not be checked`);
      continue;
    }
    if ((count ?? 0) > 0) held.push(check.say(count ?? 0));
  }
  return held;
}

/** "a, b and c" - so the refusal reads as a sentence. */
function listPhrase(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
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
