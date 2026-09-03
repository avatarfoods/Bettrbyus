import type { SupabaseClient } from "@supabase/supabase-js";
import type { WipRecipe, WipRecipeLine } from "@/lib/production/wip-explode";
import type { ScheduleDemandEntry } from "@/lib/purchasing/mrp";

/**
 * The BOM, for Master PO's own explosion.
 *
 * Deliberately the same query lib/production/schedule/fetch.ts runs for the
 * planning grid (purchasing_recipes where active, purchasing_recipe_lines'
 * FK columns) so the two features can never quietly disagree about what a
 * recipe contains - kept as its own small query here rather than importing
 * from the schedule feature, so nothing about this change touches that
 * already-working code path.
 */
export async function fetchBom(supabase: SupabaseClient): Promise<{
  recipesById: Map<string, WipRecipe>;
  linesByRecipeId: Map<string, WipRecipeLine[]>;
}> {
  const [recipesResult, linesResult] = await Promise.all([
    supabase
      .from("purchasing_recipes")
      .select("id, wip_code, name, department, batch_size, uom, is_finished_product")
      .eq("active", true),
    supabase
      .from("purchasing_recipe_lines")
      .select(
        "recipe_id, ingredient_name, quantity, uom, loss_pct, sub_recipe_id, material_id"
      ),
  ]);

  if (recipesResult.error) throw new Error(recipesResult.error.message);
  if (linesResult.error) throw new Error(linesResult.error.message);

  type RecipeRow = {
    id: string;
    wip_code: string;
    name: string;
    department: string | null;
    batch_size: number | null;
    uom: string | null;
    is_finished_product: boolean | null;
  };

  const recipesById = new Map<string, WipRecipe>();
  for (const row of (recipesResult.data ?? []) as RecipeRow[]) {
    recipesById.set(row.id, {
      id: row.id,
      wipCode: row.wip_code,
      name: row.name,
      department: row.department,
      batchSize: row.batch_size,
      uom: row.uom,
      isFinishedProduct: row.is_finished_product,
    });
  }

  const linesByRecipeId = new Map<string, WipRecipeLine[]>();
  for (const row of (linesResult.data ?? []) as Record<string, unknown>[]) {
    const recipeId = row.recipe_id as string;
    const arr = linesByRecipeId.get(recipeId) ?? [];
    arr.push({
      recipeId,
      ingredientName: (row.ingredient_name as string) ?? "",
      quantity: Number(row.quantity ?? 0),
      uom: (row.uom as string | null) ?? null,
      lossPct: (row.loss_pct as number | null) ?? null,
      subRecipeId: (row.sub_recipe_id as string | null) ?? null,
      materialId: (row.material_id as string | null) ?? null,
    });
    linesByRecipeId.set(recipeId, arr);
  }

  return { recipesById, linesByRecipeId };
}

/**
 * What is actually committed to the floor, across every production line,
 * in a date window.
 *
 * Live schedules only - a draft is someone's in-progress edit, and a
 * purchase order should never move because of a number nobody has confirmed
 * yet. Each line has at most one schedule with status = 'live'
 * (production_schedules_one_live_per_line_idx), so this reads every one of
 * them rather than assuming a single global schedule.
 */
export async function fetchLiveScheduleDemand(
  supabase: SupabaseClient,
  range: { fromDate: string; toDate: string }
): Promise<ScheduleDemandEntry[]> {
  const { data: liveSchedules, error: scheduleError } = await supabase
    .from("production_schedules")
    .select("id")
    .eq("status", "live");
  if (scheduleError) throw new Error(scheduleError.message);

  const scheduleIds = (liveSchedules ?? []).map((row) => row.id as string);
  if (scheduleIds.length === 0) return [];

  const { data: entryRows, error: entriesError } = await supabase
    .from("production_schedule_entries")
    .select("recipe_id, production_date, quantity")
    .in("schedule_id", scheduleIds)
    .gte("production_date", range.fromDate)
    .lte("production_date", range.toDate);
  if (entriesError) throw new Error(entriesError.message);

  return (entryRows ?? [])
    .map((row) => ({
      recipeId: row.recipe_id as string,
      date: row.production_date as string,
      quantity: Number(row.quantity ?? 0),
    }))
    .filter((entry) => entry.quantity !== 0);
}
