/**
 * Node-level BOM explosion for the WIP calculator.
 *
 * lib/purchasing/mrp.ts explodes a schedule all the way down to purchasable
 * materials, which is what buying needs. The WIP calculator needs the layer
 * above that: for one case of a finished product, how much of each
 * intermediate subrecipe does it take? So this keeps the nodes instead of
 * collapsing them.
 *
 * The per-line arithmetic deliberately matches mrp.ts. If the two ever
 * disagree, purchasing and the floor would be working from different numbers.
 */

export type RecipeKind = "finished" | "assembly" | "kitchen";

export type WipRecipe = {
  id: string;
  wipCode: string;
  name: string;
  department: string | null;
  /** Null for per-unit recipes; a total for batch recipes. */
  batchSize: number | null;
  uom: string | null;
  /**
   * Ticked by hand on the recipe. Undefined means nobody has said, and the
   * department is used instead - see isFinishedProduct().
   */
  isFinishedProduct?: boolean | null;
};

export type WipRecipeLine = {
  recipeId: string;
  ingredientName: string;
  quantity: number;
  uom: string | null;
  lossPct: number | null;
  subRecipeId: string | null;
  materialId: string | null;
};

/** One subrecipe needed by a finished product, with its per-case quantity. */
export type WipNode = {
  id: string;
  wipCode: string;
  name: string;
  department: string | null;
  uom: string | null;
  /** Quantity of this subrecipe consumed per 1 unit of the finished product. */
  mult: number;
  depth: number;
};

const MAX_DEPTH = 12;

/**
 * The workbook has no explicit recipe type - the department sheet a recipe
 * came from carries that meaning, so it is read back out here.
 */
export function recipeKind(department: string | null): RecipeKind {
  const value = (department ?? "").trim().toUpperCase();
  if (value === "FINISHED PRODUCT") return "finished";
  if (value === "ASSEMBLY") return "assembly";
  return "kitchen";
}

/**
 * Whether a recipe is a finished product.
 *
 * The explicit flag wins wherever it has been set. Falling back to the
 * department keeps every recipe imported from the workbook behaving as it
 * always did, so ticking the box is an override rather than a chore.
 */
export function isFinishedProduct(recipe: {
  department: string | null;
  isFinishedProduct?: boolean | null;
}): boolean {
  if (typeof recipe.isFinishedProduct === "boolean") {
    return recipe.isFinishedProduct;
  }
  return recipeKind(recipe.department) === "finished";
}

/** Loss is stored as e.g. -8 meaning 8% lost, so 8% more input is needed. */
function lossFactor(lossPct: number | null): number {
  if (lossPct === null || lossPct === 0) return 1;
  return 1 + Math.abs(lossPct) / 100;
}

function isWeightUom(uom: string | null): boolean {
  if (!uom) return true;
  const value = uom.trim().toUpperCase();
  return value === "LB" || value === "LBS" || value === "OZ" || value === "POUND";
}

/**
 * Line quantities are written in whatever unit the recipe sheet used, but a
 * subrecipe's on-hand is counted in its own output unit. 66 of the 685 lines
 * are in OZ against a subrecipe measured in LBS - without this conversion
 * those explode 16x too large.
 */
function toOutputUnits(quantity: number, uom: string | null): number {
  const value = (uom ?? "LB").trim().toUpperCase();
  if (value === "OZ") return quantity / 16;
  return quantity;
}

export type ExplodeInput = {
  recipesById: Map<string, WipRecipe>;
  linesByRecipeId: Map<string, WipRecipeLine[]>;
};

/**
 * Every subrecipe below `rootId`, with the quantity needed per 1 unit of it.
 *
 * Cycles are guarded by an in-progress set rather than depth alone, so a
 * recipe that (wrongly) contains itself yields a partial answer instead of
 * hanging the page.
 */
export function explodeToNodes(
  rootId: string,
  { recipesById, linesByRecipeId }: ExplodeInput
): WipNode[] {
  const nodes = new Map<string, WipNode>();
  const inProgress = new Set<string>();

  function walk(recipeId: string, mult: number, depth: number): void {
    if (depth > MAX_DEPTH || inProgress.has(recipeId)) return;

    const recipe = recipesById.get(recipeId);
    if (!recipe) return;

    if (recipeId !== rootId) {
      const existing = nodes.get(recipeId);
      if (existing) {
        existing.mult += mult;
        existing.depth = Math.min(existing.depth, depth);
      } else {
        nodes.set(recipeId, {
          id: recipe.id,
          wipCode: recipe.wipCode,
          name: recipe.name,
          department: recipe.department,
          uom: recipe.uom,
          mult,
          depth,
        });
      }
    }

    const lines = linesByRecipeId.get(recipeId);
    if (!lines?.length) return;

    inProgress.add(recipeId);
    for (const line of lines) {
      if (!line.subRecipeId) continue; // Raw materials are purchasing's problem.

      // Same arithmetic as lineRequirement() in lib/purchasing/mrp.ts.
      const quantity =
        recipe.batchSize !== null && recipe.batchSize !== 0
          ? // Batch recipe: the line is a share of the whole batch.
            (mult * line.quantity) / recipe.batchSize
          : mult *
            (isWeightUom(line.uom)
              ? toOutputUnits(line.quantity, line.uom)
              : line.quantity) *
            lossFactor(line.lossPct);

      walk(line.subRecipeId, quantity, depth + 1);
    }
    inProgress.delete(recipeId);
  }

  walk(rootId, 1, 0);

  return [...nodes.values()].sort(
    (a, b) => a.depth - b.depth || b.mult - a.mult
  );
}

export type BuildableResult = {
  /** Cases of the finished product the counted WIP supports. */
  cases: number;
  /** The subrecipe that runs out first. */
  limitedBy: WipNode | null;
  /** Nodes with no count entered; excluded from the calculation. */
  uncountedCount: number;
};

/**
 * How many cases the counted WIP supports, and what runs out first.
 * Returns null when nothing below this product has been counted - that is
 * "unknown", which is a different answer from "zero".
 */
export function buildableCases(
  nodes: WipNode[],
  counts: Map<string, number>
): BuildableResult | null {
  const counted = nodes.filter(
    (node) => counts.get(node.id) != null && node.mult > 0
  );
  if (counted.length === 0) return null;

  let cases = Infinity;
  let limitedBy: WipNode | null = null;

  for (const node of counted) {
    const possible = Math.floor((counts.get(node.id) as number) / node.mult);
    if (possible < cases) {
      cases = possible;
      limitedBy = node;
    }
  }

  return {
    cases: Number.isFinite(cases) ? cases : 0,
    limitedBy,
    uncountedCount: nodes.length - counted.length,
  };
}
