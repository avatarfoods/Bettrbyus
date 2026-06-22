import { intervalToDuration, parseISO } from "date-fns";

export function formatTimeInFreezer(
  startIso: string | null | undefined,
  endIso?: string | null,
  now: Date = new Date()
): string {
  if (!startIso) return "—";

  const start = parseISO(startIso);
  if (Number.isNaN(start.getTime())) return "—";

  const end = endIso ? parseISO(endIso) : now;
  if (Number.isNaN(end.getTime()) || end < start) return "—";

  const duration = intervalToDuration({ start, end });
  const parts: string[] = [];

  if (duration.days) {
    parts.push(`${duration.days} day${duration.days === 1 ? "" : "s"}`);
  }
  if (duration.hours) {
    parts.push(`${duration.hours} hr${duration.hours === 1 ? "" : "s"}`);
  }
  if (duration.minutes && parts.length === 0) {
    parts.push(`${duration.minutes} min`);
  }

  return parts.length > 0 ? parts.join(", ") : "< 1 min";
}
