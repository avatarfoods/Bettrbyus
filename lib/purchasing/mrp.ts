// MRP engine: explodes the live production schedule through the multi-level
// BOM down to purchasable raw materials.
//
// Demand units:
//  - Batch recipes are demanded in LBS (schedule U/M = LBS).
//  - Per-unit recipes are demanded in units (bowls, cases).
// Material requirements accumulate as pounds (weight ingredients) or units
// (packaging). Case conversion happens later using materials.lbs_per_case.
//
// Resolution is FK-direct: every purchasing_recipe_lines row already carries
// material_id or sub_recipe_id, set by the live BOM editor (see
// lib/recipes/line-actions.ts). There is no ingredient-name matching here -
// that was the old Excel-import path's job, and it is gone. A line with
// neither FK set contributes zero and is reported in `unresolvedLines`
// instead of silently disappearing; see purchasing_recipe_lines_unresolved.

import type { WipRecipe, WipRecipeLine } from "@/lib/production/wip-explode";

export type ScheduleDemandEntry = {
  recipeId: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  quantity: number;
};

export type MaterialRequirement = {
  materialId: string;
  /** Ingredient names that contributed to this requirement, for a tooltip. */
  sourceNames: Set<string>;
  totalLbs: number;
  totalUnits: number;
};

export type UnresolvedLine = {
  recipeId: string;
  recipeName: string;
  ingredientName: string;
  totalLbs: number;
  totalUnits: number;
};

export type MrpResult = {
  requirements: Map<string, MaterialRequirement>;
  unresolvedLines: Map<string, UnresolvedLine>;
  warnings: string[];
};

const MAX_BOM_DEPTH = 12;

function isWeightUom(uom: string | null): boolean {
  if (!uom) return true;
  const value = uom.trim().toUpperCase();
  return value === "LB" || value === "LBS" || value === "OZ" || value === "POUND";
}

function toLbs(quantity: number, uom: string | null): number {
  const value = (uom ?? "LB").trim().toUpperCase();
  if (value === "OZ") return quantity / 16;
  return quantity;
}

/** Loss percentages are stored as e.g. -8 (8% lost) → need 8% more input. */
function lossFactor(lossPct: number | null): number {
  if (lossPct === null || lossPct === 0) return 1;
  return 1 + Math.abs(lossPct) / 100;
}

/**
 * Requirement contributed by one BOM line for a given demand of its recipe.
 * Returns lbs for weight lines and units for unit lines.
 *
 * Same arithmetic as explodeToNodes() in lib/production/wip-explode.ts and
 * deriveDemand() in lib/production/schedule/model.ts - all three have to
 * agree, or purchasing, the WIP calculator and the batch sheet would each be
 * working from a different number for the same line.
 */
function lineRequirement(
  recipe: WipRecipe,
  line: WipRecipeLine,
  demand: number
): { lbs: number; units: number } {
  if (recipe.batchSize !== null && recipe.batchSize !== 0) {
    // Batch recipe: demand is output lbs; line quantity is a share of batch.
    const fraction = line.quantity / recipe.batchSize;
    return { lbs: demand * fraction, units: 0 };
  }

  // Per-unit recipe: demand is output units.
  const factor = lossFactor(line.lossPct);
  if (isWeightUom(line.uom)) {
    return { lbs: demand * toLbs(line.quantity, line.uom) * factor, units: 0 };
  }
  return { lbs: 0, units: demand * line.quantity * factor };
}

export function computeMaterialRequirements(input: {
  recipesById: Map<string, WipRecipe>;
  linesByRecipeId: Map<string, WipRecipeLine[]>;
  scheduleEntries: ScheduleDemandEntry[];
  fromDate?: string;
  toDate?: string;
}): MrpResult {
  const { recipesById, linesByRecipeId, scheduleEntries, fromDate, toDate } = input;

  const warnings: string[] = [];
  const requirements = new Map<string, MaterialRequirement>();
  const unresolvedLines = new Map<string, UnresolvedLine>();

  function addMaterial(
    materialId: string,
    ingredientName: string,
    lbs: number,
    units: number
  ) {
    let requirement = requirements.get(materialId);
    if (!requirement) {
      requirement = { materialId, sourceNames: new Set(), totalLbs: 0, totalUnits: 0 };
      requirements.set(materialId, requirement);
    }
    requirement.sourceNames.add(ingredientName);
    requirement.totalLbs += lbs;
    requirement.totalUnits += units;
  }

  function addUnresolved(
    lineId: string,
    recipe: WipRecipe,
    ingredientName: string,
    lbs: number,
    units: number
  ) {
    let entry = unresolvedLines.get(lineId);
    if (!entry) {
      entry = {
        recipeId: recipe.id,
        recipeName: recipe.name,
        ingredientName,
        totalLbs: 0,
        totalUnits: 0,
      };
      unresolvedLines.set(lineId, entry);
    }
    entry.totalLbs += lbs;
    entry.totalUnits += units;
  }

  /**
   * Walk one recipe's BOM for a given demand, in either direction: down into
   * a sub-recipe, or accumulated onto a material.
   *
   * Every non-zero schedule entry is exploded as its own root - unlike
   * deriveDemand(), which only cascades from finished products to avoid
   * double-counting a subrecipe's own cascaded demand. A subrecipe scheduled
   * directly (a deliberate top-up) still consumes real ingredients, and
   * Master PO needs to count that.
   */
  function explode(
    recipeId: string,
    demand: number,
    depth: number,
    chain: string[]
  ): void {
    if (demand <= 0) return;
    if (depth > MAX_BOM_DEPTH) {
      warnings.push(`BOM too deep (possible cycle): ${chain.join(" -> ")}`);
      return;
    }

    const recipe = recipesById.get(recipeId);
    if (!recipe) return;
    if (chain.includes(recipeId)) {
      warnings.push(`BOM cycle detected: ${[...chain, recipeId].join(" -> ")}`);
      return;
    }

    const lines = linesByRecipeId.get(recipeId) ?? [];
    for (const line of lines) {
      const { lbs, units } = lineRequirement(recipe, line, demand);
      if (lbs <= 0 && units <= 0) continue;

      if (line.subRecipeId) {
        const subRecipe = recipesById.get(line.subRecipeId);
        if (!subRecipe) {
          addUnresolved(
            `${recipeId}:${line.subRecipeId}`,
            recipe,
            line.ingredientName,
            lbs,
            units
          );
          continue;
        }
        // Sub-recipe demand carries in whichever unit its own BOM expects -
        // a line written in the wrong one cannot be converted, only flagged.
        if (subRecipe.batchSize !== null && subRecipe.batchSize !== 0) {
          if (lbs > 0) {
            explode(line.subRecipeId, lbs, depth + 1, [...chain, recipeId]);
          } else {
            warnings.push(
              `"${recipe.name}" references batch recipe "${line.ingredientName}" in units; cannot convert.`
            );
          }
        } else {
          if (units > 0) {
            explode(line.subRecipeId, units, depth + 1, [...chain, recipeId]);
          } else {
            warnings.push(
              `"${recipe.name}" references per-unit recipe "${line.ingredientName}" by weight; cannot convert.`
            );
          }
        }
        continue;
      }

      if (line.materialId) {
        addMaterial(line.materialId, line.ingredientName, lbs, units);
        continue;
      }

      addUnresolved(
        `${recipeId}:${line.ingredientName}`,
        recipe,
        line.ingredientName,
        lbs,
        units
      );
    }
  }

  for (const entry of scheduleEntries) {
    if (!entry.quantity) continue;
    if (fromDate && entry.date < fromDate) continue;
    if (toDate && entry.date > toDate) continue;
    explode(entry.recipeId, entry.quantity, 0, []);
  }

  return { requirements, unresolvedLines, warnings };
}
