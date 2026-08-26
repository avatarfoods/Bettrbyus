import {
  CREW_ROLES,
  STAGE_TYPES,
  type CrewRole,
  type DurationUnit,
  type QtyUnit,
  type StepMode,
  type TempUnit,
} from "@/lib/recipes/instruction-config";

export const RECIPE_DEPARTMENTS = [
  "FINISHED PRODUCT",
  "ASSEMBLY",
  "FRESH MIXING",
  "MAIN KITCHEN",
  "GARDE MANGER",
  "PRODUCE",
] as const;

/** Common Excel recipe U/M values. */
export const RECIPE_UOM_OPTIONS = [
  "LB",
  "LBS",
  "OZ",
  "UNIT",
  "CASE",
  "EA",
  "CT",
  "GAL",
] as const;

export type RecipeDepartment = (typeof RECIPE_DEPARTMENTS)[number];
export type RecipeUom = (typeof RECIPE_UOM_OPTIONS)[number];
export type RecipeKind = "recipe" | "subrecipe";
export type RecipeType = "batch" | "per_unit";
export type IngredientKind = "ingredient" | "subrecipe";

export type RecipeCrewMember = {
  role: CrewRole | string;
  count: number;
};

export type RecipeStepMedia = {
  kind: "photo" | "video";
  url: string;
  name?: string;
};

export type RecipeStep = {
  id: string;
  /** Operator instruction text (Carlos prototype: txt). */
  text: string;
  mode: StepMode;
  type: string;
  equipment: string;
  setting: string;
  /** Capacity / unit weight min–max */
  capacityMin: string;
  capacityMax: string;
  capacityUm: QtyUnit | string;
  temp: string;
  tempUm: TempUnit | string;
  durationMin: string;
  durationMax: string;
  durationUm: DurationUnit | string;
  unitsPerHour: string;
  lbPerHour: string;
  mixFwdSec: string;
  mixBackSec: string;
  mixCycles: string;
  mixSpeed: string;
  crew: RecipeCrewMember[];
  weigh: boolean;
  recordTemp: boolean;
  photo: boolean;
  signOff: boolean;
  metalDetect: boolean;
  label: boolean;
  ccp: boolean;
  criticalLimit: string;
  correctiveAction: string;
  safety: string;
  media: RecipeStepMedia[];
  showSetting: boolean;
  showSafety: boolean;
};

export type RecipeIngredient = {
  id: string;
  kind: IngredientKind;
  /** Ingredient name, or linked subrecipe name. */
  name: string;
  /** Linked subrecipe id when kind is subrecipe. */
  subRecipeId: string | null;
  quantity: number;
  uom: string;
  notes: string;
};

export type CookingRecipe = {
  id: string;
  kind: RecipeKind;
  code: string;
  name: string;
  department: RecipeDepartment;
  recipeType: RecipeType;
  /**
   * Excel DESIRED BATCH SIZE (LB).
   * Scales original ingredient quantities: scaled = original * (desiredBatch / originalTotal).
   */
  batchSize: number | null;
  /**
   * Excel CUSTOM — scheduled / demand lbs (yellow cell).
   * Production qty = scaledQty * (custom / batchYield). Total batches = custom / batchYield.
   */
  customBatchSize: number | null;
  /**
   * Excel BATCH YEILD — actual cooked output weight for this batch.
   * Used when a parent demands lbs of this subrecipe (AA = scaled / batchYield * demand).
   */
  batchYield: number | null;
  /** Excel YIELD % e.g. -8 means 8% loss → batchYield ≈ desiredBatch * 0.92 */
  yieldPct: number | null;
  allergen: string;
  usda: boolean;
  uom: string;
  notes: string;
  /** Ingredient quantities are ORIGINAL recipe amounts (Excel ORIGINAL RECIPE QTY). */
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /** Default crew inherited by steps without their own crew. */
  crew: RecipeCrewMember[];
  /** Rules for the whole batch (printed on the batch sheet). */
  generalRules: string;
  /** Batch-sheet metadata */
  page: string;
  lotNumber: string;
  productionDate: string;
  shelfLifeDays: number;
  orderTotal: number | null;
  targetUnits: number | null;
};

export type RecipeWorkspace = {
  recipes: CookingRecipe[];
};

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyRecipe(kind: RecipeKind = "recipe"): CookingRecipe {
  return {
    id: newId(kind === "recipe" ? "r" : "s"),
    kind,
    code: "",
    name: "",
    department: kind === "recipe" ? "FINISHED PRODUCT" : "MAIN KITCHEN",
    recipeType: kind === "recipe" ? "per_unit" : "batch",
    batchSize: kind === "recipe" ? null : 50,
    customBatchSize: null,
    batchYield: null,
    yieldPct: null,
    allergen: "NONE",
    usda: false,
    uom: kind === "recipe" ? "UNIT" : "LB",
    notes: "",
    ingredients: [],
    steps: [],
    crew: [
      { role: "Supervisor", count: 1 },
      { role: "Team member", count: 2 },
    ],
    generalRules: "",
    page: "",
    lotNumber: "",
    productionDate: new Date().toISOString().slice(0, 10),
    shelfLifeDays: 10,
    orderTotal: null,
    targetUnits: null,
  };
}

export function createBlankStep(
  mode: StepMode = "batch",
  text = ""
): RecipeStep {
  return {
    id: newId("step"),
    text,
    mode,
    type: STAGE_TYPES[mode][0],
    equipment: "",
    setting: "",
    capacityMin: "",
    capacityMax: "",
    capacityUm: mode === "line" ? "OZ" : "LB",
    temp: "",
    tempUm: "°F",
    durationMin: "",
    durationMax: "",
    durationUm: "min",
    unitsPerHour: "",
    lbPerHour: "",
    mixFwdSec: "",
    mixBackSec: "",
    mixCycles: "",
    mixSpeed: "",
    crew: [],
    weigh: false,
    recordTemp: false,
    photo: false,
    signOff: false,
    metalDetect: false,
    label: false,
    ccp: false,
    criticalLimit: "",
    correctiveAction: "",
    safety: "",
    media: [],
    showSetting: false,
    showSafety: false,
  };
}

function asCrew(raw: unknown): RecipeCrewMember[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const role =
        typeof row.role === "string"
          ? row.role
          : typeof row.r === "string"
            ? row.r
            : CREW_ROLES[0];
      const count = Number(row.count ?? row.n ?? 0) || 0;
      return { role, count };
    })
    .filter((item): item is RecipeCrewMember => item != null);
}

/** Fill missing step fields from older local drafts / plain text steps. */
export function normalizeStep(step: Partial<RecipeStep> & { id?: string; text?: string }): RecipeStep {
  const mode = (step.mode && STAGE_TYPES[step.mode] ? step.mode : "batch") as StepMode;
  const blank = createBlankStep(mode, step.text ?? "");
  return {
    ...blank,
    ...step,
    id: step.id ?? blank.id,
    text: step.text ?? "",
    mode,
    type: step.type && String(step.type).length ? String(step.type) : blank.type,
    equipment: step.equipment ?? "",
    setting: step.setting ?? "",
    capacityMin: step.capacityMin ?? "",
    capacityMax: step.capacityMax ?? "",
    capacityUm: step.capacityUm ?? blank.capacityUm,
    temp: step.temp ?? "",
    tempUm: step.tempUm ?? "°F",
    durationMin: step.durationMin ?? "",
    durationMax: step.durationMax ?? "",
    durationUm: step.durationUm ?? "min",
    unitsPerHour: step.unitsPerHour ?? "",
    lbPerHour: step.lbPerHour ?? "",
    mixFwdSec: step.mixFwdSec ?? "",
    mixBackSec: step.mixBackSec ?? "",
    mixCycles: step.mixCycles ?? "",
    mixSpeed: step.mixSpeed ?? "",
    crew: asCrew(step.crew),
    weigh: Boolean(step.weigh),
    recordTemp: Boolean(step.recordTemp),
    photo: Boolean(step.photo),
    signOff: Boolean(step.signOff),
    metalDetect: Boolean(step.metalDetect),
    label: Boolean(step.label),
    ccp: Boolean(step.ccp),
    criticalLimit: step.criticalLimit ?? "",
    correctiveAction: step.correctiveAction ?? "",
    safety: step.safety ?? "",
    media: Array.isArray(step.media) ? step.media : [],
    showSetting: Boolean(step.showSetting ?? (step.setting && String(step.setting).length)),
    showSafety: Boolean(step.showSafety ?? (step.safety && String(step.safety).length)),
  };
}

/** Fill missing fields from older local drafts. */
export function normalizeRecipe(recipe: CookingRecipe): CookingRecipe {
  const base = createEmptyRecipe(recipe.kind);
  return {
    ...base,
    ...recipe,
    allergen: recipe.allergen ?? "NONE",
    usda: recipe.usda ?? false,
    batchYield: recipe.batchYield ?? null,
    customBatchSize: recipe.customBatchSize ?? null,
    yieldPct: roundYieldPct(recipe.yieldPct ?? null),
    ingredients: recipe.ingredients ?? [],
    steps: (recipe.steps ?? []).map((step) => normalizeStep(step)),
    crew: asCrew(recipe.crew).length ? asCrew(recipe.crew) : base.crew,
    generalRules: recipe.generalRules ?? "",
    page: recipe.page ?? "",
    lotNumber: recipe.lotNumber ?? "",
    productionDate: recipe.productionDate || base.productionDate,
    shelfLifeDays: Number(recipe.shelfLifeDays ?? base.shelfLifeDays) || 10,
    orderTotal: recipe.orderTotal ?? null,
    targetUnits: recipe.targetUnits ?? null,
  };
}

function isWeightUom(uom: string | null | undefined): boolean {
  if (!uom) return true;
  const value = uom.trim().toUpperCase();
  return value === "LB" || value === "LBS" || value === "OZ" || value === "POUND";
}

function toLbs(quantity: number, uom: string | null | undefined): number {
  const value = (uom ?? "LB").trim().toUpperCase();
  if (value === "OZ") return quantity / 16;
  return quantity;
}

/** Sum of original ingredient weights (Excel BATCH TOTAL / INGR WEIGHT). */
export function originalIngredientTotalLbs(recipe: CookingRecipe): number {
  return recipe.ingredients.reduce((sum, item) => {
    if (!isWeightUom(item.uom)) return sum;
    return sum + toLbs(item.quantity, item.uom);
  }, 0);
}

/**
 * Excel scale: desiredBatch / originalIngredientTotal.
 * Ingredient FINAL qty for a full desired batch = original * this factor.
 */
export function desiredBatchScaleFactor(recipe: CookingRecipe): number | null {
  if (recipe.recipeType !== "batch") return null;
  const desired = recipe.batchSize;
  if (desired == null || desired <= 0) return null;
  const total = originalIngredientTotalLbs(recipe);
  if (total <= 0) return null;
  return desired / total;
}

/** Scaled / FULL BATCH quantity for one line (Excel ORIGINAL RECIPE right QTY). */
export function scaledIngredientQty(
  recipe: CookingRecipe,
  item: RecipeIngredient
): number {
  const factor = desiredBatchScaleFactor(recipe);
  if (factor == null) return item.quantity;
  return item.quantity * factor;
}

/**
 * Excel: CUSTOM / BATCH YEILD → how many batches of desired size are needed.
 * e.g. CUSTOM 300 / YIELD 176 ≈ 1.70 total batches.
 */
export function totalBatches(recipe: CookingRecipe): number | null {
  const custom = recipe.customBatchSize;
  const yieldLbs = recipe.batchYield;
  if (
    custom == null ||
    custom <= 0 ||
    yieldLbs == null ||
    yieldLbs <= 0 ||
    !Number.isFinite(custom) ||
    !Number.isFinite(yieldLbs)
  ) {
    return null;
  }
  return custom / yieldLbs;
}

/**
 * Excel AA / TOTALS line: scaledQty * (CUSTOM / BATCH_YIELD).
 * Falls back to scaled qty when Custom is empty.
 */
export function customIngredientQty(
  recipe: CookingRecipe,
  item: RecipeIngredient
): number {
  const scaled = scaledIngredientQty(recipe, item);
  const batches = totalBatches(recipe);
  if (batches == null) return scaled;
  return scaled * batches;
}

export function hasCustomDemand(recipe: CookingRecipe): boolean {
  return (
    recipe.customBatchSize != null &&
    recipe.customBatchSize > 0 &&
    recipe.batchYield != null &&
    recipe.batchYield > 0
  );
}

/** Derive yield % from desired batch + batch yield (Excel YIELD). */
export function yieldPctFromBatch(
  desiredBatch: number | null,
  batchYield: number | null
): number | null {
  if (
    desiredBatch == null ||
    desiredBatch <= 0 ||
    batchYield == null ||
    !Number.isFinite(batchYield)
  ) {
    return null;
  }
  return Math.round(((batchYield / desiredBatch) - 1) * 100);
}

/** Derive batch yield from desired batch + yield % (e.g. -8 → 92% of desired). */
export function batchYieldFromPct(
  desiredBatch: number | null,
  yieldPct: number | null
): number | null {
  if (
    desiredBatch == null ||
    desiredBatch <= 0 ||
    yieldPct == null ||
    !Number.isFinite(yieldPct)
  ) {
    return null;
  }
  return Math.round(desiredBatch * (1 + yieldPct / 100) * 100) / 100;
}

export function formatQty(quantity: number, uom: string): string {
  return `${formatNumber(quantity)} ${uom}`.trim();
}

/** Quantity only (Excel ORIGINAL RECIPE QTY / scaled QTY cells). */
export function formatNumber(quantity: number): string {
  if (!Number.isFinite(quantity)) return "—";
  // Match Excel-style alignment (40.00, 16.00, 0.40).
  return quantity.toFixed(2);
}

export function formatYieldPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded}%`;
}

/** Round stored yield % for display / inputs. */
export function roundYieldPct(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

/**
 * Patch helpers that keep Desired Batch ↔ Batch Yield ↔ Yield % linked
 * the way Excel does on the kitchen sheets.
 */
export function patchDesiredBatch(
  recipe: CookingRecipe,
  desiredBatch: number | null
): Partial<CookingRecipe> {
  if (desiredBatch == null || desiredBatch <= 0) {
    return { batchSize: desiredBatch };
  }
  if (recipe.yieldPct != null && Number.isFinite(recipe.yieldPct)) {
    return {
      batchSize: desiredBatch,
      batchYield: batchYieldFromPct(desiredBatch, recipe.yieldPct),
    };
  }
  if (recipe.batchYield != null && Number.isFinite(recipe.batchYield)) {
    return {
      batchSize: desiredBatch,
      yieldPct: yieldPctFromBatch(desiredBatch, recipe.batchYield),
    };
  }
  return { batchSize: desiredBatch };
}

export function patchBatchYield(
  recipe: CookingRecipe,
  batchYield: number | null
): Partial<CookingRecipe> {
  const desired = recipe.batchSize;
  return {
    batchYield,
    yieldPct: yieldPctFromBatch(desired, batchYield),
  };
}

export function patchYieldPct(
  recipe: CookingRecipe,
  yieldPct: number | null
): Partial<CookingRecipe> {
  const desired = recipe.batchSize;
  const rounded = roundYieldPct(yieldPct);
  return {
    yieldPct: rounded,
    batchYield: batchYieldFromPct(desired, rounded),
  };
}

function step(text: string, mode: StepMode = "batch"): RecipeStep {
  return createBlankStep(mode, text);
}

function ingredient(
  kind: IngredientKind,
  name: string,
  quantity: number,
  uom: string,
  subRecipeId: string | null = null,
  notes = ""
): RecipeIngredient {
  return {
    id: newId("ing"),
    kind,
    name,
    subRecipeId,
    quantity,
    uom,
    notes,
  };
}

function withDefaults(
  recipe: Omit<
    CookingRecipe,
    | "allergen"
    | "usda"
    | "batchYield"
    | "yieldPct"
    | "customBatchSize"
    | "crew"
    | "generalRules"
    | "page"
    | "lotNumber"
    | "productionDate"
    | "shelfLifeDays"
    | "orderTotal"
    | "targetUnits"
  > &
    Partial<
      Pick<
        CookingRecipe,
        | "allergen"
        | "usda"
        | "batchYield"
        | "yieldPct"
        | "customBatchSize"
        | "crew"
        | "generalRules"
        | "page"
        | "lotNumber"
        | "productionDate"
        | "shelfLifeDays"
        | "orderTotal"
        | "targetUnits"
      >
    >
): CookingRecipe {
  return normalizeRecipe(recipe as CookingRecipe);
}

/** Demo kitchen recipes from the master bowl file (frontend only). */
export function createDemoWorkspace(): RecipeWorkspace {
  const jasmineRice = {
    id: "s-rice",
    kind: "subrecipe" as const,
    code: "160301",
    name: "JASMINE RICE, COOKED",
    department: "MAIN KITCHEN" as const,
    recipeType: "batch" as const,
    batchSize: 157,
    uom: "LB",
    notes: "Cook and hold warm for mixing.",
    ingredients: [
      ingredient("ingredient", "JASMINE RICE", 150, "LB"),
      ingredient("ingredient", "SEA SALT", 1, "LB"),
      ingredient("ingredient", "SUNFLOWER OIL", 6, "LB"),
    ],
    steps: [
      step("Rinse jasmine rice until water runs clear."),
      step("Combine rice, salt, and oil in kettle."),
      step("Cook until tender; fluff and hold warm."),
    ],
  };

  const whiteOnion = {
    id: "s-onion",
    kind: "subrecipe" as const,
    code: "160501",
    name: 'WHITE ONION, 1/8" DICED',
    department: "PRODUCE" as const,
    recipeType: "batch" as const,
    batchSize: 1,
    uom: "LB",
    notes: "",
    ingredients: [ingredient("ingredient", "WHITE ONION", 1, "LB")],
    steps: [step('Peel and dice white onion to 1/8".')],
  };

  const chipotleDressing = {
    id: "s-dress",
    kind: "subrecipe" as const,
    code: "160090",
    name: "CHIPOTLE DRESSING",
    department: "GARDE MANGER" as const,
    recipeType: "batch" as const,
    batchSize: 12,
    uom: "LB",
    notes: "",
    ingredients: [
      ingredient("ingredient", "CHIPOTLE PEPPER ADOBO IN SAUCE", 1.5, "LB"),
      ingredient("ingredient", "TOMATO PASTE FANCY CA", 3.3, "LB"),
      ingredient("subrecipe", 'WHITE ONION, 1/8" DICED', 1, "LB", "s-onion"),
      ingredient("ingredient", "FRESH GARLIC", 0.45, "LB"),
      ingredient("ingredient", "SEA SALT", 0.3, "LB"),
      ingredient("ingredient", "PAPRIKA", 0.56, "LB"),
    ],
    steps: [
      step("Blend adobo peppers and tomato paste until smooth."),
      step("Add diced onion, garlic, salt, and paprika."),
      step("Taste and adjust seasoning; chill until needed."),
    ],
  };

  const marinade = {
    id: "s-marinade",
    kind: "subrecipe" as const,
    code: "160299",
    name: "CHIPOTLE CHICKEN MARINADE",
    department: "MAIN KITCHEN" as const,
    recipeType: "batch" as const,
    batchSize: 40,
    uom: "LB",
    notes: "",
    ingredients: [
      ingredient("ingredient", "RAW CHICKEN, DICED 1\"", 35, "LB"),
      ingredient("subrecipe", "CHIPOTLE DRESSING", 5, "LB", "s-dress"),
    ],
    steps: [
      step("Combine diced chicken with chipotle dressing."),
      step("Marinate under refrigeration before cooking."),
    ],
  };

  const stew = withDefaults({
    id: "s-stew",
    kind: "subrecipe",
    code: "160311",
    name: "CHIPOTLE CHICKEN STEW NAE",
    department: "MAIN KITCHEN",
    recipeType: "batch",
    batchSize: 8,
    batchYield: 7.34,
    yieldPct: -8,
    allergen: "NONE",
    usda: true,
    uom: "LB",
    notes: "",
    ingredients: [
      // Excel ORIGINAL RECIPE QTY; scales to 8 LB when desired batch = 8
      ingredient("subrecipe", "CHIPOTLE CHICKEN MARINADE", 5.81, "LB", "s-marinade"),
    ],
    steps: [
      {
        ...createBlankStep("batch", "ADD 7 POUNDS PER TRAY AND BAKE AT 400°F FOR 16-17 MINUTES."),
        type: "COOK",
        equipment: "Rational combi oven",
        setting: "400 °F",
        showSetting: true,
        temp: "400",
        durationMin: "16",
        durationMax: "17",
        capacityMin: "7",
        capacityMax: "7",
        capacityUm: "LB",
        recordTemp: true,
        crew: [{ role: "Machine operator", count: 1 }],
      },
      {
        ...createBlankStep(
          "batch",
          "PLACE PRODUCT IN IQF TUNNEL AT -40°F FOR 10 MINUTES (ONLY ONCE)."
        ),
        type: "COOL",
        equipment: "IQF tunnel",
        setting: "−40 °F",
        showSetting: true,
        temp: "-40",
        durationMin: "10",
        durationMax: "10",
        recordTemp: true,
        signOff: true,
        ccp: true,
        criticalLimit: "Product leaves the tunnel at 40 °F or below.",
        correctiveAction:
          "Send product through a second pass and re-probe before packing.",
        crew: [{ role: "Machine operator", count: 1 }],
      },
      {
        ...createBlankStep(
          "batch",
          "DIVIDE INTO TWO CONTAINERS OF 25 POUNDS EACH (TOTAL 50 LB PER BATCH)."
        ),
        type: "PREP",
        equipment: "Bench / by hand",
        weigh: true,
        photo: true,
        durationMin: "8",
        durationMax: "12",
      },
      {
        ...createBlankStep("batch", "LABEL EACH CONTAINER WITH THE BATCH NUMBER."),
        type: "HOLD",
        equipment: "Bench / by hand",
        label: true,
        signOff: true,
        durationMin: "2",
        durationMax: "4",
      },
    ],
    generalRules:
      "USDA product — keep the lot number with the batch from cook to pack. Sanitize trays and tunnel contact surfaces before and after the run.",
    page: "E.12",
    shelfLifeDays: 10,
  });

  const crema = {
    id: "s-crema",
    kind: "subrecipe" as const,
    code: "160089",
    name: "AVOCADO CREMA DRESSING",
    department: "GARDE MANGER" as const,
    recipeType: "batch" as const,
    batchSize: 22,
    uom: "LB",
    notes: "",
    ingredients: [
      ingredient("ingredient", "AVOCADO PULP 8/2 (FROZEN)", 11, "LB"),
      ingredient("ingredient", "SOUR CREAM", 5.5, "LB"),
      ingredient("ingredient", "LEMON, JUICE", 2.5, "LB"),
      ingredient("ingredient", "ONION POWDER", 0.52, "LB"),
      ingredient("ingredient", "SEA SALT", 0.28, "LB"),
    ],
    steps: [
      step("Thaw avocado pulp under refrigeration."),
      step("Blend with sour cream, lemon juice, onion powder, and salt."),
      step("Hold cold for assembly."),
    ],
  };

  const riceMix = {
    id: "s-mix",
    kind: "subrecipe" as const,
    code: "160127",
    name: "MEXICAN RICE MIX",
    department: "FRESH MIXING" as const,
    recipeType: "batch" as const,
    batchSize: 180,
    uom: "LB",
    notes: "",
    ingredients: [
      ingredient("subrecipe", "JASMINE RICE, COOKED", 150, "LB", "s-rice"),
      ingredient("subrecipe", 'WHITE ONION, 1/8" DICED', 8, "LB", "s-onion"),
      ingredient("ingredient", "ROASTED CORN", 12, "LB"),
      ingredient("ingredient", "SEA SALT", 1, "LB"),
    ],
    steps: [
      step("Fold cooked rice with diced onion and roasted corn."),
      step("Season with salt and hold for bowls."),
    ],
  };

  const powerBowl = {
    id: "s-bowl",
    kind: "subrecipe" as const,
    code: "160325",
    name: "CHIPOTLE CHICKEN POWER BOWL 9 oz",
    department: "ASSEMBLY" as const,
    recipeType: "per_unit" as const,
    batchSize: null,
    uom: "UNIT",
    notes: "One assembled bowl.",
    ingredients: [
      ingredient("subrecipe", "MEXICAN RICE MIX", 1, "UNIT", "s-mix"),
      ingredient("subrecipe", "CHIPOTLE CHICKEN STEW NAE", 1, "UNIT", "s-stew"),
      ingredient("subrecipe", "AVOCADO CREMA DRESSING", 1, "UNIT", "s-crema"),
      ingredient("ingredient", "BLACK TRAY FOR BETTR BOWL", 1, "UNIT"),
    ],
    steps: [
      step("Place black tray on assembly line."),
      step("Portion Mexican rice mix into tray."),
      step("Add chipotle chicken stew."),
      step("Finish with avocado crema and seal."),
    ],
  };

  const finished = {
    id: "r-fp",
    kind: "recipe" as const,
    code: "600066",
    name: "CHIPOTLE CHICKEN BOWL BIRRIA RICE BOWL 20/2CT (9oz)",
    department: "FINISHED PRODUCT" as const,
    recipeType: "per_unit" as const,
    batchSize: null,
    uom: "CASE",
    notes: "Case pack: 20 / 2 ct bowls.",
    ingredients: [
      ingredient("subrecipe", "CHIPOTLE CHICKEN POWER BOWL 9 oz", 10, "UNIT", "s-bowl"),
      ingredient("ingredient", "CARTON FOR CHICKEN CHIPOTLE BOWL", 10, "UNIT"),
      ingredient("ingredient", "BOX MASTER BETTR BOWL", 1, "UNIT"),
    ],
    steps: [
      step("Pack assembled bowls into cartons."),
      step("Case into master box and label."),
      step("Move finished cases to cold storage."),
    ],
  };

  return {
    recipes: [
      finished,
      powerBowl,
      riceMix,
      stew,
      marinade,
      crema,
      chipotleDressing,
      jasmineRice,
      whiteOnion,
    ].map((recipe) => normalizeRecipe(recipe as CookingRecipe)),
  };
}

/** Schema-map visual nodes (Supabase-style canvas). */
export type MapNodeKind = "recipe" | "subrecipe" | "ingredient";

export type MapNode = {
  id: string;
  kind: MapNodeKind;
  code: string;
  name: string;
  department: string | null;
  recipeType: RecipeType | null;
  batchSize: number | null;
  batchYield: number | null;
  yieldPct: number | null;
  uom: string;
  stepCount: number;
  ingredientRows: Array<{ id: string; label: string }>;
  x: number;
  y: number;
};

export type MapEdge = {
  id: string;
  fromId: string;
  toId: string;
  quantity: number;
  uom: string;
};

export type RecipeMapGraph = {
  nodes: MapNode[];
  edges: MapEdge[];
};

export const MAP_CARD_WIDTH = 260;
export const MAP_HEADER_H = 44;
export const MAP_ROW_H = 26;

export function mapNodeHeight(node: MapNode): number {
  const metaRows =
    node.kind !== "ingredient" && node.recipeType === "batch" ? 6 : 4;
  const bomRows = Math.min(node.ingredientRows.length, 8);
  return MAP_HEADER_H + (metaRows + bomRows) * MAP_ROW_H + 8;
}

/**
 * Build a schema-style graph for one recipe and everything it uses
 * (nested subrecipes + leaf ingredients).
 */
export function buildRecipeMapGraph(
  root: CookingRecipe,
  recipesById: Map<string, CookingRecipe>
): RecipeMapGraph {
  const nodes = new Map<string, MapNode>();
  const edges: MapEdge[] = [];
  const depthById = new Map<string, number>();

  function ensureIngredientNode(name: string, uom: string): string {
    const id = `ing:${name.toUpperCase()}`;
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        kind: "ingredient",
        code: "",
        name,
        department: null,
        recipeType: null,
        batchSize: null,
        batchYield: null,
        yieldPct: null,
        uom,
        stepCount: 0,
        ingredientRows: [],
        x: 0,
        y: 0,
      });
    }
    return id;
  }

  function ensureRecipeNode(recipe: CookingRecipe, depth: number) {
    const existing = depthById.get(recipe.id);
    if (existing === undefined || depth < existing) {
      depthById.set(recipe.id, depth);
    }
    if (nodes.has(recipe.id)) return;
    nodes.set(recipe.id, {
      id: recipe.id,
      kind: recipe.kind === "recipe" ? "recipe" : "subrecipe",
      code: recipe.code,
      name: recipe.name,
      department: recipe.department,
      recipeType: recipe.recipeType,
      batchSize: recipe.batchSize,
      batchYield: recipe.batchYield,
      yieldPct: recipe.yieldPct,
      uom: recipe.uom,
      stepCount: recipe.steps.length,
      ingredientRows: recipe.ingredients.map((item) => {
        const original = formatQty(item.quantity, item.uom);
        const scaled = scaledIngredientQty(recipe, item);
        const custom = customIngredientQty(recipe, item);
        const showCustom =
          hasCustomDemand(recipe) && Math.abs(custom - scaled) > 0.0001;
        const showScaled =
          recipe.recipeType === "batch" &&
          desiredBatchScaleFactor(recipe) != null &&
          Math.abs(scaled - item.quantity) > 0.0001;
        return {
          id: item.id,
          label: showCustom
            ? `${original} → ${formatQty(scaled, item.uom)} → ${formatQty(custom, item.uom)} · ${item.name}`
            : showScaled
              ? `${original} → ${formatQty(scaled, item.uom)} · ${item.name}`
              : `${original} · ${item.name}`,
        };
      }),
      x: 0,
      y: 0,
    });
  }

  function walk(recipe: CookingRecipe, depth: number, chain: string[]) {
    if (chain.includes(recipe.id)) return;
    ensureRecipeNode(recipe, depth);
    const nextChain = [...chain, recipe.id];

    for (const item of recipe.ingredients) {
      if (item.kind === "subrecipe" && item.subRecipeId) {
        const child = recipesById.get(item.subRecipeId);
        if (child) {
          walk(child, depth + 1, nextChain);
          edges.push({
            id: `${recipe.id}->${child.id}:${item.id}`,
            fromId: recipe.id,
            toId: child.id,
            quantity: item.quantity,
            uom: item.uom,
          });
          continue;
        }
      }
      const leafId = ensureIngredientNode(item.name, item.uom);
      depthById.set(leafId, Math.max(depthById.get(leafId) ?? 0, depth + 1));
      edges.push({
        id: `${recipe.id}->${leafId}:${item.id}`,
        fromId: recipe.id,
        toId: leafId,
        quantity: item.quantity,
        uom: item.uom,
      });
    }
  }

  walk(root, 0, []);

  const byDepth = new Map<number, MapNode[]>();
  for (const node of nodes.values()) {
    const depth = depthById.get(node.id) ?? 0;
    const list = byDepth.get(depth) ?? [];
    list.push(node);
    byDepth.set(depth, list);
  }

  const colGap = 320;
  const rowGap = 24;
  const positioned: MapNode[] = [];
  const depths = [...byDepth.keys()].sort((a, b) => a - b);

  for (const depth of depths) {
    const list = byDepth.get(depth) ?? [];
    list.sort((a, b) => {
      if (a.kind !== b.kind) {
        const order = { recipe: 0, subrecipe: 1, ingredient: 2 };
        return order[a.kind] - order[b.kind];
      }
      return a.name.localeCompare(b.name);
    });
    let y = 40;
    for (const node of list) {
      positioned.push({
        ...node,
        x: 48 + depth * colGap,
        y,
      });
      y += mapNodeHeight(node) + rowGap;
    }
  }

  return { nodes: positioned, edges };
}
