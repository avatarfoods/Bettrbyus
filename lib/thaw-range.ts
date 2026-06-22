import { isAfter, parseISO } from "date-fns";

export type ThawRange = {
  minDays: number;
  maxDays: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseThawRangeDays(
  value: string | null | undefined
): ThawRange | null {
  if (!value?.trim()) return null;

  const rangeMatch = value.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const first = Number(rangeMatch[1]);
    const second = Number(rangeMatch[2]);
    return {
      minDays: Math.min(first, second),
      maxDays: Math.max(first, second),
    };
  }

  const singleMatch = value.trim().match(/^(\d+)$/);
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

export function getThawExpiryWarning(
  prepDateIso: string | null,
  bestByIso: string | null,
  thawRangeDays: string | null | undefined,
  now: Date = new Date()
): string | null {
  const range = parseThawRangeDays(thawRangeDays);
  if (!range || !prepDateIso) return null;

  const prepAt = parseISO(prepDateIso);
  if (Number.isNaN(prepAt.getTime())) return null;

  const daysSincePrep = daysBetween(prepAt, now);
  const remainingInThawWindow = range.maxDays - daysSincePrep;

  if (remainingInThawWindow <= 0) {
    return `Past ${range.maxDays}-day thaw limit`;
  }

  if (remainingInThawWindow <= THAW_WARNING_DAYS) {
    const days = Math.ceil(remainingInThawWindow);
    return `Thaw limit in ${days} day${days === 1 ? "" : "s"} (${range.minDays}–${range.maxDays})`;
  }

  if (bestByIso) {
    const bestByAt = parseISO(bestByIso);
    if (!Number.isNaN(bestByAt.getTime())) {
      const daysUntilBestBy = daysBetween(now, bestByAt);
      if (daysUntilBestBy <= 0) {
        return "Past best by date";
      }
      if (daysUntilBestBy <= THAW_WARNING_DAYS) {
        const days = Math.ceil(daysUntilBestBy);
        return `Best by in ${days} day${days === 1 ? "" : "s"}`;
      }
    }
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
  const range = parseThawRangeDays(thawRangeDays);
  if (!range) return null;

  const prepAt = combineDateAndTime(prepDate, prepTime);
  const bestByAt = combineDateAndTime(bestByDate, bestByTime);

  if (Number.isNaN(prepAt.getTime()) || Number.isNaN(bestByAt.getTime())) {
    return { field: "prepDate", message: "Invalid prep or best by date and time" };
  }

  if (isAfter(prepAt, now)) {
    return {
      field: "prepDate",
      message: "Prep date and time cannot be in the future",
    };
  }

  if (!isAfter(bestByAt, prepAt)) {
    return {
      field: "bestByDate",
      message: "Best by date and time must be after prep date and time",
    };
  }

  const elapsedDays = daysBetween(prepAt, bestByAt);

  if (elapsedDays > range.maxDays) {
    return {
      field: "bestByDate",
      message: `Best by cannot be more than ${range.maxDays} days after prep (thaw range: ${range.minDays}–${range.maxDays} days)`,
    };
  }

  if (elapsedDays < range.minDays) {
    return {
      field: "bestByDate",
      message: `Best by must be at least ${range.minDays} days after prep (thaw range: ${range.minDays}–${range.maxDays} days)`,
    };
  }

  return null;
}
