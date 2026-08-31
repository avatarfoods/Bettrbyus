import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isFinishedProduct,
  recipeKind,
  type RecipeKind,
} from "@/lib/production/wip-explode";
import { fetchAllergens, rollUpAllergens } from "@/lib/recipes/allergens";

/**
 * The real recipe catalogue: the 199 recipes imported from the master
 * workbook, with their bill of materials.
 *
 *
 * The list/detail rules here are ported from avatar-production_8.html
 * (recipeIssues, whereUsed, the type labels) and expressed against the
 * Bettrbyus schema, where a recipe's department carries the type.
 */

export const RECIPE_KIND_LABEL: Record<RecipeKind, string> = {
  kitchen: "Kitchen batch",
  assembly: "Assembly · per bowl",
  finished: "Finished · per case",
};

export const RECIPE_KIND_SHORT: Record<RecipeKind, string> = {
  kitchen: "Kitchen",
  assembly: "Assembly",
  finished: "Finished",
};

export type CatalogLine = {
  id: string;
  ingredientName: string;
  quantity: number;
  uom: string | null;
  /** Unit the calculated amount prints in. Null = same as uom. */
  displayUom: string | null;
  lossPct: number | null;
  subRecipeId: string | null;
  materialId: string | null;
  sortOrder: number;
  /** Resolved display name for the linked material, when there is one. */
  materialCode: string | null;
  materialName: string | null;
  materialCategory: string | null;
};

/** What a BOM row actually is, which drives how it is shown. */
export type LineKind = "subrecipe" | "packaging" | "material" | "unlinked";

/**
 * Packaging words that are safe to match on a name. Deliberately excludes
 * "bag", "box" and "cup": 61 materials are ingredients that merely come in one
 * ("SALT GENERAL PURPOSE 50# BAG"), and calling those packaging would be worse
 * than leaving them unclassified.
 */
const PACKAGING_NAME =
  /\b(carton|master case|film|lid|tray|sleeve|label|shrink|stretch|pallet)\b/i;

export function lineKind(line: CatalogLine): LineKind {
  if (line.subRecipeId) return "subrecipe";
  if (!line.materialId) return "unlinked";

  // The Odoo category is authoritative where it has been synced - 265
  // materials sit under a "Packaging Supplies" category.
  const category = line.materialCategory;
  if (category) {
    return /packaging/i.test(category) ? "packaging" : "material";
  }

  // 61 materials have no category yet. For those the name is the only signal.
  return PACKAGING_NAME.test(line.materialName ?? line.ingredientName)
    ? "packaging"
    : "material";
}

export type CatalogRecipe = {
  id: string;
  wipCode: string;
  name: string;
  department: string | null;
  kind: RecipeKind;
  /**
   * Ticked by hand. The department is only the default - see
   * isFinishedProduct() - so a recipe filed under the wrong sheet can still
   * be marked correctly without moving it.
   */
  isFinished: boolean;
  /** BATCH YEILD - what actually comes out. Null until someone records it. */
  batchYield: number | null;
  /** How the floor is told what to make. */
  callBasis: "batch" | "unit" | "case";
  batchSize: number | null;
  uom: string | null;
  active: boolean;
  lines: CatalogLine[];
  /** Problems that stop this recipe being trusted downstream. */
  issues: string[];
  /**
   * Allergens present anywhere beneath this recipe, from Odoo. Never typed —
   * always the union of what the ingredients carry, so a formula change
   * cannot leave a stale declaration behind.
   */
  allergens: string[];
  /** Which ingredient introduced each allergen. */
  allergenSources: Record<string, string[]>;
  /**
   * Food ingredients beneath this recipe that never answered the allergen
   * question. While this is non-empty the list above is a floor, not the
   * whole truth, and the UI must not print a confident "None".
   */
  allergensUnverified: string[];
};

export type RecipeCatalog = {
  recipes: CatalogRecipe[];
  byId: Map<string, CatalogRecipe>;
  departments: string[];
};

/** Water and ice are never purchased, so a missing quantity is not a defect. */
const QUANTITY_EXEMPT = /water|ice/i;

/**
 * Ported from recipeIssues() in the prototype. A line is "unlinked" when it
 * resolves to neither a material nor a subrecipe - 86 of the 685 lines are in
 * that state, and they are exactly what needs review.
 */
export function computeIssues(
  recipe: Pick<CatalogRecipe, "lines" | "kind" | "batchSize">
): string[] {
  const issues: string[] = [];

  if (recipe.lines.length === 0) issues.push("No ingredient lines");

  for (const line of recipe.lines) {
    if (!line.subRecipeId && !line.materialId) {
      issues.push(`Unlinked: ${line.ingredientName}`);
    }
    if (!line.quantity && !QUANTITY_EXEMPT.test(line.ingredientName)) {
      issues.push(`No quantity: ${line.ingredientName}`);
    }
  }

  if (recipe.kind === "kitchen" && !recipe.batchSize) {
    issues.push("Batch size missing");
  }

  return issues;
}

/** Recipes that consume this one. */
export function whereUsed(
  catalog: RecipeCatalog,
  recipeId: string
): { recipe: CatalogRecipe; line: CatalogLine }[] {
  const used: { recipe: CatalogRecipe; line: CatalogLine }[] = [];

  for (const recipe of catalog.recipes) {
    for (const line of recipe.lines) {
      if (line.subRecipeId === recipeId) used.push({ recipe, line });
    }
  }

  return used.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name));
}

export type RawRequirement = {
  key: string;
  code: string | null;
  name: string;
  uom: string | null;
  /** Quantity per 1 output unit of the root recipe. */
  qty: number;
  /** True when the line resolves to nothing - shown as needing review. */
  unlinked: boolean;
};

function isWeightUom(uom: string | null): boolean {
  if (!uom) return true;
  const value = uom.trim().toUpperCase();
  return value === "LB" || value === "LBS" || value === "OZ" || value === "POUND";
}

function toOutputUnits(quantity: number, uom: string | null): number {
  return (uom ?? "LB").trim().toUpperCase() === "OZ" ? quantity / 16 : quantity;
}

function lossFactor(lossPct: number | null): number {
  if (lossPct === null || lossPct === 0) return 1;
  return 1 + Math.abs(lossPct) / 100;
}

/**
 * Raw materials needed per 1 output unit, with subrecipes exploded away.
 * Same arithmetic as lib/production/wip-explode.ts and lib/purchasing/mrp.ts.
 */
export function explodeRawMaterials(
  catalog: RecipeCatalog,
  rootId: string
): RawRequirement[] {
  const acc = new Map<string, RawRequirement>();
  const path = new Set<string>();

  function walk(recipeId: string, mult: number, depth: number): void {
    if (depth > 12 || path.has(recipeId)) return;
    const recipe = catalog.byId.get(recipeId);
    if (!recipe) return;

    path.add(recipeId);
    for (const line of recipe.lines) {
      const quantity =
        recipe.batchSize !== null && recipe.batchSize !== 0
          ? (mult * line.quantity) / recipe.batchSize
          : mult *
            (isWeightUom(line.uom)
              ? toOutputUnits(line.quantity, line.uom)
              : line.quantity) *
            lossFactor(line.lossPct);

      if (line.subRecipeId && catalog.byId.has(line.subRecipeId)) {
        walk(line.subRecipeId, quantity, depth + 1);
        continue;
      }

      const key = line.materialId ?? `name:${line.ingredientName}`;
      const existing = acc.get(key);
      if (existing) {
        existing.qty += quantity;
      } else {
        acc.set(key, {
          key,
          code: line.materialCode,
          name: line.materialName ?? line.ingredientName,
          uom: line.uom,
          qty: quantity,
          unlinked: !line.materialId,
        });
      }
    }
    path.delete(recipeId);
  }

  walk(rootId, 1, 0);
  return [...acc.values()].sort((a, b) => b.qty - a.qty);
}

export type BomRow = {
  /** Stable key: the path taken to reach this row. */
  key: string;
  /** Parent row key, or null at the top. */
  parentKey: string | null;
  depth: number;
  kind: LineKind;
  code: string | null;
  name: string;
  uom: string | null;
  /** Quantity needed per 1 unit of the root recipe. */
  qtyPerUnit: number;
  /** Set when this row is a subrecipe, so it can be opened or folded. */
  subRecipeId: string | null;
  hasChildren: boolean;
};

/**
 * The whole bill of materials as a flat, ordered list with depth - the shape a
 * fold-out table wants. Quantities are per 1 unit of the root, so the view can
 * scale them by "units to build" without recomputing.
 *
 * Flat-with-depth rather than nested blocks on purpose: the reference version
 * nests coloured boxes inside coloured boxes, which is what made it hard to
 * read past the second level.
 */
export function buildBomRows(
  catalog: RecipeCatalog,
  rootId: string
): BomRow[] {
  const rows: BomRow[] = [];
  const path = new Set<string>();

  function walk(
    recipeId: string,
    mult: number,
    depth: number,
    parentKey: string | null
  ): void {
    if (depth > 12 || path.has(recipeId)) return;
    const recipe = catalog.byId.get(recipeId);
    if (!recipe) return;

    path.add(recipeId);
    for (const line of recipe.lines) {
      const qty =
        recipe.batchSize !== null && recipe.batchSize !== 0
          ? (mult * line.quantity) / recipe.batchSize
          : mult *
            (isWeightUom(line.uom)
              ? toOutputUnits(line.quantity, line.uom)
              : line.quantity) *
            lossFactor(line.lossPct);

      const sub = line.subRecipeId
        ? (catalog.byId.get(line.subRecipeId) ?? null)
        : null;
      const key = `${parentKey ?? "root"}/${line.id}`;

      rows.push({
        key,
        parentKey,
        depth,
        kind: lineKind(line),
        code: sub?.wipCode ?? line.materialCode,
        name: sub?.name ?? line.materialName ?? line.ingredientName,
        uom: sub?.uom ?? line.uom,
        qtyPerUnit: qty,
        subRecipeId: sub?.id ?? null,
        hasChildren: Boolean(sub?.lines.length),
      });

      if (sub) walk(sub.id, qty, depth + 1, key);
    }
    path.delete(recipeId);
  }

  walk(rootId, 1, 0, null);
  return rows;
}

/** Direct children of a recipe, for the structure tree. */
export function childrenOf(
  catalog: RecipeCatalog,
  recipeId: string
): { line: CatalogLine; sub: CatalogRecipe | null }[] {
  const recipe = catalog.byId.get(recipeId);
  if (!recipe) return [];

  return recipe.lines.map((line) => ({
    line,
    sub: line.subRecipeId ? (catalog.byId.get(line.subRecipeId) ?? null) : null,
  }));
}

type RecipeRow = {
  id: string;
  wip_code: string;
  name: string;
  department: string | null;
  batch_size: number | null;
  uom: string | null;
  active: boolean;
  is_finished_product: boolean | null;
  batch_yield: number | null;
  call_basis: string | null;
};

type LineRow = {
  id: string;
  recipe_id: string;
  display_uom?: string | null;
  ingredient_name: string;
  quantity: number;
  uom: string | null;
  loss_pct: number | null;
  sub_recipe_id: string | null;
  material_id: string | null;
  sort_order: number;
};

type MaterialRow = {
  id: string;
  item_code: string;
  name: string;
  odoo_category: string | null;
  odoo_product_id: number | null;
};

export async function fetchRecipeCatalog(
  supabase: SupabaseClient
): Promise<RecipeCatalog> {
  const [recipesResult, linesResult, materialsResult] = await Promise.all([
    supabase
      .from("purchasing_recipes")
      // Deliberately "*": is_finished_product only exists once the recipe-flag
      // migration has run, and naming a missing column makes PostgREST fail the
      // whole query - which would empty the recipe list rather than degrade.
      .select("*"),
    supabase
      .from("purchasing_recipe_lines")
      .select(
        // "*" so display_uom works before and after its migration - naming a
        // missing column fails the whole query and empties every recipe.
        "*"
      )
      .order("sort_order"),
    supabase
      .from("purchasing_materials")
      .select("id, item_code, name, odoo_category, odoo_product_id"),
  ]);

  const materialsById = new Map<string, MaterialRow>(
    ((materialsResult.data ?? []) as MaterialRow[]).map((row) => [row.id, row])
  );

  const linesByRecipe = new Map<string, CatalogLine[]>();
  for (const row of (linesResult.data ?? []) as LineRow[]) {
    const material = row.material_id
      ? materialsById.get(row.material_id)
      : undefined;

    const line: CatalogLine = {
      id: row.id,
      ingredientName: row.ingredient_name,
      quantity: Number(row.quantity) || 0,
      uom: row.uom,
      displayUom: row.display_uom ?? null,
      lossPct: row.loss_pct,
      subRecipeId: row.sub_recipe_id,
      materialId: row.material_id,
      sortOrder: row.sort_order ?? 0,
      materialCode: material?.item_code ?? null,
      materialName: material?.name ?? null,
      materialCategory: material?.odoo_category ?? null,
    };

    const bucket = linesByRecipe.get(row.recipe_id);
    if (bucket) bucket.push(line);
    else linesByRecipe.set(row.recipe_id, [line]);
  }

  const draft = ((recipesResult.data ?? []) as RecipeRow[])
    .map((row) => {
      const base = {
        id: row.id,
        wipCode: row.wip_code,
        name: row.name,
        department: row.department,
        kind: recipeKind(row.department),
        isFinished: isFinishedProduct({
          department: row.department,
          isFinishedProduct: row.is_finished_product,
        }),
        batchYield: row.batch_yield ?? null,
        callBasis: (row.call_basis === "batch"
          ? "batch"
          : row.call_basis === "case"
            ? "case"
            : "unit") as "batch" | "unit" | "case",
        batchSize: row.batch_size,
        uom: row.uom,
        active: row.active,
        lines: linesByRecipe.get(row.id) ?? [],
      };
      return { ...base, issues: computeIssues(base) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Allergens come from Odoo and roll up the tree. If Odoo is unreachable the
  // index reports itself unavailable, and every food line reads as unverified
  // rather than clean.
  const allergenIndex = await fetchAllergens();

  const odooIdByMaterial = new Map<string, number>();
  for (const [id, row] of materialsById) {
    if (row.odoo_product_id) odooIdByMaterial.set(id, row.odoo_product_id);
  }

  const linesForRollup = new Map(
    draft.map((recipe) => [
      recipe.id,
      recipe.lines.map((line) => ({
        subRecipeId: line.subRecipeId,
        materialId: line.materialId,
        name: line.materialName ?? line.ingredientName,
        isPackaging: lineKind(line) === "packaging",
      })),
    ])
  );

  const recipes: CatalogRecipe[] = draft.map((recipe) => {
    const rollup = rollUpAllergens(recipe.id, {
      linesByRecipe: linesForRollup,
      odooIdByMaterial,
      index: allergenIndex,
    });
    return {
      ...recipe,
      allergens: rollup.allergens,
      allergenSources: Object.fromEntries(rollup.sources),
      allergensUnverified: rollup.unverified,
    };
  });

  const departments = [
    ...new Set(recipes.map((r) => r.department).filter(Boolean)),
  ].sort() as string[];

  return {
    recipes,
    byId: new Map(recipes.map((recipe) => [recipe.id, recipe])),
    departments,
  };
}
