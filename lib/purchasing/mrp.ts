// MRP engine: explodes the production schedule through the multi-level BOM
// down to purchasable raw materials.
//
// Demand units:
//  - Batch recipes are demanded in LBS (schedule U/M = LBS).
//  - Per-unit recipes are demanded in units (bowls, cases).
// Material requirements accumulate as pounds (weight ingredients) or units
// (packaging). Case conversion happens later using materials.lbs_per_case.

import type {
  ParsedRecipe,
  ParsedRecipeLine,
  ParsedScheduleEntry,
} from "@/lib/purchasing/master-parser";

// Kept dependency-free (type-only imports) so it can run under plain Node for
// verification against the real workbook. Same normalization as the parser.
function normalizeIngredientName(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

export type ResolvedTarget =
  | { type: "recipe"; wipCode: string }
  | { type: "material"; itemCode: string }
  | { type: "ignore" }
  | { type: "unresolved" };

export type ResolveIngredient = (ingredientName: string) => ResolvedTarget;

export type MaterialRequirement = {
  itemCode: string;
  /** Ingredient names that contributed to this requirement. */
  sourceNames: Set<string>;
  totalLbs: number;
  totalUnits: number;
};

export type UnresolvedIngredient = {
  ingredientName: string;
  totalLbs: number;
  totalUnits: number;
  recipes: Set<string>;
};

export type MrpResult = {
  requirements: Map<string, MaterialRequirement>;
  unresolved: Map<string, UnresolvedIngredient>;
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
 */
function lineRequirement(
  recipe: ParsedRecipe,
  line: ParsedRecipeLine,
  demand: number
): { lbs: number; units: number } {
  if (recipe.batchSize !== null) {
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

export function computeRequirements(
  recipes: ParsedRecipe[],
  scheduleEntries: ParsedScheduleEntry[],
  resolve: ResolveIngredient,
  range?: { fromDate?: string; toDate?: string }
): MrpResult {
  const warnings: string[] = [];
  const requirements = new Map<string, MaterialRequirement>();
  const unresolved = new Map<string, UnresolvedIngredient>();

  const recipeByWip = new Map<string, ParsedRecipe>();
  for (const recipe of recipes) recipeByWip.set(recipe.wipCode, recipe);

  const missingRecipeWarnings = new Set<string>();

  function addMaterial(
    itemCode: string,
    ingredientName: string,
    lbs: number,
    units: number
  ) {
    let requirement = requirements.get(itemCode);
    if (!requirement) {
      requirement = { itemCode, sourceNames: new Set(), totalLbs: 0, totalUnits: 0 };
      requirements.set(itemCode, requirement);
    }
    requirement.sourceNames.add(ingredientName);
    requirement.totalLbs += lbs;
    requirement.totalUnits += units;
  }

  function addUnresolved(
    ingredientName: string,
    recipeName: string,
    lbs: number,
    units: number
  ) {
    const key = normalizeIngredientName(ingredientName);
    let entry = unresolved.get(key);
    if (!entry) {
      entry = { ingredientName, totalLbs: 0, totalUnits: 0, recipes: new Set() };
      unresolved.set(key, entry);
    }
    entry.totalLbs += lbs;
    entry.totalUnits += units;
    entry.recipes.add(recipeName);
  }

  function explode(wipCode: string, demand: number, depth: number, chain: string[]) {
    if (demand <= 0) return;
    if (depth > MAX_BOM_DEPTH) {
      warnings.push(`BOM too deep (possible cycle): ${chain.join(" -> ")}`);
      return;
    }

    const recipe = recipeByWip.get(wipCode);
    if (!recipe) {
      if (!missingRecipeWarnings.has(wipCode)) {
        missingRecipeWarnings.add(wipCode);
        warnings.push(`No recipe found for scheduled WIP ${wipCode}.`);
      }
      return;
    }
    if (chain.includes(wipCode)) {
      warnings.push(`BOM cycle detected: ${[...chain, wipCode].join(" -> ")}`);
      return;
    }

    for (const line of recipe.lines) {
      const { lbs, units } = lineRequirement(recipe, line, demand);
      if (lbs <= 0 && units <= 0) continue;

      const target = resolve(line.ingredientName);

      if (target.type === "ignore") continue;

      if (target.type === "recipe") {
        const subRecipe = recipeByWip.get(target.wipCode);
        if (!subRecipe) {
          addUnresolved(line.ingredientName, recipe.name, lbs, units);
          continue;
        }
        if (subRecipe.batchSize !== null) {
          // Sub-recipe demanded by weight.
          if (lbs > 0) {
            explode(target.wipCode, lbs, depth + 1, [...chain, wipCode]);
          } else {
            warnings.push(
              `"${recipe.name}" references batch recipe "${line.ingredientName}" in units; cannot convert.`
            );
          }
        } else {
          // Sub-recipe demanded in units.
          if (units > 0) {
            explode(target.wipCode, units, depth + 1, [...chain, wipCode]);
          } else {
            warnings.push(
              `"${recipe.name}" references per-unit recipe "${line.ingredientName}" by weight; cannot convert.`
            );
          }
        }
        continue;
      }

      if (target.type === "material") {
        addMaterial(target.itemCode, line.ingredientName, lbs, units);
        continue;
      }

      addUnresolved(line.ingredientName, recipe.name, lbs, units);
    }
  }

  for (const entry of scheduleEntries) {
    if (range?.fromDate && entry.date < range.fromDate) continue;
    if (range?.toDate && entry.date > range.toDate) continue;
    explode(entry.wipCode, entry.quantity, 0, []);
  }

  return { requirements, unresolved, warnings };
}

/**
 * Build the default ingredient-name resolver from parsed matrix data plus
 * saved aliases and the materials catalog.
 */
export function buildResolver(input: {
  recipes: ParsedRecipe[];
  /** normalized name -> WIP code (from matrix subrecipes + parsed recipes) */
  recipeNames: Map<string, string>;
  /** normalized name -> item_code (from matrix ingredients + materials catalog) */
  materialNames: Map<string, string>;
  /** normalized alias -> item_code (user-maintained) */
  aliases: Map<string, string>;
}): ResolveIngredient {
  const recipeWips = new Set(input.recipes.map((recipe) => recipe.wipCode));

  return (ingredientName: string) => {
    const key = normalizeIngredientName(ingredientName);
    if (!key) return { type: "ignore" };

    const wipCode = input.recipeNames.get(key);
    if (wipCode) return { type: "recipe", wipCode };

    const aliasCode = input.aliases.get(key);
    if (aliasCode) {
      // Same code can appear as a WIP and a matrix item (e.g. produce preps).
      // Prefer exploding the recipe so Master PO buys the raw inputs.
      if (recipeWips.has(aliasCode)) return { type: "recipe", wipCode: aliasCode };
      return { type: "material", itemCode: aliasCode };
    }

    const itemCode = input.materialNames.get(key);
    if (itemCode) {
      if (recipeWips.has(itemCode)) return { type: "recipe", wipCode: itemCode };
      return { type: "material", itemCode };
    }

    return { type: "unresolved" };
  };
}
