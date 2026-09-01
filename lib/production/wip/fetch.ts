import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/supabase/missing";
import { isFinishedProduct, recipeKind } from "@/lib/production/wip-explode";
import type { WipCount } from "@/lib/production/wip/model";

/**
 * Everything the WIP pages need.
 *
 * Shelf life comes from the timing window's earliest offset - the one number
 * that says both "may be made five days ahead" and "keeps five days" - so
 * this reads the windows rather than any field of its own.
 */

export type WipRecipeRow = {
  id: string;
  wipCode: string;
  name: string;
  department: string | null;
  lineName: string | null;
  uom: string | null;
  isFinished: boolean;
  /** From the timing window. Null means nothing expires. */
  shelfLife: number | null;
};

export type WipData = {
  recipes: WipRecipeRow[];
  counts: WipCount[];
  missingTable: boolean;
  windowsMissing: boolean;
};

export async function fetchWipData(
  supabase: SupabaseClient,
  /**
   * `asOf` is one day: what was in the cooler then. That is the latest count
   * of each lot taken on or before it, so a lot counted a fortnight earlier
   * and never recounted is still there.
   *
   * `from`/`to` narrows to counts taken inside a span, which answers the
   * other question people ask - what moved last week - and deliberately
   * leaves out lots nobody touched in it.
   */
  options: { asOf?: string; from?: string; to?: string } = {}
): Promise<WipData> {
  const [recipesResult, deptResult, windowsResult] = await Promise.all([
    supabase
      .from("purchasing_recipes")
      // "*" so a column added by a later migration cannot empty this.
      .select("*")
      .eq("active", true)
      .order("name"),
    supabase
      .from("production_departments")
      .select("id, name, line_id, production_lines ( id, name )"),
    supabase
      .from("recipe_timing_windows")
      .select("recipe_id, earliest_offset"),
  ]);

  const lineByDepartment = new Map<string, string>();
  for (const row of (deptResult.data ?? []) as Record<string, unknown>[]) {
    const embedded = row.production_lines as
      | { id: string; name: string }[]
      | { id: string; name: string }
      | null;
    const line = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
    if (line) {
      lineByDepartment.set(String(row.name).trim().toUpperCase(), line.name);
    }
  }

  const shelfLife = new Map<string, number | null>();
  for (const row of (windowsResult.data ?? []) as Record<string, unknown>[]) {
    const earliest = row.earliest_offset as number | null;
    shelfLife.set(
      row.recipe_id as string,
      earliest === null ? null : Math.abs(earliest)
    );
  }

  const recipes: WipRecipeRow[] = ((recipesResult.data ?? []) as Record<
    string,
    unknown
  >[]).map((row) => {
    const department = (row.department as string | null) ?? null;
    return {
      id: row.id as string,
      wipCode: (row.wip_code as string) ?? "",
      name: (row.name as string) ?? "",
      department,
      lineName:
        lineByDepartment.get((department ?? "").trim().toUpperCase()) ?? null,
      uom: (row.uom as string | null) ?? null,
      isFinished: isFinishedProduct({
        department,
        isFinishedProduct: row.is_finished_product as boolean | null,
      }),
      shelfLife: shelfLife.get(row.id as string) ?? null,
    };
  });

  // Only kitchen and assembly output is WIP. A finished product is stock, and
  // counting it here would double it against the finished-goods count.
  const wipRecipes = recipes.filter(
    (recipe) => recipeKind(recipe.department) !== "finished"
  );

  let query = supabase
    .from("wip_counts")
    .select(
      // "*" plus the author: naming partial_quantity before its migration
      // has run would fail the whole query and empty the page.
      "*, profiles ( full_name, email )"
    )
    .order("counted_at", { ascending: false })
    .limit(2000);

  const until = options.to ?? options.asOf;
  if (options.from) query = query.gte("counted_at", `${options.from}T00:00:00Z`);
  if (until) query = query.lte("counted_at", `${until}T23:59:59.999Z`);

  const { data: countRows, error: countError } = await query;

  if (countError) {
    return {
      recipes: wipRecipes,
      counts: [],
      missingTable: isMissingTable(countError),
      windowsMissing: isMissingTable(windowsResult.error),
    };
  }

  const counts: WipCount[] = ((countRows ?? []) as Record<string, unknown>[]).map(
    (row) => {
      const embedded = row.profiles as
        | { full_name: string | null; email: string | null }[]
        | { full_name: string | null; email: string | null }
        | null;
      const person = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
      return {
        id: row.id as string,
        recipeId: row.recipe_id as string,
        lotCode: (row.lot_code as string) ?? "",
        producedOn: (row.produced_on as string | null) ?? null,
        containers: Number(row.containers ?? 0),
        containerSize: Number(row.container_size ?? 0),
        partialQuantity: Number(row.partial_quantity ?? 0),
        containerLabel: (row.container_label as string) ?? "bucket",
        quantity: Number(row.quantity ?? 0),
        countedAt: (row.counted_at as string) ?? "",
        countedByName: person?.full_name || person?.email || null,
        note: (row.note as string | null) ?? null,
      };
    }
  );

  return {
    recipes: wipRecipes,
    counts,
    missingTable: false,
    windowsMissing: isMissingTable(windowsResult.error),
  };
}

/**
 * What was scheduled the day before, which is the list the counter walks.
 *
 * Counting the whole cooler at four in the morning is not a thing anyone
 * does, so WIP Count offers what was actually made rather than all 199.
 */
export async function fetchCountList(
  supabase: SupabaseClient,
  productionDate: string
): Promise<{ recipeIds: string[]; missingTable: boolean }> {
  const { data: live, error: liveError } = await supabase
    .from("production_schedules")
    .select("id")
    .eq("status", "live")
    .limit(1);

  if (liveError) {
    return { recipeIds: [], missingTable: isMissingTable(liveError) };
  }
  const liveId = live?.[0]?.id as string | undefined;
  if (!liveId) return { recipeIds: [], missingTable: false };

  const { data, error } = await supabase
    .from("production_schedule_entries")
    .select("recipe_id, quantity")
    .eq("schedule_id", liveId)
    .eq("production_date", productionDate);

  if (error) return { recipeIds: [], missingTable: isMissingTable(error) };

  return {
    recipeIds: (data ?? [])
      .filter((row) => Number(row.quantity ?? 0) > 0)
      .map((row) => row.recipe_id as string),
    missingTable: false,
  };
}

/** What the schedule asked for on a day, so the count can be compared to it. */
export async function fetchPlanned(
  supabase: SupabaseClient,
  productionDate: string
): Promise<Map<string, number>> {
  const { data: live } = await supabase
    .from("production_schedules")
    .select("id")
    .eq("status", "live")
    .limit(1);

  const liveId = live?.[0]?.id as string | undefined;
  if (!liveId) return new Map();

  const { data } = await supabase
    .from("production_schedule_entries")
    .select("recipe_id, quantity")
    .eq("schedule_id", liveId)
    .eq("production_date", productionDate);

  const planned = new Map<string, number>();
  for (const row of data ?? []) {
    planned.set(
      row.recipe_id as string,
      (planned.get(row.recipe_id as string) ?? 0) + Number(row.quantity ?? 0)
    );
  }
  return planned;
}
