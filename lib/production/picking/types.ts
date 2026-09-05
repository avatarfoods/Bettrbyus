/**
 * The master picking order.
 *
 * One row per raw material the plan pulls, for a production date or a span of
 * them: how much, in what the material is counted in, how many cases that is
 * at Odoo's pack size, what is already on hand, and what is left to pick.
 */

export type PickingMode = "daily" | "open";

export type PickingRow = {
  materialId: string;
  itemCode: string;
  name: string;
  /** The sheet it is picked for: FINISHED PRODUCT, MAIN KITCHEN, PRODUCE… */
  department: string | null;
  /** The sheet's grouping: BOXES, CARTON, MIN/MAX, DAIRY, FREEZER, PRODUCE… */
  type: string | null;
  /** Odoo company the material is bought under. */
  company: string | null;
  /** What the recipes need, before the buffer. */
  needLbs: number;
  needUnits: number;
  /** "lb" when the tree asked for weight, "ea" when it asked for pieces. */
  unit: "lb" | "ea";
  /** With the buffer applied, in `unit`. */
  need: number;
  /** One case holds this many `packUom`. Null when nobody has said. */
  packSize: number | null;
  packUom: string | null;
  caseDescription: string | null;
  /** Where the pack size came from, so a guess can be told from a fact. */
  packSource: "odoo" | "purchasing" | "none";
  /** need / packSize. Null when there is no pack size to divide by. */
  cases: number | null;
  /** Cases on hand from the last inventory read. Null when never read. */
  onHand: number | null;
  /** Whole cases to pull: ceil(cases). On hand is not taken off. */
  toPick: number | null;
  /** Recipe lines that led here, for the tooltip. */
  sources: string[];
  /**
   * The same `need`, split by the recipe that asked for it - biggest first.
   *
   * Enough to answer "what is this quantity for" without leaving the sheet,
   * and to open the recipe it names. In `unit`, with the buffer already on,
   * so the parts sum to `need`.
   */
  recipeSources: PickingMaterialSource[];
};

/** One recipe's share of a material's requirement, for the panel. */
export type PickingMaterialSource = {
  recipeId: string;
  wipCode: string;
  name: string;
  /** How that recipe's lines spell the ingredient. */
  ingredientNames: string[];
  quantity: number;
};

export type PickingDriver = {
  recipeId: string;
  wipCode: string;
  name: string;
  quantity: number;
  uom: string | null;
};

/** One recipe's total demand in the window, in the recipe's own unit. */
export type RecipeTotal = {
  recipeId: string;
  wipCode: string;
  name: string;
  department: string | null;
  /** Pounds for a batch recipe, pieces (bowls, cases) for a per-unit one. */
  quantity: number;
  unit: "lb" | "ea";
  /** Batches that quantity takes, for batch recipes. Null otherwise. */
  batches: number | null;
  isFinished: boolean;
};

export type PickingUnresolved = {
  recipeName: string;
  ingredientName: string;
  totalLbs: number;
  totalUnits: number;
};

export type PickingResult = {
  mode: PickingMode;
  from: string;
  to: string;
  extraPct: number;
  rows: PickingRow[];
  /** The finished products whose demand produced the rows. */
  drivers: PickingDriver[];
  /** Every recipe the demand passes through, with its total. */
  recipeTotals: RecipeTotal[];
  unresolved: PickingUnresolved[];
  warnings: string[];
  /** The picking table has not been created yet. */
  missingTable: boolean;
  /** Materials with no pack size from anywhere. */
  withoutPack: number;
  /** When pack sizes were last read from Odoo, if ever. */
  packSyncedAt: string | null;
};
