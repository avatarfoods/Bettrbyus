/**
 * Batch and yield arithmetic, taken directly from the workbook.
 *
 * The four numbers on every recipe page, and how they relate:
 *
 *   BATCH TOTAL (INGR WEIGHT)  sum of the original ingredient quantities
 *   DESIRED BATCH SIZE (LB)    what you set out to make
 *   BATCH YEILD                what actually comes out of the kettle
 *   YEILD                      (yield - desired) / desired
 *
 * Boiled quinoa is the clearest case: 150 lb of ingredients, 450 lb out, a
 * +200% gain because the grain takes up water. A stew that cooks down gives
 * the same arithmetic with a negative answer. Nobody types the percentage -
 * it is derived, so it cannot drift away from the two numbers it comes from.
 *
 * Scaling matches the sheet exactly:
 *   scaled quantity = (desired batch / batch total) x original quantity
 * which is the same as saying each ingredient keeps its share of the batch.
 */

export type YieldLine = {
  /** The original recipe quantity, as written down. */
  quantity: number;
  uom: string | null;
  /** Loss on this line alone, stored as -8 meaning 8% is lost. */
  lossPct: number | null;
};

export type LineMath = {
  /** This ingredient's share of the batch, 0-1. */
  share: number;
  /** Share as a percentage, for display. */
  percent: number;
  /** Quantity once scaled to the desired batch size. */
  scaled: number;
  /** Scaled, then grossed up for this line's own loss. */
  scaledWithLoss: number;
};

/**
 * Everything weighed, converted to pounds.
 *
 * Lines are written in whatever unit the person had in front of them - 66 of
 * the workbook's 685 lines are in ounces against recipes measured in pounds -
 * so the batch total has to convert before it adds. Counts (each, case) are
 * left alone: they are not weights and adding them to a weight would be
 * meaningless, so a recipe should not mix the two.
 */
export function toPounds(quantity: number, uom: string | null): number {
  switch ((uom ?? "LB").trim().toUpperCase()) {
    case "OZ":
      return quantity / 16;
    case "G":
    case "GRAM":
    case "GRAMS":
      return quantity / 453.59237;
    case "KG":
      return quantity * 2.20462262;
    default:
      return quantity;
  }
}

/** Loss is stored as -8 meaning 8% lost, so 8% more input is needed. */
export function lossFactor(lossPct: number | null): number {
  if (lossPct === null || lossPct === 0) return 1;
  return 1 + Math.abs(lossPct) / 100;
}

/** BATCH TOTAL (INGR WEIGHT): the sum of what the recipe calls for. */
export function batchTotal(lines: YieldLine[]): number {
  return lines.reduce(
    (sum, line) => sum + toPounds(line.quantity ?? 0, line.uom),
    0
  );
}

/**
 * YEILD: how much more, or less, comes out than went in.
 *
 * Positive is a gain (quinoa taking up water), negative is a loss (a stew
 * cooking down). Null when either number is missing - reporting 0% for an
 * unknown yield would read as "no change", which is a different claim.
 */
export function yieldPct(
  desiredBatch: number | null,
  batchYield: number | null
): number | null {
  if (!desiredBatch || batchYield === null || batchYield === undefined) {
    return null;
  }
  if (desiredBatch === 0) return null;
  return ((batchYield - desiredBatch) / desiredBatch) * 100;
}

/** Plain words for a yield, because "+200%" alone confuses people. */
export function describeYield(pct: number | null): string {
  if (pct === null) return "Set a desired batch and a yield to see this";
  if (Math.abs(pct) < 0.05) return "No gain or loss";
  const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  return pct > 0
    ? `${rounded}% gain — more comes out than goes in`
    : `${Math.abs(Number(rounded))}% loss — it cooks down`;
}

/** Per-line share and scaled quantity for a given desired batch. */
export function lineMath(
  line: YieldLine,
  total: number,
  desiredBatch: number | null
): LineMath {
  const quantity = toPounds(line.quantity ?? 0, line.uom);
  const share = total > 0 ? quantity / total : 0;
  const scaled = desiredBatch && total > 0 ? share * desiredBatch : quantity;

  return {
    share,
    percent: share * 100,
    scaled,
    scaledWithLoss: scaled * lossFactor(line.lossPct),
  };
}

export type BatchPlan = {
  /** TOTAL BATCHES: scheduled / batch yield. */
  totalBatches: number | null;
  /** Whole batches to run. */
  fullBatches: number | null;
  /** The leftover fraction of a batch, 0 when it divides evenly. */
  finalBatch: number | null;
};

/**
 * How many batches a scheduled quantity takes.
 *
 * The sheet splits this into whole batches and a final partial one, because
 * the floor runs a full kettle repeatedly and then one short one, and the
 * batch sheet has to print both.
 */
export function batchPlan(
  totalScheduled: number | null,
  batchYield: number | null
): BatchPlan {
  if (!totalScheduled || !batchYield || batchYield <= 0) {
    return { totalBatches: null, fullBatches: null, finalBatch: null };
  }
  const totalBatches = totalScheduled / batchYield;
  const fullBatches = Math.floor(totalBatches);
  return {
    totalBatches,
    fullBatches,
    finalBatch: totalBatches - fullBatches,
  };
}

export type DisplayUnit = "auto" | "LB" | "OZ" | "G" | "KG";

/**
 * How a quantity should read on a printed sheet.
 *
 * "Auto" is the one that matters: a batch sheet saying 0.31 lb of oregano is
 * useless on a scale, while 4.96 oz is something a person can weigh. So small
 * weights switch to ounces and very small ones to grams, and only the display
 * changes - what is stored stays in the recipe's own unit.
 */
export function displayQuantity(
  pounds: number,
  unit: DisplayUnit = "auto"
): { value: number; unit: string } {
  if (!Number.isFinite(pounds)) return { value: 0, unit: "LB" };

  if (unit === "auto") {
    const ounces = pounds * 16;
    // Under a quarter of an ounce, even ounces stop being weighable.
    if (Math.abs(ounces) < 0.25 && pounds !== 0) {
      return { value: pounds * 453.59237, unit: "G" };
    }
    // Carlos's threshold: below 2 lb, read it in ounces.
    if (Math.abs(pounds) < 2) return { value: ounces, unit: "OZ" };
    return { value: pounds, unit: "LB" };
  }

  switch (unit) {
    case "OZ":
      return { value: pounds * 16, unit: "OZ" };
    case "G":
      return { value: pounds * 453.59237, unit: "G" };
    case "KG":
      return { value: pounds / 2.20462262, unit: "KG" };
    default:
      return { value: pounds, unit: "LB" };
  }
}

/** A quantity and its unit, rounded so it reads well on paper. */
export function formatQuantity(
  pounds: number,
  unit: DisplayUnit = "auto"
): string {
  const shown = displayQuantity(pounds, unit);
  const places = Math.abs(shown.value) >= 100 ? 0 : Math.abs(shown.value) >= 10 ? 1 : 2;
  return `${shown.value.toFixed(places)} ${shown.unit}`;
}
