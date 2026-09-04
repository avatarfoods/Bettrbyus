import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isFinishedProduct,
  recipeKind,
  type WipRecipe,
  type WipRecipeLine,
} from "@/lib/production/wip-explode";
import type { ScheduleEntry, TimingWindow } from "@/lib/production/schedule/model";
import { isMissingTable } from "@/lib/supabase/missing";

/**
 * Everything the schedule grid needs, in one round trip per table.
 *
 * The grid is a whole period at once - up to six weeks of dates against ~200
 * recipes - so the read is deliberately wide and the arithmetic happens on
 * the server. Sending 200 recipes and 685 lines to the browser to be exploded
 * there would be slower and would put the BOM rules in two places.
 */

export type ScheduleSummary = {
  id: string;
  name: string;
  status: "draft" | "confirmed" | "archived";
  periodStart: string;
  periodEnd: string;
  notes: string | null;
  confirmedAt: string | null;
  entryCount: number;
};

export type ScheduleRecipe = {
  id: string;
  wipCode: string;
  name: string;
  department: string | null;
  uom: string | null;
  batchSize: number | null;
  isFinished: boolean;
  kind: "finished" | "assembly" | "kitchen";
  /** Inherited from the ingredients, shown per row as on the workbook. */
  allergens: string[];
  /** Departments the grid groups by; null sorts to the end. */
  lineId: string | null;
  lineName: string | null;
};

export type ScheduleData = {
  schedule: ScheduleSummary | null;
  recipes: ScheduleRecipe[];
  entries: ScheduleEntry[];
  windows: Map<string, TimingWindow>;
  recipesById: Map<string, WipRecipe>;
  linesByRecipeId: Map<string, WipRecipeLine[]>;
  /**
   * Cells the caller has changed in their draft but not yet confirmed, keyed
   * `recipeId|date`. The grid marks these so it is obvious what is yours and
   * still uncommitted.
   */
  draftChanges: Set<string>;
  /** True when the schedule tables have not been created yet. */
  missingTable: boolean;
};



/** Every schedule folder, newest period first. */
export async function fetchSchedules(
  supabase: SupabaseClient
): Promise<{ schedules: ScheduleSummary[]; missingTable: boolean }> {
  const { data, error } = await supabase
    .from("production_schedules")
    .select("id, name, status, period_start, period_end, notes, confirmed_at")
    .order("period_start", { ascending: false });

  if (error) {
    return { schedules: [], missingTable: isMissingTable(error) };
  }

  // Counting entries per schedule in the same query would need a view; the
  // list is short enough that a second grouped read is cheaper than the view.
  const counts = new Map<string, number>();
  const { data: entryRows } = await supabase
    .from("production_schedule_entries")
    .select("schedule_id");

  for (const row of entryRows ?? []) {
    const id = (row as { schedule_id: string }).schedule_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return {
    missingTable: false,
    schedules: (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      status: row.status as ScheduleSummary["status"],
      periodStart: row.period_start as string,
      periodEnd: row.period_end as string,
      notes: (row.notes as string | null) ?? null,
      confirmedAt: (row.confirmed_at as string | null) ?? null,
      entryCount: counts.get(row.id as string) ?? 0,
    })),
  };
}

/**
 * One schedule with everything needed to render and check it.
 *
 * Passing no id loads the most recent confirmed schedule, falling back to the
 * most recent draft - what someone opening the page almost always wants.
 */
export async function fetchScheduleData(
  supabase: SupabaseClient,
  scheduleId?: string,
  draftId?: string | null
): Promise<ScheduleData> {
  const empty: ScheduleData = {
    schedule: null,
    recipes: [],
    entries: [],
    windows: new Map(),
    recipesById: new Map(),
    linesByRecipeId: new Map(),
    draftChanges: new Set<string>(),
    missingTable: false,
  };

  let scheduleQuery = supabase
    .from("production_schedules")
    .select("id, name, status, period_start, period_end, notes, confirmed_at");

  scheduleQuery = scheduleId
    ? scheduleQuery.eq("id", scheduleId)
    : scheduleQuery
        .in("status", ["confirmed", "draft"])
        .order("status", { ascending: true })
        .order("period_start", { ascending: false });

  const { data: scheduleRows, error: scheduleError } = await scheduleQuery.limit(1);

  // A missing schedule table is not a reason to show nothing. The recipes and
  // the tree they form live in tables that already exist, so the grid is built
  // either way and the page says plainly that nothing can be saved yet.
  const missingTable = scheduleError ? isMissingTable(scheduleError) : false;
  const scheduleRow = scheduleError ? null : (scheduleRows?.[0] ?? null);

  if (scheduleError && !missingTable) {
    return { ...empty, missingTable: false };
  }

  const [recipesResult, linesResult, windowsResult, deptResult] =
    await Promise.all([
      supabase
        .from("purchasing_recipes")
        // See catalog.ts: naming is_finished_product before its migration has run
        // would fail the whole query.
        .select("*")
        .eq("active", true)
        .order("name"),
      supabase
        .from("purchasing_recipe_lines")
        .select(
          "recipe_id, ingredient_name, quantity, uom, loss_pct, sub_recipe_id, material_id"
        ),
      supabase
        .from("recipe_timing_windows")
        .select("recipe_id, earliest_offset, latest_offset"),
      supabase
        .from("production_departments")
        .select("id, name, line_id, production_lines ( id, name )"),
    ]);

  type RecipeRow = {
    id: string;
    wip_code: string;
    name: string;
    department: string | null;
    batch_size: number | null;
    batch_yield: number | null;
    uom: string | null;
    is_finished_product: boolean | null;
  };

  const recipeRows = (recipesResult.data ?? []) as RecipeRow[];

  // Department name -> the line it belongs to, so the grid can group by line
  // without every recipe carrying a foreign key the workbook never had.
  const lineByDepartment = new Map<string, { id: string; name: string }>();
  for (const row of (deptResult.data ?? []) as Record<string, unknown>[]) {
    const line = row.production_lines as { id: string; name: string } | null;
    if (line) {
      lineByDepartment.set(String(row.name).trim().toUpperCase(), {
        id: line.id,
        name: line.name,
      });
    }
  }

  const recipesById = new Map<string, WipRecipe>();
  const recipes: ScheduleRecipe[] = recipeRows.map((row) => {
    const wip: WipRecipe = {
      id: row.id,
      wipCode: row.wip_code,
      name: row.name,
      department: row.department,
      batchSize: row.batch_size,
      batchYield: row.batch_yield,
      uom: row.uom,
      isFinishedProduct: row.is_finished_product,
    };
    recipesById.set(row.id, wip);

    const line = lineByDepartment.get((row.department ?? "").trim().toUpperCase());

    return {
      id: row.id,
      wipCode: row.wip_code,
      name: row.name,
      department: row.department,
      uom: row.uom,
      batchSize: row.batch_size,
      isFinished: isFinishedProduct(wip),
      kind: recipeKind(row.department),
      allergens: [],
      lineId: line?.id ?? null,
      lineName: line?.name ?? null,
    };
  });

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

  const windows = new Map<string, TimingWindow>();
  for (const row of (windowsResult.data ?? []) as Record<string, unknown>[]) {
    windows.set(row.recipe_id as string, {
      earliestOffset: (row.earliest_offset as number | null) ?? null,
      latestOffset: (row.latest_offset as number | null) ?? null,
    });
  }

  // The live schedule is the base; the caller's draft is laid over it, cell by
  // cell. A zero in the draft means "cleared", so it removes the live value
  // rather than showing as a zero.
  let entries: ScheduleEntry[] = [];
  const draftChanges = new Set<string>();

  if (scheduleRow) {
    const ids = [scheduleRow.id as string];
    if (draftId) ids.push(draftId);

    const { data: entryRows } = await supabase
      .from("production_schedule_entries")
      .select("schedule_id, recipe_id, production_date, quantity")
      .in("schedule_id", ids);

    const merged = new Map<string, ScheduleEntry>();

    for (const row of entryRows ?? []) {
      const key = `${row.recipe_id}|${row.production_date}`;
      const isDraft = draftId != null && row.schedule_id === draftId;

      // A live row is only used when the draft has not spoken about that cell.
      if (!isDraft && draftChanges.has(key)) continue;

      if (isDraft) draftChanges.add(key);

      merged.set(key, {
        recipeId: row.recipe_id as string,
        productionDate: row.production_date as string,
        quantity: Number(row.quantity ?? 0),
      });
    }

    entries = [...merged.values()].filter((entry) => entry.quantity !== 0);
  }

  return {
    schedule: scheduleRow
      ? {
          id: scheduleRow.id as string,
          name: scheduleRow.name as string,
          status: scheduleRow.status as ScheduleSummary["status"],
          periodStart: scheduleRow.period_start as string,
          periodEnd: scheduleRow.period_end as string,
          notes: (scheduleRow.notes as string | null) ?? null,
          confirmedAt: (scheduleRow.confirmed_at as string | null) ?? null,
          entryCount: entries.length,
        }
      : null,
    recipes,
    entries,
    windows,
    recipesById,
    linesByRecipeId,
    draftChanges,
    missingTable,
  };
}
