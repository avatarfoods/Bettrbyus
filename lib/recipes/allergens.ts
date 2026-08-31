import { odooSession } from "@/lib/odoo/client";

/**
 * Allergens, read from Odoo and rolled up the recipe tree.
 *
 * The rule: an allergen belongs to the ingredient, and any recipe containing
 * that ingredient inherits it. Beef Birria shows Milk and Wheat because the
 * dressing carries Milk and the meat carries Wheat. Nobody types an allergen
 * on a recipe — it is always the union of what is underneath, so it cannot go
 * stale when a formula changes.
 *
 * The distinction that matters here is between "no allergen" and "nobody said".
 * Only half the ingredients in use have answered the question, and the blanks
 * include real allergens (both soy sauces, the toasted sesame seeds). A recipe
 * built from unanswered ingredients must therefore never print a confident
 * "None" — it reports what is unverified instead, and the floor can tell the
 * difference between a clean formula and an unfinished one.
 *
 * Known limitation: Odoo's x_studio_allergy_statement is a single-select, so
 * one ingredient can only record one allergen. An ingredient that genuinely
 * contains two cannot be captured until that field becomes multi-select (the
 * empty x_studio_allergen many2many fields look like an abandoned attempt at
 * exactly this).
 */

const ALLERGEN_FIELD = "x_studio_allergy_statement";

/** Values Odoo offers. "N/A" means declared clean, not unknown. */
export const ALLERGENS = [
  "Milk",
  "Egg",
  "Fish",
  "Soy",
  "Sesame",
  "Wheat",
  "Nuts",
] as const;

export type AllergenIndex = {
  /** Odoo product id -> the allergen it carries. Only real allergens. */
  stated: Map<number, string>;
  /**
   * Odoo product ids that answered the question at all, "N/A" included.
   * Anything used in a recipe but absent here is unverified, not clean.
   */
  answered: Set<number>;
  /** False when Odoo could not be reached, which makes every line unverified. */
  available: boolean;
};

function isRealAllergen(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value.toUpperCase() !== "N/A" &&
    value.toUpperCase() !== "NONE"
  );
}

function answeredAtAll(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Allergen state per Odoo product. Returns an empty, unavailable index when
 * Odoo cannot be reached — a recipe page should still render, and every line
 * then reads as unverified rather than silently clean.
 */
export async function fetchAllergens(): Promise<AllergenIndex> {
  const stated = new Map<number, string>();
  const answered = new Set<number>();

  try {
    const { call } = await odooSession();
    const rows = (await call(
      "product.product",
      "search_read",
      [[[ALLERGEN_FIELD, "!=", false]]],
      { fields: ["id", ALLERGEN_FIELD], limit: 20000 }
    )) as Record<string, unknown>[];

    for (const row of rows) {
      const value = row[ALLERGEN_FIELD];
      const id = row.id as number;
      if (!answeredAtAll(value)) continue;
      answered.add(id);
      if (isRealAllergen(value)) stated.set(id, value);
    }
  } catch {
    return { stated, answered, available: false };
  }

  return { stated, answered, available: true };
}

export type AllergenRollup = {
  /** Allergens present anywhere beneath this recipe. */
  allergens: string[];
  /** Ingredient names that contributed each allergen, for the tooltip. */
  sources: Map<string, string[]>;
  /**
   * Food ingredients beneath this recipe whose allergen question has no
   * answer. Packaging is excluded — a carton has no allergen to declare.
   */
  unverified: string[];
};

/** One line as the roll-up needs to see it. */
export type RollupLine = {
  subRecipeId: string | null;
  materialId: string | null;
  name: string;
  /** Packaging is skipped entirely; unlinked lines count as unverified. */
  isPackaging: boolean;
};

type RollupInput = {
  /** recipe id -> its lines */
  linesByRecipe: Map<string, RollupLine[]>;
  /** material id -> odoo product id */
  odooIdByMaterial: Map<string, number>;
  index: AllergenIndex;
};

/**
 * Every allergen beneath a recipe, with what put it there, plus everything
 * that could not be checked.
 *
 * Walks the same tree as the BOM explosion. Cycles are guarded; depth is
 * capped at the same 12 levels used everywhere else.
 */
export function rollUpAllergens(
  rootId: string,
  input: RollupInput
): AllergenRollup {
  const sources = new Map<string, string[]>();
  const unverified = new Set<string>();
  const path = new Set<string>();

  function walk(recipeId: string, depth: number): void {
    if (depth > 12 || path.has(recipeId)) return;
    const lines = input.linesByRecipe.get(recipeId);
    if (!lines) return;

    path.add(recipeId);
    for (const line of lines) {
      if (line.subRecipeId) {
        walk(line.subRecipeId, depth + 1);
        continue;
      }

      // A carton carries nothing edible; leaving it out keeps the unverified
      // count meaningful instead of drowning it in packaging.
      if (line.isPackaging) continue;

      const odooId = line.materialId
        ? input.odooIdByMaterial.get(line.materialId)
        : undefined;

      if (!odooId || !input.index.answered.has(odooId)) {
        unverified.add(line.name);
        continue;
      }

      const allergen = input.index.stated.get(odooId);
      if (!allergen) continue; // answered N/A: genuinely clean.

      const existing = sources.get(allergen);
      if (existing) {
        if (!existing.includes(line.name)) existing.push(line.name);
      } else {
        sources.set(allergen, [line.name]);
      }
    }
    path.delete(recipeId);
  }

  walk(rootId, 0);

  return {
    allergens: [...sources.keys()].sort(),
    sources,
    unverified: [...unverified].sort(),
  };
}
