import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBom, fetchLiveScheduleDemand } from "@/lib/purchasing/live-demand";
import {
  computeMaterialRequirements,
  type ScheduleDemandEntry,
} from "@/lib/purchasing/mrp";
import type { ProductionConfig } from "@/lib/production/config";
import { isMissingTable } from "@/lib/supabase/missing";
import { allRows } from "@/lib/supabase/all-rows";
import type {
  PickingDriver,
  PickingMode,
  PickingResult,
  PickingRow,
  RecipeTotal,
} from "@/lib/production/picking/types";
import { isFinishedProduct, linePerOutputUnit } from "@/lib/production/wip-explode";

/** The workbook's two buffers: 5% on the day's usage, 15% on an open order. */
export const DEFAULT_EXTRA: Record<PickingMode, number> = { daily: 5, open: 15 };

type MaterialRow = {
  id: string;
  item_code: string;
  name: string;
  lbs_per_case: number | null;
  odoo_product_id: number | null;
  odoo_company_id: number | null;
  odoo_company_name: string | null;
  active: boolean;
};

type PickRow = {
  material_id: string;
  pick_department: string | null;
  pick_type: string | null;
  pack_size: number | null;
  pack_uom: string | null;
  case_description: string | null;
  pack_synced_at: string | null;
};

/** Odoo says "Lbs", "Unit", "Each"...; the sheet needs to know weight or not. */
export function packUomIsWeight(uom: string | null): boolean {
  return /lb|pound|#/i.test(uom ?? "");
}

/**
 * What the runs planned on a day pull, one level deep.
 *
 * Each scheduled recipe contributes its own material lines, times its planned
 * quantity, and nothing below: a sub-recipe on a line is made by its own
 * scheduled run, on its own day, and counted there. Same arithmetic per line
 * as the MRP, so a batch never costs a different amount here.
 */
function directRequirements(
  bom: Awaited<ReturnType<typeof fetchBom>>,
  entries: ScheduleDemandEntry[]
): ReturnType<typeof computeMaterialRequirements> {
  const requirements = new Map<string, { materialId: string; sourceNames: Set<string>; totalLbs: number; totalUnits: number }>();
  const unresolvedLines = new Map<string, { recipeId: string; recipeName: string; ingredientName: string; totalLbs: number; totalUnits: number }>();
  const warnings: string[] = [];
  for (const entry of entries) {
    if (entry.quantity <= 0) continue;
    const recipe = bom.recipesById.get(entry.recipeId);
    if (!recipe) continue;
    const lines = bom.linesByRecipeId.get(recipe.id) ?? [];
    for (const line of lines) {
      if (line.subRecipeId) continue;
      const per = linePerOutputUnit(recipe, line, lines);
      const quantity = entry.quantity * per.quantity;
      if (!quantity) continue;
      const lbs = per.isWeight ? quantity : 0;
      const units = per.isWeight ? 0 : quantity;
      if (!line.materialId) {
        const key = `${recipe.id}:${line.ingredientName}`;
        const open = unresolvedLines.get(key) ?? {
          recipeId: recipe.id,
          recipeName: recipe.name,
          ingredientName: line.ingredientName,
          totalLbs: 0,
          totalUnits: 0,
        };
        open.totalLbs += lbs;
        open.totalUnits += units;
        unresolvedLines.set(key, open);
        continue;
      }
      const need = requirements.get(line.materialId) ?? {
        materialId: line.materialId,
        sourceNames: new Set<string>(),
        totalLbs: 0,
        totalUnits: 0,
      };
      need.sourceNames.add(recipe.name);
      need.totalLbs += lbs;
      need.totalUnits += units;
      requirements.set(line.materialId, need);
    }
  }
  return { requirements, unresolvedLines, warnings };
}

/**
 * Every material a line's recipes can reach, through any depth of the tree.
 *
 * A line is its departments (Settings), a department is its recipes, and a
 * recipe is what it is made from - down to the raw materials.
 */
function reachableMaterials(
  bom: Awaited<ReturnType<typeof fetchBom>>,
  config: ProductionConfig,
  lineName: string
): Set<string> {
  const departments = new Set(
    config.departments
      .filter((entry) => entry.active && entry.lineName === lineName)
      .map((entry) => entry.name.trim().toUpperCase())
  );
  const out = new Set<string>();
  const seen = new Set<string>();
  const walk = (recipeId: string, depth: number) => {
    if (depth > 12 || seen.has(recipeId)) return;
    seen.add(recipeId);
    for (const line of bom.linesByRecipeId.get(recipeId) ?? []) {
      if (line.materialId) out.add(line.materialId);
      if (line.subRecipeId) walk(line.subRecipeId, depth + 1);
    }
  };
  for (const recipe of bom.recipesById.values()) {
    if (departments.has((recipe.department ?? "").trim().toUpperCase())) walk(recipe.id, 0);
  }
  return out;
}

/**
 * Everything the picking sheet shows, computed live from the plan.
 *
 * Both modes read the live plan for the dates. They differ in how far down
 * they look:
 *
 * - Daily usage is what each room pulls for the runs planned that day: every
 *   scheduled recipe, its own direct materials only. The stew's ingredients
 *   belong to the day the stew is made, not to the day the bowl is packed.
 * - Open order is the whole tree behind the finished products planned that
 *   day: 500 cases of a bowl, and everything those 500 cases consume from
 *   the top down, whatever is planned for the steps in between.
 *
 * Open order goes through the same MRP engine the buying cycle uses, so the
 * two never disagree about how much a batch takes.
 */
export async function computePicking(
  supabase: SupabaseClient,
  config: ProductionConfig,
  input: {
    mode: PickingMode;
    from: string;
    to: string;
    extraPct: number;
    /** production_lines.id, or null for every line. */
    lineId: string | null;
    /** The line's name, to pick the right order tab. */
    lineName: string | null;
    /** Odoo company id to read materials from, or null for all. */
    companyId: number | null;
  }
): Promise<PickingResult> {
  const { mode, from, to, extraPct } = input;
  const factor = extraPct > 0 ? 1 + extraPct / 100 : 1;

  const [bom, materialsRes, picksRes, inventoryRes] = await Promise.all([
    fetchBom(supabase),
    allRows<MaterialRow>((start, end) =>
      supabase
        .from("purchasing_materials")
        .select(
          "id, item_code, name, lbs_per_case, odoo_product_id, odoo_company_id, odoo_company_name, active"
        )
        .eq("active", true)
        .range(start, end)
    ),
    supabase.from("production_picking_materials").select("*"),
    allRows<{ material_id: string; qty_on_hand: number | null; fetched_at: string | null }>(
      (start, end) =>
        supabase
          .from("purchasing_current_inventory")
          .select("material_id, qty_on_hand, fetched_at")
          .range(start, end)
    ),
  ]);

  const warnings: string[] = [];
  const missingTable = Boolean(picksRes.error && isMissingTable(picksRes.error));
  if (picksRes.error && !missingTable) warnings.push(picksRes.error.message);
  if (materialsRes.error) warnings.push(materialsRes.error);
  if (inventoryRes.error) warnings.push(inventoryRes.error);

  const picks = new Map<string, PickRow>(
    ((picksRes.data ?? []) as PickRow[]).map((row) => [row.material_id, row])
  );
  const onHand = new Map<string, number>();
  for (const row of inventoryRes.rows) {
    if (row.qty_on_hand !== null) onHand.set(row.material_id, Number(row.qty_on_hand));
  }
  /*
    Raw materials are Odoo's. A material row with no Odoo product is a leftover
    from the old workbook import (the ONBUILD placeholders) and is not on this
    sheet; a recipe line still pointing at one is reported below so it can be
    re-pointed at the real product.
  */
  const materials = new Map<string, MaterialRow>();
  const offOdoo = new Map<string, MaterialRow>();
  for (const row of materialsRes.rows) {
    if (row.odoo_product_id !== null) materials.set(row.id, row);
    else offOdoo.set(row.id, row);
  }

  // ------------------------------------------------------------ demand
  let entries: ScheduleDemandEntry[] = [];
  const drivers: PickingDriver[] = [];

  const planned = await fetchLiveScheduleDemand(supabase, {
    fromDate: from,
    toDate: to,
    lineId: input.lineId,
  });
  const finished = (recipeId: string) => {
    const recipe = bom.recipesById.get(recipeId);
    return recipe ? isFinishedProduct(recipe) : false;
  };
  // Open order starts from the finished products alone; daily usage from
  // every run on the plan.
  entries = mode === "open" ? planned.filter((entry) => finished(entry.recipeId)) : planned;

  // What drove it: the finished products planned in the window.
  const byRecipe = new Map<string, number>();
  for (const entry of planned) {
    if (!finished(entry.recipeId)) continue;
    byRecipe.set(entry.recipeId, (byRecipe.get(entry.recipeId) ?? 0) + entry.quantity);
  }
  for (const [recipeId, quantity] of byRecipe) {
    const recipe = bom.recipesById.get(recipeId)!;
    drivers.push({
      recipeId,
      wipCode: recipe.wipCode,
      name: recipe.name,
      quantity,
      uom: recipe.uom,
    });
  }
  drivers.sort((a, b) => b.quantity - a.quantity);

  // ------------------------------------------------------------ recipes
  /*
    The same walk the MRP does, stopped one level short: how much of every
    recipe - the bowls, then the mixes, stews and cuts beneath them - the
    window asks for, in the recipe's own unit. The call sheet, in other words.
  */
  const recipeQty = new Map<string, number>();
  const walkRecipe = (recipeId: string, demand: number, depth: number, trail: Set<string>) => {
    if (depth > 12 || trail.has(recipeId) || !demand) return;
    const recipe = bom.recipesById.get(recipeId);
    if (!recipe) return;
    recipeQty.set(recipeId, (recipeQty.get(recipeId) ?? 0) + demand);
    trail.add(recipeId);
    const lines = bom.linesByRecipeId.get(recipeId) ?? [];
    for (const line of lines) {
      if (!line.subRecipeId) continue;
      const per = linePerOutputUnit(recipe, line, lines);
      walkRecipe(line.subRecipeId, demand * per.quantity, depth + 1, trail);
    }
    trail.delete(recipeId);
  };
  if (mode === "open") {
    for (const entry of entries) walkRecipe(entry.recipeId, entry.quantity, 0, new Set());
  } else {
    for (const entry of entries) {
      recipeQty.set(entry.recipeId, (recipeQty.get(entry.recipeId) ?? 0) + entry.quantity);
    }
  }
  const recipeTotals: RecipeTotal[] = [...recipeQty.entries()]
    .map(([recipeId, quantity]) => {
      const recipe = bom.recipesById.get(recipeId)!;
      const batch = recipe.batchSize !== null && recipe.batchSize !== 0;
      const output = batch ? recipe.batchYield || recipe.batchSize! : null;
      return {
        recipeId,
        wipCode: recipe.wipCode,
        name: recipe.name,
        department: recipe.department,
        quantity,
        unit: batch ? ("lb" as const) : ("ea" as const),
        batches: output ? quantity / output : null,
        isFinished: isFinishedProduct(recipe),
      };
    })
    .sort(
      (a, b) =>
        Number(b.isFinished) - Number(a.isFinished) ||
        (a.department ?? "~").localeCompare(b.department ?? "~") ||
        a.name.localeCompare(b.name)
    );

  // ------------------------------------------------------------ explode
  const mrp =
    mode === "open"
      ? computeMaterialRequirements({
          recipesById: bom.recipesById,
          linesByRecipeId: bom.linesByRecipeId,
          scheduleEntries: entries,
        })
      : directRequirements(bom, entries);
  warnings.push(...mrp.warnings);

  // ------------------------------------------------------------ rows
  const rows: PickingRow[] = [];
  let withoutPack = 0;
  let packSyncedAt: string | null = null;
  for (const pick of picks.values()) {
    if (pick.pack_synced_at && (!packSyncedAt || pick.pack_synced_at > packSyncedAt)) {
      packSyncedAt = pick.pack_synced_at;
    }
  }

  /*
    Which materials are on the sheet at all.

    Every active material for the place, so the sheet reads as the plant's
    whole stock list with numbers where the plan asks for something. Choosing
    a line narrows it to what that line's recipes can reach - a Pita flour is
    not a Bettr Bowl material, however the plan is set.
  */
  const reachable = input.lineName ? reachableMaterials(bom, config, input.lineName) : null;
  const universe = [...materials.values()].filter((material) => {
    if (
      input.companyId !== null &&
      material.odoo_company_id !== null &&
      material.odoo_company_id !== input.companyId
    ) {
      return false;
    }
    return reachable === null || reachable.has(material.id);
  });

  for (const material of universe) {
    const requirement = mrp.requirements.get(material.id) ?? {
      materialId: material.id,
      sourceNames: new Set<string>(),
      totalLbs: 0,
      totalUnits: 0,
    };
    const pick = picks.get(material.id);

    // Weight or pieces: what the recipes asked in; for a material nothing
    // asks for yet, whatever Odoo counts its case in.
    const asked = requirement.totalLbs + requirement.totalUnits > 0;
    const unit: "lb" | "ea" = asked
      ? requirement.totalLbs >= requirement.totalUnits
        ? "lb"
        : "ea"
      : packUomIsWeight(pick?.pack_uom ?? "Lbs")
        ? "lb"
        : "ea";
    const needRaw = unit === "lb" ? requirement.totalLbs : requirement.totalUnits;
    const need = needRaw * factor;

    // Odoo's pack size first; the purchasing table's pounds per case as the
    // fallback for weight; nothing for pieces without a pack size.
    let packSize: number | null = null;
    let packUom: string | null = null;
    let packSource: PickingRow["packSource"] = "none";
    if (pick?.pack_size && Number(pick.pack_size) > 0) {
      packSize = Number(pick.pack_size);
      packUom = pick.pack_uom;
      packSource = "odoo";
    } else if (unit === "lb" && material.lbs_per_case && Number(material.lbs_per_case) > 0) {
      packSize = Number(material.lbs_per_case);
      packUom = "Lbs";
      packSource = "purchasing";
    }
    // A pack size in pounds cannot divide a need in pieces, or the other way.
    // A blank U/M in Odoo is taken to mean whatever the recipes count in.
    if (packSize !== null && packUom !== null && packSource === "odoo") {
      const weightPack = packUomIsWeight(packUom);
      if ((unit === "lb") !== weightPack) {
        // Still divide - the number is what the sheet has always done - but
        // say so, because the case count is only right if the units agree.
        warnings.push(
          `${material.item_code} ${material.name}: recipes ask in ${unit === "lb" ? "pounds" : "pieces"} but Odoo's pack size is in ${packUom}`
        );
      }
    }
    if (packSize === null && need > 0.0001) withoutPack += 1;

    const cases = packSize !== null ? need / packSize : null;
    const held = onHand.has(material.id) ? onHand.get(material.id)! : null;
    // Whole cases to pull. On hand is shown beside it as information, not
    // taken off: the sheet says what the plan needs, the picker decides.
    const toPick = cases === null ? null : Math.ceil(cases - 1e-9);

    rows.push({
      materialId: material.id,
      itemCode: material.item_code,
      name: material.name,
      department: pick?.pick_department ?? null,
      type: pick?.pick_type ?? null,
      company: material.odoo_company_name,
      needLbs: requirement.totalLbs,
      needUnits: requirement.totalUnits,
      unit,
      need,
      packSize,
      packUom,
      caseDescription: pick?.case_description ?? null,
      packSource,
      cases,
      onHand: held,
      toPick,
      sources: [...requirement.sourceNames].sort(),
    });
  }

  rows.sort(
    (a, b) =>
      (a.department ?? "~").localeCompare(b.department ?? "~") ||
      (a.type ?? "~").localeCompare(b.type ?? "~") ||
      a.name.localeCompare(b.name)
  );

  const unresolved = [...mrp.unresolvedLines.values()].map((line) => ({
    recipeName: line.recipeName,
    ingredientName: line.ingredientName,
    totalLbs: line.totalLbs,
    totalUnits: line.totalUnits,
  }));
  for (const requirement of mrp.requirements.values()) {
    const ghost = offOdoo.get(requirement.materialId);
    if (!ghost) continue;
    unresolved.push({
      recipeName: `${ghost.item_code} ${ghost.name} is not an Odoo product`,
      ingredientName: `used by ${[...requirement.sourceNames].sort().join(", ")}`,
      totalLbs: requirement.totalLbs,
      totalUnits: requirement.totalUnits,
    });
  }

  return {
    mode,
    from,
    to,
    extraPct,
    rows,
    drivers,
    recipeTotals,
    unresolved,
    warnings: [...new Set(warnings)],
    missingTable,
    withoutPack,
    packSyncedAt,
  };
}
