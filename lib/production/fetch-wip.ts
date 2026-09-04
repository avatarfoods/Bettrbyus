import type { SupabaseClient } from "@supabase/supabase-js";
import {
  explodeToNodes,
  recipeKind,
  type WipNode,
  type WipRecipe,
  type WipRecipeLine,
} from "@/lib/production/wip-explode";

/**
 * Everything the WIP calculator needs, in one round trip per table.
 *
 * The BOM is exploded on the server: 199 recipes and 685 lines is small enough
 * that walking it costs nothing, and it keeps the client from having to know
 * how a bill of materials works.
 */

export type WipSubrecipe = {
  id: string;
  wipCode: string;
  name: string;
  department: string | null;
  uom: string | null;
  /** Latest counted quantity, or null when never counted. */
  onHand: number | null;
};

export type WipFinishedProduct = {
  id: string;
  wipCode: string;
  name: string;
  /** Subrecipes below it, with per-case quantities. */
  nodes: WipNode[];
  /** Units per case, from the packaging lines - used to show bowls. */
  unitsPerCase: number | null;
};

export type WipData = {
  finished: WipFinishedProduct[];
  subrecipes: WipSubrecipe[];
  /** Scheduled quantity per finished-product id, by horizon in days. */
  plannedByRecipeId: Record<string, Record<number, number>>;
  horizons: number[];
};

export const WIP_HORIZONS = [3, 5, 10];

type RecipeRow = {
  id: string;
  wip_code: string;
  name: string;
  department: string | null;
  batch_size: number | null;
  batch_yield: number | null;
  uom: string | null;
  active: boolean;
};

type LineRow = {
  recipe_id: string;
  ingredient_name: string;
  quantity: number;
  uom: string | null;
  loss_pct: number | null;
  sub_recipe_id: string | null;
  material_id: string | null;
};

function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function fetchWipData(supabase: SupabaseClient): Promise<WipData> {
  const maxHorizon = Math.max(...WIP_HORIZONS);
  const today = isoDaysFromToday(0);

  const [recipesResult, linesResult, countsResult, scheduleResult] =
    await Promise.all([
      supabase
        .from("purchasing_recipes")
        .select("id, wip_code, name, department, batch_size, batch_yield, uom, active")
        .eq("active", true),
      supabase
        .from("purchasing_recipe_lines")
        .select(
          "recipe_id, ingredient_name, quantity, uom, loss_pct, sub_recipe_id, material_id"
        ),
      supabase.from("production_wip_counts").select("recipe_id, qty_on_hand"),
      supabase
        .from("purchasing_schedule_entries")
        .select("recipe_id, schedule_date, quantity")
        .gte("schedule_date", today)
        .lt("schedule_date", isoDaysFromToday(maxHorizon)),
    ]);

  const recipeRows = (recipesResult.data ?? []) as RecipeRow[];
  const lineRows = (linesResult.data ?? []) as LineRow[];

  const recipesById = new Map<string, WipRecipe>(
    recipeRows.map((row) => [
      row.id,
      {
        id: row.id,
        wipCode: row.wip_code,
        name: row.name,
        department: row.department,
        batchSize: row.batch_size,
        batchYield: row.batch_yield,
        uom: row.uom,
      },
    ])
  );

  const linesByRecipeId = new Map<string, WipRecipeLine[]>();
  for (const row of lineRows) {
    const line: WipRecipeLine = {
      recipeId: row.recipe_id,
      ingredientName: row.ingredient_name,
      quantity: Number(row.quantity) || 0,
      uom: row.uom,
      lossPct: row.loss_pct,
      subRecipeId: row.sub_recipe_id,
      materialId: row.material_id,
    };
    const bucket = linesByRecipeId.get(row.recipe_id);
    if (bucket) bucket.push(line);
    else linesByRecipeId.set(row.recipe_id, [line]);
  }

  // The counts table may not exist yet on a database that has not run the
  // migration; treat that as "nothing counted" rather than an error page.
  const counts = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    const value = (row as { recipe_id: string; qty_on_hand: number | null })
      .qty_on_hand;
    if (value != null) counts.set((row as { recipe_id: string }).recipe_id, Number(value));
  }

  const finished: WipFinishedProduct[] = recipeRows
    .filter((row) => recipeKind(row.department) === "finished")
    .map((row) => {
      const nodes = explodeToNodes(row.id, { recipesById, linesByRecipeId });
      return {
        id: row.id,
        wipCode: row.wip_code,
        name: row.name,
        nodes,
        unitsPerCase: unitsPerCaseOf(row.id, linesByRecipeId),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const subrecipes: WipSubrecipe[] = recipeRows
    .filter((row) => recipeKind(row.department) !== "finished")
    .map((row) => ({
      id: row.id,
      wipCode: row.wip_code,
      name: row.name,
      department: row.department,
      uom: row.uom,
      onHand: counts.get(row.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const plannedByRecipeId: Record<string, Record<number, number>> = {};
  for (const row of scheduleResult.data ?? []) {
    const entry = row as {
      recipe_id: string | null;
      schedule_date: string;
      quantity: number;
    };
    if (!entry.recipe_id) continue;

    for (const horizon of WIP_HORIZONS) {
      if (entry.schedule_date >= isoDaysFromToday(horizon)) continue;
      const perRecipe = (plannedByRecipeId[entry.recipe_id] ??= {});
      perRecipe[horizon] = (perRecipe[horizon] ?? 0) + Number(entry.quantity);
    }
  }

  return { finished, subrecipes, plannedByRecipeId, horizons: WIP_HORIZONS };
}

/**
 * Bowls per case, read off the packaging line: a 10-count carton appears as a
 * line of quantity 10. Falls back to the largest assembly multiple when the
 * packaging is not linked.
 */
function unitsPerCaseOf(
  recipeId: string,
  linesByRecipeId: Map<string, WipRecipeLine[]>
): number | null {
  const lines = linesByRecipeId.get(recipeId);
  if (!lines?.length) return null;

  const subQuantities = lines
    .filter((line) => line.subRecipeId)
    .map((line) => line.quantity)
    .filter((quantity) => quantity > 0);

  if (subQuantities.length === 0) return null;
  return Math.max(...subQuantities);
}
