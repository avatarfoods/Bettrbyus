/**
 * One day, or a span of them.
 *
 * Both questions get asked and neither is a special case of the other:
 * "what did I have on the 31st" wants a single day, "what moved last week"
 * wants two. Forcing a range on the first means picking the same date twice;
 * forcing a day on the second means looking seven times.
 *
 * These are plain functions with no "use client", because the server pages
 * read the scope out of the URL before there is any component to render. The
 * picker that edits one lives in components/ui/date-scope.tsx.
 */
export type DateScope =
  | { kind: "day"; date: string }
  | { kind: "range"; from: string; to: string };

/** The scope as query parameters, so a link carries it. */
export function scopeToQuery(scope: DateScope): string {
  return scope.kind === "day"
    ? `asOf=${scope.date}`
    : `from=${scope.from}&to=${scope.to}`;
}

/** Reads a scope back out of query parameters, falling back to one day. */
export function scopeFromParams(
  params: { asOf?: string; from?: string; to?: string },
  fallback: string
): DateScope {
  if (params.from && params.to && params.to >= params.from) {
    return { kind: "range", from: params.from, to: params.to };
  }
  return { kind: "day", date: params.asOf ?? fallback };
}

/** The end of the scope: the day everything is judged against. */
export function scopeEnd(scope: DateScope): string {
  return scope.kind === "day" ? scope.date : scope.to;
}
