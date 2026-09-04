import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/supabase/missing";

/**
 * Who changed a recipe, and roughly what they changed.
 *
 * Deliberately a log, not a version history: one row per save, a short
 * sentence, no diffing and nothing to restore from. It exists so that when a
 * number looks wrong months later there is somewhere to look first.
 */

export type RecipeChange = {
  id: string;
  changedAt: string;
  changedByName: string | null;
  summary: string;
};

/**
 * Best effort by design - a recipe save must not fail because its audit row
 * did. A missing table (migration not run) is silently fine for the same
 * reason.
 */
export async function logRecipeChange(
  supabase: SupabaseClient,
  entry: {
    recipeId: string;
    userId: string;
    userName: string | null;
    summary: string;
  }
): Promise<void> {
  const { error } = await supabase.from("recipe_change_log").insert({
    recipe_id: entry.recipeId,
    changed_by: entry.userId,
    changed_by_name: entry.userName,
    summary: entry.summary,
  });

  if (error && !isMissingTable(error)) {
    console.error("Could not write recipe change log:", error);
  }
}

/** One change, with the recipe it belongs to - for the all-recipes log. */
export type RecipeChangeWithRecipe = RecipeChange & {
  recipeId: string | null;
  wipCode: string | null;
  recipeName: string | null;
};

/** Every recipe's changes in one list, newest first. Admins only (RLS). */
export async function fetchAllRecipeChanges(
  supabase: SupabaseClient,
  limit = 500
): Promise<RecipeChangeWithRecipe[]> {
  const { data, error } = await supabase
    .from("recipe_change_log")
    .select(
      "id, changed_at, changed_by_name, summary, recipe_id, recipe:purchasing_recipes ( wip_code, name )"
    )
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => {
    const recipe = Array.isArray(row.recipe) ? row.recipe[0] : row.recipe;
    return {
      id: row.id as string,
      changedAt: row.changed_at as string,
      changedByName: (row.changed_by_name as string | null) ?? null,
      summary: (row.summary as string) ?? "",
      recipeId: (row.recipe_id as string | null) ?? null,
      wipCode: (recipe?.wip_code as string | null) ?? null,
      recipeName: (recipe?.name as string | null) ?? null,
    };
  });
}

export async function fetchRecipeChanges(
  supabase: SupabaseClient,
  recipeId: string,
  limit = 100
): Promise<RecipeChange[]> {
  const { data, error } = await supabase
    .from("recipe_change_log")
    .select("id, changed_at, changed_by_name, summary")
    .eq("recipe_id", recipeId)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    changedAt: row.changed_at as string,
    changedByName: (row.changed_by_name as string | null) ?? null,
    summary: (row.summary as string) ?? "",
  }));
}
