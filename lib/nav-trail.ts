/**
 * The breadcrumb trail, the way Odoo does it.
 *
 * A breadcrumb here is not a description of where a page sits in a hierarchy.
 * It is a record of how you actually got there: Planning, then the recipe you
 * clicked out of it, then the sub-recipe you clicked out of that. Clicking a
 * crumb returns you to that exact view - the range you had picked, the
 * department you had filtered to, the search you had typed - because the trail
 * stores the whole URL, query and all, not just the route.
 *
 * The rule is one line: if the page you are opening is already somewhere in
 * the trail, cut back to it; otherwise add it to the end. That single rule is
 * what stops the trail growing forever when someone paces back and forth
 * between two records, and it is why going "back" is never ambiguous.
 *
 * It lives in sessionStorage rather than the URL: it is one person's path
 * through one tab, so a link they paste to somebody else should not carry it,
 * and a refresh should not lose it.
 */

export type TrailStep = {
  /** What the crumb says. */
  label: string;
  /** Where it goes back to - path AND query, so the view is restored. */
  href: string;
  /** Identity for the "already in the trail" test. Usually the pathname. */
  key: string;
};

const STORAGE_KEY = "bettrbyus:nav-trail";

/** How deep the trail may go before the oldest steps are dropped. */
const MAX_STEPS = 8;

export function readTrail(): TrailStep[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (step): step is TrailStep =>
        typeof step === "object" &&
        step !== null &&
        typeof (step as TrailStep).label === "string" &&
        typeof (step as TrailStep).href === "string" &&
        typeof (step as TrailStep).key === "string"
    );
  } catch {
    // A private window, or storage the browser refuses. A trail is a
    // convenience; losing it must never stop the page rendering.
    return [];
  }
}

/*
  The trail is an external store, subscribed to rather than mirrored.

  A cached snapshot is not an optimisation here: useSyncExternalStore compares
  snapshots by identity, so parsing the JSON afresh on every read would return
  a new array each time and never stop re-rendering.
*/
let snapshot: TrailStep[] = [];
let loaded = false;
const listeners = new Set<() => void>();

export function subscribeTrail(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTrailSnapshot(): TrailStep[] {
  if (!loaded) {
    snapshot = readTrail();
    loaded = true;
  }
  return snapshot;
}

/** The server has no session, so the trail starts empty there. */
export function getTrailServerSnapshot(): TrailStep[] {
  return EMPTY;
}

const EMPTY: TrailStep[] = [];

function writeTrail(steps: TrailStep[]): void {
  snapshot = steps;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
    } catch {
      // See readTrail.
    }
  }
  for (const listener of listeners) listener();
}

/**
 * Records arriving at a page, and returns the trail as it now stands.
 *
 * `root` resets the trail: landing on an app's own home is starting again,
 * not going nine levels deep into it.
 */
export function pushStep(step: TrailStep, options: { root?: boolean } = {}): TrailStep[] {
  const current = getTrailSnapshot();

  if (options.root) {
    const next = [step];
    writeTrail(next);
    return next;
  }

  const seen = current.findIndex((entry) => entry.key === step.key);

  // Already in the trail: this is a step BACK, so cut everything after it.
  // The href is refreshed because the view may have moved on since - a
  // different date range, a different filter - and going back should return
  // you to where you actually were, not where you first were.
  const next =
    seen >= 0
      ? [...current.slice(0, seen), step]
      : [...current, step].slice(-MAX_STEPS);

  // Nothing moved: writing would notify every subscriber for no reason.
  const same =
    next.length === current.length &&
    next.every(
      (entry, index) =>
        entry.key === current[index].key &&
        entry.href === current[index].href &&
        entry.label === current[index].label
    );
  if (same) return current;

  writeTrail(next);
  return next;
}

export function clearTrail(): void {
  writeTrail([]);
}
