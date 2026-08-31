/**
 * Finished product specification — the derived half.
 *
 * Everything computable is computed here rather than stored, which is what
 * stops the workbook's problem recurring: cases-per-pallet was typed in two
 * places and drifted to 45 in one and 135 in the other. Type layer and tie;
 * the rest follows.
 */

export type PartialPolicy = "accepted" | "conditional" | "not_accepted";
export type ArtworkOwner = "avatar" | "brand";
export type ShelfLifeUnit = "months" | "days";
export type StorageType = "freezer" | "cooler" | "dry";

export type FinishedProduct = {
  id: string;
  odooProductId: number;
  itemCode: string;
  name: string;
  customerGroup: string | null;
  storageType: StorageType | null;

  bowlsPerCase: number | null;
  productsPerCase: number;
  netWeightPerCase: number | null;

  caseGtin: string | null;
  unitUpc: string | null;
  labelUrl: string | null;
  labelFilename: string | null;
  artworkOwner: ArtworkOwner;

  casesPerLayer: number | null;
  layersHigh: number | null;
  caseWidthIn: number | null;
  caseLengthIn: number | null;
  caseHeightIn: number | null;
  palletBaseHeightIn: number | null;
  maxPalletHeightIn: number | null;
  palletsPerStack: number;
  partialPolicy: PartialPolicy;

  shelfLifeValue: number | null;
  shelfLifeUnit: ShelfLifeUnit;
  expirationOffsetDays: number;
  lotFormat: string;

  validFrom: string;
  active: boolean;
  notes: string | null;
};

export type PalletMath = {
  /** layer × tie. Null when either is missing. */
  casesPerPallet: number | null;
  /** base + (tie × case height). */
  palletHeightIn: number | null;
  /** cases per pallet × pallets stacked in one slot. */
  casesPerPalletSpace: number | null;
  /** Total height once stacked. */
  stackedHeightIn: number | null;
  /** False only when we know the max and the stack exceeds it. */
  fits: boolean | null;
  /** Plain-language reason when it does not fit. */
  fitMessage: string | null;
};

export function palletMath(product: FinishedProduct): PalletMath {
  const { casesPerLayer, layersHigh, caseHeightIn, maxPalletHeightIn } = product;
  const base = product.palletBaseHeightIn ?? 0;
  const stack = product.palletsPerStack || 1;

  const casesPerPallet =
    casesPerLayer && layersHigh ? casesPerLayer * layersHigh : null;

  const palletHeightIn =
    layersHigh && caseHeightIn ? base + layersHigh * caseHeightIn : null;

  const casesPerPalletSpace =
    casesPerPallet !== null ? casesPerPallet * stack : null;

  const stackedHeightIn =
    palletHeightIn !== null ? palletHeightIn * stack : null;

  let fits: boolean | null = null;
  let fitMessage: string | null = null;

  if (stackedHeightIn !== null && maxPalletHeightIn) {
    fits = stackedHeightIn <= maxPalletHeightIn;
    if (!fits) {
      const over = round(stackedHeightIn - maxPalletHeightIn, 2);
      fitMessage =
        stack > 1
          ? `${stack} pallets at ${round(palletHeightIn ?? 0, 2)} in reach ${round(stackedHeightIn, 2)} in — ${over} in over the ${maxPalletHeightIn} in limit. Reduce the stack or the layers.`
          : `${round(stackedHeightIn, 2)} in is ${over} in over the ${maxPalletHeightIn} in limit. Reduce the layers.`;
    }
  }

  return {
    casesPerPallet,
    palletHeightIn: palletHeightIn === null ? null : round(palletHeightIn, 2),
    casesPerPalletSpace,
    stackedHeightIn: stackedHeightIn === null ? null : round(stackedHeightIn, 2),
    fits,
    fitMessage,
  };
}

/**
 * Expiration for a given production date, using the product's own rule.
 * Mirrors the workbook's EDATE(date, shelf life) - 1.
 */
export function expirationFor(
  product: FinishedProduct,
  productionDate: string
): string | null {
  if (!product.shelfLifeValue) return null;

  const [y, m, d] = productionDate.split("-").map(Number);
  if (!y || !m || !d) return null;

  const date = new Date(Date.UTC(y, m - 1, d));

  if (product.shelfLifeUnit === "months") {
    const target = new Date(date);
    target.setUTCMonth(target.getUTCMonth() + product.shelfLifeValue);
    // EDATE clamps to the end of a shorter month; Date rolls over, so pull back.
    if (target.getUTCDate() !== date.getUTCDate()) {
      target.setUTCDate(0);
    }
    target.setUTCDate(target.getUTCDate() + product.expirationOffsetDays);
    return target.toISOString().slice(0, 10);
  }

  date.setUTCDate(
    date.getUTCDate() + product.shelfLifeValue + product.expirationOffsetDays
  );
  return date.toISOString().slice(0, 10);
}

/** Lot number for a production date. MMDDYYYY unless the product overrides it. */
export function lotFor(product: FinishedProduct, productionDate: string): string {
  const [y, m, d] = productionDate.split("-");
  if (!y || !m || !d) return "";
  return product.lotFormat
    .replace("YYYY", y)
    .replace("MM", m)
    .replace("DD", d);
}

/** Pallets needed for a quantity of cases. */
export function palletsFor(
  product: FinishedProduct,
  totalCases: number
): number | null {
  const { casesPerPallet } = palletMath(product);
  if (!casesPerPallet) return null;
  return Math.ceil(totalCases / casesPerPallet);
}

/** Everything incomplete about a spec, phrased as what to do about it. */
export function specWarnings(product: FinishedProduct): string[] {
  const warnings: string[] = [];
  const mathResult = palletMath(product);

  if (!product.casesPerLayer || !product.layersHigh) {
    warnings.push(
      "No cases per layer or layers high — pallets needed cannot be calculated."
    );
  }
  if (!product.caseHeightIn) {
    warnings.push("No case height — pallet height cannot be checked against the limit.");
  }
  if (!product.maxPalletHeightIn) {
    warnings.push("No max pallet height — nothing verifies the stack fits.");
  }
  if (mathResult.fits === false && mathResult.fitMessage) {
    warnings.push(mathResult.fitMessage);
  }
  if (!product.shelfLifeValue) {
    warnings.push("No shelf life — expiration dates cannot be printed.");
  }
  if (!product.netWeightPerCase) {
    warnings.push("No net weight per case — needed for bills of lading.");
  }

  return warnings;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
