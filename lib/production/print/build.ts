import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchScheduleData } from "@/lib/production/schedule/fetch";
import { allRows } from "@/lib/supabase/all-rows";
import {
  allocateRecipe,
  deriveDemand,
  type ScheduleEntry,
} from "@/lib/production/schedule/model";

/**
 * What goes on paper for one production day.
 *
 * The floor prints department by department, so everything here is grouped
 * that way and each group is a page break. Quantities come from the schedule
 * rather than being recalculated: the sheet in someone's hand has to say the
 * same number the schedule showed when it was confirmed, or the print-out
 * becomes a second source of truth.
 */

export type PrintIngredient = {
  name: string;
  itemCode: string | null;
  quantity: number;
  uom: string | null;
  isSubRecipe: boolean;
};

export type PrintStep = {
  stepNumber: number;
  body: string;
  targetTemp: string | null;
  targetTime: string | null;
  equipment: string | null;
  requiresSignoff: boolean;
};

export type BatchSheet = {
  recipeId: string;
  wipCode: string;
  name: string;
  department: string | null;
  uom: string | null;
  /** What the schedule says to make on this date. */
  quantity: number;
  /** Batch size from the recipe, when it is a batch recipe. */
  batchSize: number | null;
  /** quantity / batchSize, rounded up - how many batches to run. */
  batches: number | null;
  /** Scaled to the scheduled quantity. */
  ingredients: PrintIngredient[];
  steps: PrintStep[];
  allergens: string[];
  /** Which finished products this run is for, and when they are needed. */
  servesDates: string[];
};

export type DepartmentSheets = {
  department: string;
  sheets: BatchSheet[];
  /** Totals for the department header. */
  totalPounds: number;
  totalUnits: number;
};

export type ProductionDayPrint = {
  date: string;
  scheduleName: string;
  scheduleStatus: string;
  departments: DepartmentSheets[];
  /** Finished products going out, for the production report. */
  finished: {
    recipeId: string;
    wipCode: string;
    name: string;
    quantity: number;
    uom: string | null;
  }[];
  missingTable: boolean;
};

function isWeight(uom: string | null): boolean {
  const value = (uom ?? "LB").trim().toUpperCase();
  return value === "LB" || value === "LBS" || value === "POUND" || value === "OZ";
}

function toPounds(quantity: number, uom: string | null): number {
  return (uom ?? "").trim().toUpperCase() === "OZ" ? quantity / 16 : quantity;
}

/** Loss is stored as -8 meaning 8% lost, so 8% more input is needed. */
function lossFactor(lossPct: number | null): number {
  if (lossPct === null || lossPct === 0) return 1;
  return 1 + Math.abs(lossPct) / 100;
}

export async function buildProductionDay(
  supabase: SupabaseClient,
  date: string,
  scheduleId?: string
): Promise<ProductionDayPrint> {
  const data = await fetchScheduleData(supabase, scheduleId);

  const empty: ProductionDayPrint = {
    date,
    scheduleName: data.schedule?.name ?? "",
    scheduleStatus: data.schedule?.status ?? "",
    departments: [],
    finished: [],
    missingTable: data.missingTable,
  };

  if (data.missingTable || !data.schedule) return empty;

  const today: ScheduleEntry[] = data.entries.filter(
    (entry) => entry.productionDate === date
  );
  if (today.length === 0) return empty;

  const demand = deriveDemand({
    entries: data.entries,
    recipesById: data.recipesById,
    linesByRecipeId: data.linesByRecipeId,
    windows: data.windows,
  });

  // Instructions and allergens, only for the recipes actually being made.
  const recipeIds = today.map((entry) => entry.recipeId);

  const [stepsResult, materialsResult] = await Promise.all([
    supabase
      .from("recipe_instructions")
      .select(
        "recipe_id, step_number, body, target_temp, target_time, equipment, requires_signoff"
      )
      .in("recipe_id", recipeIds)
      .order("step_number"),
    // Paged: there are more materials than one PostgREST response returns,
    // and a missing one prints a blank item number on a floor sheet.
    allRows<{ id: string; item_code: string }>((from, to) =>
      supabase.from("purchasing_materials").select("id, item_code").range(from, to)
    ),
  ]);

  const stepsByRecipe = new Map<string, PrintStep[]>();
  for (const row of (stepsResult.data ?? []) as Record<string, unknown>[]) {
    const id = row.recipe_id as string;
    const list = stepsByRecipe.get(id) ?? [];
    list.push({
      stepNumber: row.step_number as number,
      body: (row.body as string) ?? "",
      targetTemp: (row.target_temp as string | null) ?? null,
      targetTime: (row.target_time as string | null) ?? null,
      equipment: (row.equipment as string | null) ?? null,
      requiresSignoff: Boolean(row.requires_signoff),
    });
    stepsByRecipe.set(id, list);
  }

  const codeByMaterial = new Map<string, string>();
  for (const row of (materialsResult.rows) as Record<string, unknown>[]) {
    codeByMaterial.set(row.id as string, (row.item_code as string) ?? "");
  }

  const byDepartment = new Map<string, BatchSheet[]>();

  for (const entry of today) {
    const recipe = data.recipesById.get(entry.recipeId);
    if (!recipe) continue;

    const lines = data.linesByRecipeId.get(entry.recipeId) ?? [];

    // Same arithmetic as the BOM explosion, so a printed sheet and the app
    // never disagree about how much of something a run takes.
    const ingredients: PrintIngredient[] = lines.map((line) => {
      const scaled =
        recipe.batchSize !== null && recipe.batchSize !== 0
          ? (entry.quantity * line.quantity) / recipe.batchSize
          : entry.quantity *
            (isWeight(line.uom) ? toPounds(line.quantity, line.uom) : line.quantity) *
            lossFactor(line.lossPct);

      const sub = line.subRecipeId
        ? data.recipesById.get(line.subRecipeId)
        : null;

      return {
        name: sub?.name ?? line.ingredientName,
        itemCode: sub
          ? sub.wipCode
          : line.materialId
            ? (codeByMaterial.get(line.materialId) ?? null)
            : null,
        quantity: scaled,
        uom: sub?.uom ?? line.uom,
        isSubRecipe: Boolean(line.subRecipeId),
      };
    });

    const allocation = allocateRecipe(
      data.entries
        .filter((e) => e.recipeId === entry.recipeId)
        .map((e) => ({ date: e.productionDate, quantity: e.quantity })),
      demand.get(entry.recipeId),
      data.windows.get(entry.recipeId)
    );

    const sheet: BatchSheet = {
      recipeId: entry.recipeId,
      wipCode: recipe.wipCode,
      name: recipe.name,
      department: recipe.department,
      uom: recipe.uom,
      quantity: entry.quantity,
      batchSize: recipe.batchSize,
      batches:
        recipe.batchSize && recipe.batchSize > 0
          ? Math.ceil(entry.quantity / recipe.batchSize)
          : null,
      ingredients,
      steps: stepsByRecipe.get(entry.recipeId) ?? [],
      allergens: [],
      servesDates: allocation.byRun.get(date)?.servesDates ?? [],
    };

    const key = recipe.department ?? "Unassigned";
    const list = byDepartment.get(key) ?? [];
    list.push(sheet);
    byDepartment.set(key, list);
  }

  const departments: DepartmentSheets[] = [...byDepartment.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([department, sheets]) => ({
      department,
      sheets: sheets.sort((a, b) => a.name.localeCompare(b.name)),
      totalPounds: sheets
        .filter((s) => isWeight(s.uom))
        .reduce((sum, s) => sum + toPounds(s.quantity, s.uom), 0),
      totalUnits: sheets
        .filter((s) => !isWeight(s.uom))
        .reduce((sum, s) => sum + s.quantity, 0),
    }));

  const finishedIds = new Set(
    data.recipes.filter((r) => r.isFinished).map((r) => r.id)
  );

  return {
    date,
    scheduleName: data.schedule.name,
    scheduleStatus: data.schedule.status,
    departments,
    finished: today
      .filter((entry) => finishedIds.has(entry.recipeId))
      .map((entry) => {
        const recipe = data.recipesById.get(entry.recipeId)!;
        return {
          recipeId: entry.recipeId,
          wipCode: recipe.wipCode,
          name: recipe.name,
          quantity: entry.quantity,
          uom: recipe.uom,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    missingTable: false,
  };
}

/**
 * The production need: every subrecipe a day's finished products require,
 * whether or not it has been scheduled.
 *
 * This is the sheet Carlos prints department by department to tell each
 * area what to make, so it is demand-driven rather than schedule-driven -
 * it shows the gap as well as the plan.
 */
export type NeedRow = {
  recipeId: string;
  wipCode: string;
  name: string;
  department: string | null;
  uom: string | null;
  needed: number;
  scheduled: number;
  gap: number;
};

export async function buildProductionNeed(
  supabase: SupabaseClient,
  date: string,
  scheduleId?: string
): Promise<{
  date: string;
  scheduleName: string;
  departments: { department: string; rows: NeedRow[] }[];
  missingTable: boolean;
}> {
  const data = await fetchScheduleData(supabase, scheduleId);

  if (data.missingTable || !data.schedule) {
    return {
      date,
      scheduleName: data.schedule?.name ?? "",
      departments: [],
      missingTable: data.missingTable,
    };
  }

  const demand = deriveDemand({
    entries: data.entries,
    recipesById: data.recipesById,
    linesByRecipeId: data.linesByRecipeId,
    windows: data.windows,
  });

  const scheduledToday = new Map<string, number>();
  for (const entry of data.entries) {
    if (entry.productionDate !== date) continue;
    scheduledToday.set(
      entry.recipeId,
      (scheduledToday.get(entry.recipeId) ?? 0) + entry.quantity
    );
  }

  const rows: NeedRow[] = [];
  const seen = new Set<string>();

  for (const [recipeId, recipeDemand] of demand) {
    const needed =
      recipeDemand.days.find((day) => day.date === date)?.quantity ?? 0;
    const scheduled = scheduledToday.get(recipeId) ?? 0;
    if (needed <= 0.0001 && scheduled <= 0.0001) continue;

    const recipe = data.recipesById.get(recipeId);
    if (!recipe) continue;

    seen.add(recipeId);
    rows.push({
      recipeId,
      wipCode: recipe.wipCode,
      name: recipe.name,
      department: recipe.department,
      uom: recipe.uom,
      needed,
      scheduled,
      gap: needed - scheduled,
    });
  }

  // Anything scheduled that nothing needs still has to appear, or the sheet
  // would omit work the floor has been told to do.
  for (const [recipeId, scheduled] of scheduledToday) {
    if (seen.has(recipeId)) continue;
    const recipe = data.recipesById.get(recipeId);
    if (!recipe) continue;
    rows.push({
      recipeId,
      wipCode: recipe.wipCode,
      name: recipe.name,
      department: recipe.department,
      uom: recipe.uom,
      needed: 0,
      scheduled,
      gap: -scheduled,
    });
  }

  const byDepartment = new Map<string, NeedRow[]>();
  for (const row of rows) {
    const key = row.department ?? "Unassigned";
    const list = byDepartment.get(key) ?? [];
    list.push(row);
    byDepartment.set(key, list);
  }

  return {
    date,
    scheduleName: data.schedule.name,
    departments: [...byDepartment.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([department, list]) => ({
        department,
        rows: list.sort((a, b) => a.name.localeCompare(b.name)),
      })),
    missingTable: false,
  };
}
