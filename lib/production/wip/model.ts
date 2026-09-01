/**
 * WIP: what is physically in the cooler, by lot.
 *
 * Three ideas hold this together.
 *
 * The lot is a date. MMDDYYYY is the day it was produced, so recording the
 * lot tells the app which day's production the stock came from - no one has
 * to say "this is Tuesday's". Monday's leftovers found on Wednesday attribute
 * to Monday.
 *
 * Expiry is worked out, never typed. Lot date plus the shelf life, and the
 * shelf life is the timing window's earliest offset: something that may be
 * made five days ahead keeps five days.
 *
 * A count is an observation, not a running total. Counting a lot again
 * supersedes the earlier number for that lot rather than adding to it.
 */

export type WipCount = {
  id: string;
  recipeId: string;
  lotCode: string;
  producedOn: string | null;
  containers: number;
  containerSize: number;
  /** Loose amount on top of the whole containers. */
  partialQuantity: number;
  containerLabel: string;
  /** containers x size + partial, worked out by the database. */
  quantity: number;
  countedAt: string;
  countedByName: string | null;
  note: string | null;
};

/** MMDDYYYY -> yyyy-mm-dd. Null when the lot is not a date. */
export function lotToDate(lot: string): string | null {
  const digits = (lot ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return null;

  const month = Number(digits.slice(0, 2));
  const day = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 2000 || year > 2100) return null;

  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  // Rejects 02/31 and friends rather than letting Date roll them over.
  return parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/** yyyy-mm-dd -> MMDDYYYY, the format written on a bucket. */
export function dateToLot(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}${d}${y}` : "";
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type Freshness = "fresh" | "soon" | "last" | "expired" | "unknown";

export type LotAge = {
  producedOn: string | null;
  expiresOn: string | null;
  /** Days left including today. 0 means today is the last day. */
  daysLeft: number | null;
  freshness: Freshness;
  /** Plain words, for the tooltip. */
  reason: string;
};

/**
 * How old a lot is, and how close to unusable.
 *
 * `shelfLife` is the timing window's earliest offset. Null means no window has
 * been set, and nothing is claimed - reporting "fresh" for something nobody
 * has given a shelf life would be a guess dressed as a fact.
 */
export function ageLot(
  lotCode: string,
  shelfLife: number | null,
  today: string
): LotAge {
  const producedOn = lotToDate(lotCode);

  if (producedOn === null) {
    return {
      producedOn: null,
      expiresOn: null,
      daysLeft: null,
      freshness: "unknown",
      reason: `Lot "${lotCode}" is not a date, so nothing can be worked out from it.`,
    };
  }

  if (shelfLife === null) {
    return {
      producedOn,
      expiresOn: null,
      daysLeft: null,
      freshness: "unknown",
      reason:
        "No timing window on this recipe, so it has no shelf life and nothing expires.",
    };
  }

  // A zero shelf life means same-day only: made today, gone tomorrow.
  const expiresOn = addDays(producedOn, shelfLife);
  const daysLeft = daysBetween(today, expiresOn);

  if (daysLeft < 0) {
    return {
      producedOn,
      expiresOn,
      daysLeft,
      freshness: "expired",
      reason: `Made ${producedOn}, keeps ${shelfLife} ${shelfLife === 1 ? "day" : "days"} — expired ${expiresOn}, ${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? "day" : "days"} ago.`,
    };
  }
  if (daysLeft === 0) {
    return {
      producedOn,
      expiresOn,
      daysLeft,
      freshness: "last",
      reason: `Made ${producedOn} — today is the last day it can be used.`,
    };
  }
  if (daysLeft <= 2) {
    return {
      producedOn,
      expiresOn,
      daysLeft,
      freshness: "soon",
      reason: `Made ${producedOn} — ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left, expires ${expiresOn}.`,
    };
  }
  return {
    producedOn,
    expiresOn,
    daysLeft,
    freshness: "fresh",
    reason: `Made ${producedOn} — ${daysLeft} days left, expires ${expiresOn}.`,
  };
}

export type LotOnHand = WipCount & { age: LotAge };

export type RecipeOnHand = {
  recipeId: string;
  lots: LotOnHand[];
  /**
   * Everything physically there, expired included.
   *
   * This is the headline number. Stock that has gone out of date is still in
   * the cooler taking up space and waiting to be thrown - reporting nothing
   * on hand for 250 lb somebody can walk up and touch is the one answer that
   * is certainly wrong.
   */
  total: number;
  /** Of that, what can still be used. */
  usable: number;
  /** Of that, what is past its date. total = usable + expired. */
  expired: number;
  /** The worst state among the lots, for the row's colour. */
  worst: Freshness;
  lastCountedAt: string | null;
  lastCountedBy: string | null;
};

const SEVERITY: Record<Freshness, number> = {
  expired: 4,
  last: 3,
  soon: 2,
  unknown: 1,
  fresh: 0,
};

/**
 * On-hand per recipe, from the latest count of each lot.
 *
 * Counting a lot again supersedes the earlier number rather than adding to
 * it: it is an observation of what is physically there, so the most recent
 * one is the truth and the older ones are history.
 */
export function onHandByRecipe(
  counts: WipCount[],
  shelfLifeByRecipe: Map<string, number | null>,
  /** The day being asked about. Ages are worked out against this, not now. */
  today: string
): Map<string, RecipeOnHand> {
  // recipe -> lot -> the most recent count of it
  const latest = new Map<string, Map<string, WipCount>>();

  for (const count of counts) {
    const byLot = latest.get(count.recipeId) ?? new Map<string, WipCount>();
    const seen = byLot.get(count.lotCode);
    if (!seen || count.countedAt > seen.countedAt) byLot.set(count.lotCode, count);
    latest.set(count.recipeId, byLot);
  }

  const result = new Map<string, RecipeOnHand>();

  for (const [recipeId, byLot] of latest) {
    const shelfLife = shelfLifeByRecipe.get(recipeId) ?? null;

    const lots: LotOnHand[] = [...byLot.values()]
      // A lot counted as zero has been used up. It is history, not stock.
      .filter((count) => count.quantity > 0)
      .map((count) => ({ ...count, age: ageLot(count.lotCode, shelfLife, today) }))
      // Oldest first: what has to be used up sits at the top.
      .sort((a, b) => (a.age.producedOn ?? "").localeCompare(b.age.producedOn ?? ""));

    if (lots.length === 0) continue;

    const total = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const usable = lots
      .filter((lot) => lot.age.freshness !== "expired")
      .reduce((sum, lot) => sum + lot.quantity, 0);
    const expired = total - usable;

    let worst: Freshness = "fresh";
    for (const lot of lots) {
      if (SEVERITY[lot.age.freshness] > SEVERITY[worst]) worst = lot.age.freshness;
    }

    const newest = lots.reduce<LotOnHand | null>(
      (best, lot) => (!best || lot.countedAt > best.countedAt ? lot : best),
      null
    );

    result.set(recipeId, {
      recipeId,
      lots,
      total,
      usable,
      expired,
      worst,
      lastCountedAt: newest?.countedAt ?? null,
      lastCountedBy: newest?.countedByName ?? null,
    });
  }

  return result;
}
