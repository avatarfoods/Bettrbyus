import { addDays, format, isAfter, parseISO } from "date-fns";

export type ThawRange = {
  minDays: number;
  maxDays: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseThawRangeDays(
  value: string | number | null | undefined
): ThawRange | null {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  if (!text) return null;

  const rangeMatch = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const first = Number(rangeMatch[1]);
    const second = Number(rangeMatch[2]);
    return {
      minDays: Math.min(first, second),
      maxDays: Math.max(first, second),
    };
  }

  const singleMatch = text.match(/^(\d+)$/);
  if (singleMatch) {
    const days = Number(singleMatch[1]);
    return { minDays: days, maxDays: days };
  }

  return null;
}

export function combineDateAndTime(date: string, time: string): Date {
  return parseISO(`${date}T${time}:00`);
}

function daysBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_DAY;
}

export const THAW_WARNING_DAYS = 3;

function parseIsoDate(value: string): Date | null {
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Move-out deadline = best by, or prep + max thaw days when best by is missing. */
export function getMoveOutDeadline(
  prepDateIso: string | null,
  bestByIso: string | null,
  thawRangeDays: string | number | null | undefined
): Date | null {
  if (bestByIso) {
    const bestByAt = parseIsoDate(bestByIso);
    if (bestByAt) return bestByAt;
  }

  const range = parseThawRangeDays(thawRangeDays);
  if (!range || !prepDateIso) return null;

  const prepAt = parseIsoDate(prepDateIso);
  if (!prepAt) return null;

  return addDays(prepAt, range.maxDays);
}

export function getThawExpiryWarning(
  prepDateIso: string | null,
  bestByIso: string | null,
  thawRangeDays: string | number | null | undefined,
  now: Date = new Date()
): string | null {
  const deadline = getMoveOutDeadline(prepDateIso, bestByIso, thawRangeDays);
  if (!deadline) return null;

  const daysUntilMoveOut = daysBetween(now, deadline);
  const rangeLabel = formatThawRangeLabel(thawRangeDays);

  if (daysUntilMoveOut <= 0) {
    return rangeLabel
      ? `Past ${rangeLabel} thaw limit — move out now`
      : "Past move out date";
  }

  if (daysUntilMoveOut <= THAW_WARNING_DAYS) {
    const days = Math.ceil(daysUntilMoveOut);
    return rangeLabel
      ? `Move out in ${days} day${days === 1 ? "" : "s"} (${rangeLabel} thaw)`
      : `Move out in ${days} day${days === 1 ? "" : "s"}`;
  }

  return null;
}

export function formatThawRangeLabel(
  thawRangeDays: string | number | null | undefined
): string | null {
  const range = parseThawRangeDays(thawRangeDays);
  if (!range) return null;
  if (range.minDays === range.maxDays) {
    return `${range.minDays} day${range.minDays === 1 ? "" : "s"}`;
  }
  return `${range.minDays}–${range.maxDays} days`;
}

/** Best by = prep + max days from thaw range (14-14 → exactly 14 days later). */
export function calculateBestByFromPrep(
  prepDate: string,
  prepTime: string,
  thawRangeDays: string | null | undefined
): { bestByDate: string; bestByTime: string } | null {
  const range = parseThawRangeDays(thawRangeDays);
  if (!range) return null;

  const prepAt = combineDateAndTime(prepDate, prepTime);
  if (Number.isNaN(prepAt.getTime())) return null;

  const bestByAt = addDays(prepAt, range.maxDays);
  return {
    bestByDate: format(bestByAt, "yyyy-MM-dd"),
    bestByTime: format(bestByAt, "HH:mm"),
  };
}

export function validatePrepForMovingIn(
  prepDate: string,
  prepTime: string,
  thawRangeDays: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!parseThawRangeDays(thawRangeDays)) {
    return "This item has no thaw range configured";
  }

  const prepAt = combineDateAndTime(prepDate, prepTime);
  if (Number.isNaN(prepAt.getTime())) {
    return "Invalid prep date or time";
  }

  if (isAfter(prepAt, now)) {
    return "Prep date and time cannot be in the future";
  }

  return null;
}

export function validateMovingInThawRange(
  prepDate: string,
  prepTime: string,
  bestByDate: string,
  bestByTime: string,
  thawRangeDays: string | null | undefined,
  now: Date = new Date()
): { field: "prepDate" | "bestByDate"; message: string } | null {
  const prepError = validatePrepForMovingIn(
    prepDate,
    prepTime,
    thawRangeDays,
    now
  );
  if (prepError) {
    return { field: "prepDate", message: prepError };
  }

  const calculated = calculateBestByFromPrep(prepDate, prepTime, thawRangeDays);
  if (
    !calculated ||
    calculated.bestByDate !== bestByDate ||
    calculated.bestByTime !== bestByTime
  ) {
    return {
      field: "bestByDate",
      message: "Best by date could not be calculated from thaw range",
    };
  }

  return null;
}
