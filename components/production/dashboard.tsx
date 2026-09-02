"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { departmentColor } from "@/lib/production/department-colors";
import {
  DAY_LABEL,
  fmt,
  longDate,
  shortUom,
  type DashboardDay,
} from "@/lib/production/dashboard";
import { cn } from "@/lib/utils";

export function ProductionDashboard({
  days,
  from,
  to,
  today,
  departmentColors,
  departmentLines,
  allLines,
  isDraftOnly,
}: {
  days: DashboardDay[];
  from: string;
  to: string;
  today: string;
  departmentColors: [string, string | null][];
  /** Department name to the line it belongs to, so the filter can cascade. */
  departmentLines: [string, string][];
  /** Every active line, whether or not anything is scheduled on it. */
  allLines: string[];
  /** True when nothing has been confirmed, so this is not yet official. */
  isDraftOnly: boolean;
}) {
  const router = useRouter();

  /** Moves the range, keeping everything else. */
  const go = (nextFrom: string, nextTo: string) =>
    router.push(
      `/production?from=${nextFrom}&to=${nextTo < nextFrom ? nextFrom : nextTo}`
    );
  const chosen = useMemo(() => new Map(departmentColors), [departmentColors]);
  const order = useMemo(() => [...chosen.keys()], [chosen]);
  const look = (name: string) =>
    departmentColor(chosen.get(name), order.indexOf(name));

  /** Opens on today when today is in range, otherwise on the first day. */
  const [picked, setPicked] = useState<string>(() =>
    days.some((day) => day.date === today) ? today : (days[0]?.date ?? from)
  );
  /*
    Filters are this person's, and only this person's.

    Four hundred people open this page. Somebody narrowing it to Main Kitchen
    must not narrow it for anyone else, so none of this is stored on the
    server - it lives in their own browser, and comes back the next time they
    open it. The plan is shared; how you look at it is not.
  */
  /*
    Subscribed to, not copied into state.

    Reading localStorage in a useState initialiser returns the default on the
    server and the saved view on the client, which is a hydration mismatch -
    the same trap as looking a DOM node up during render. useSyncExternalStore
    exists for exactly this: it hands React a server snapshot to hydrate
    against and swaps in the real one immediately after.
  */
  const view = useSyncExternalStore(subscribeView, readView, serverView);
  const line = view.line;
  const dept = view.dept;

  const setLine = (next: string) =>
    writeView({ ...view, line: next, dept: "" });
  const setDept = (next: string) => writeView({ ...view, dept: next });
  /**
   * One day, or the whole week laid out at once.
   *
   * A day is what somebody on the floor wants; the week is what a supervisor
   * wants, and asking them to click seven times to see it is the difference
   * between a board and a form.
   */
  const span = view.span;
  const setSpan = (next: "day" | "week") => writeView({ ...view, span: next });

  const lineOf = useMemo(() => new Map(departmentLines), [departmentLines]);

  /** Every department that appears anywhere in the range, for the filter. */
  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const entry of days) {
      for (const group of entry.departments) names.add(group.department);
    }
    return [...names].sort();
  }, [days]);

  /**
   * Departments of the chosen line.
   *
   * Taken from the configuration rather than from what happens to be
   * scheduled: a room with nothing on today is still a room, and having it
   * vanish from the filter makes the control look broken.
   */
  const deptChips = useMemo(() => {
    const all = new Set([...departments, ...lineOf.keys()]);
    return [...all]
      .filter((name) => !line || lineOf.get(name) === line)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [departments, lineOf, line, order]);

  const keep = (department: string) =>
    (!line || lineOf.get(department) === line) &&
    (!dept || department === dept);

  const shownDays = (span === "week" ? days : days.filter((d) => d.date === picked))
    .map((entry) => ({
      ...entry,
      departments: entry.departments.filter((g) => keep(g.department)),
    }));

  const day = days.find((entry) => entry.date === picked) ?? days[0] ?? null;

  const busiest = Math.max(1, ...days.map((entry) => entry.pounds));
  /** How many days are on screen, so the arrows step by exactly that. */
  const length = Math.max(1, days.length);

  return (
    <div className="flex min-h-full flex-col gap-2.5 bg-surface-sunk px-3 py-3 sm:px-4">
      {isDraftOnly && (
        <p className="flex items-center gap-2 rounded-sm bg-warning-muted px-2.5 py-1.5 text-xs text-warning-foreground">
          <AlertTriangle className="size-3.5 shrink-0" />
          Nothing has been confirmed yet, so this is the workbook&rsquo;s
          numbers. Confirm a plan and this becomes what the floor is working
          from.
        </p>
      )}

      {/*
        One bar, centred, the way Odoo puts its control panel.

        Three groups, left to right, in the order the question is asked: when,
        what, and how much of it at once. Dividers rather than boxes, because
        a control panel is one object - three cards stacked made the page look
        like it began three times before the work started.

        Line and area are a chain rather than two rows of chips: "Bettr Bowl
        › Main Kitchen AM" is how people say it, it takes one line instead of
        three, and it makes the narrowing obvious rather than implied.
      */}
      <div className="flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-sm bg-card px-2 py-1.5 ring-1 ring-foreground/10">
          <button
            type="button"
            onClick={() => go(shift(from, -length), shift(to, -length))}
            aria-label="Earlier"
            className={STEP}
          >
            <ChevronLeft className="size-4" />
          </button>

          <input
            type="date"
            value={from}
            max={to}
            aria-label="From"
            onChange={(event) => event.target.value && go(event.target.value, to)}
            className={DATE}
          />
          <span className="text-xs text-muted-foreground">&rarr;</span>
          <input
            type="date"
            value={to}
            min={from}
            aria-label="To"
            onChange={(event) => event.target.value && go(from, event.target.value)}
            className={DATE}
          />

          <button
            type="button"
            onClick={() => go(shift(from, length), shift(to, length))}
            aria-label="Later"
            className={STEP}
          >
            <ChevronRight className="size-4" />
          </button>

          <span className="text-[0.625rem] text-muted-foreground tabular-nums">
            {length}d
          </span>

          <Divider />

          {/* Bettr Bowl › Main Kitchen AM. */}
          <select
            value={line}
            onChange={(event) => setLine(event.target.value)}
            aria-label="Line"
            className={cn(SELECT, line && "font-semibold text-foreground")}
          >
            <option value="">All lines</option>
            {allLines.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />

          <span className="flex items-center gap-1.5">
            {dept && (
              <span className={cn("block h-3.5 w-1 shrink-0", look(dept).dot)} />
            )}
            <select
              value={dept}
              onChange={(event) => setDept(event.target.value)}
              aria-label="Area"
              disabled={deptChips.length === 0}
              className={cn(
                SELECT,
                dept && "font-semibold text-foreground",
                deptChips.length === 0 && "opacity-50"
              )}
            >
              <option value="">
                {deptChips.length === 0 ? "No areas set up" : "All areas"}
              </option>
              {deptChips.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </span>

          <Divider />

          <div className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
            {(
              [
                ["day", "One day"],
                ["week", "Whole range"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSpan(id)}
                aria-pressed={span === id}
                className={cn(
                  "h-7 px-2.5 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
                  span === id
                    ? "bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/*
        The days, left to right.

        Each carries a bar of its own size against the busiest day in the
        range, so the shape of the week is visible before a single number is
        read - Monday heavy, Thursday empty - which is what people take off a
        board they are walking past. It is an overview in both modes: across a
        range nothing is highlighted, and tapping a day drills into it.
      */}
      <div className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        {days.map((entry) => {
          const active = span === "day" && entry.date === picked;
          const isToday = entry.date === today;
          const empty = entry.recipeCount === 0;

          return (
            <button
              key={entry.date}
              type="button"
              onClick={() => {
                setPicked(entry.date);
                setSpan("day");
              }}
              aria-pressed={active}
              title={
                span === "week"
                  ? `Show ${longDate(entry.date)} on its own`
                  : undefined
              }
              className={cn(
                "relative flex min-w-20 flex-1 flex-col gap-0.5 rounded-sm border-2 px-1.5 py-1 text-left transition-colors sm:min-w-24",
                active
                  ? "border-primary bg-card"
                  : empty
                    ? "border-transparent bg-card/50 hover:border-border"
                    : "border-transparent bg-card hover:border-border",
                // Today is underlined whether or not it is the day on screen,
                // so the week always says where you are in it.
                isToday && !active && "border-b-primary/50"
              )}
            >
              <span className="flex items-baseline justify-between gap-1">
                <span
                  className={cn(
                    "text-[0.5625rem] font-semibold tracking-wider uppercase",
                    isToday ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {DAY_LABEL[
                    new Date(`${entry.date}T00:00:00Z`).getUTCDay()
                  ].slice(0, 3)}
                </span>
                <span className="text-[0.6875rem] font-bold tabular-nums">
                  {entry.date.slice(5, 7)}/{entry.date.slice(8, 10)}
                </span>
              </span>

              <span
                className={cn(
                  "text-base leading-none font-bold tabular-nums sm:text-lg",
                  empty ? "text-muted-foreground/30" : "text-foreground"
                )}
              >
                {empty ? "—" : fmt(entry.pounds)}
                {!empty && (
                  <span className="ml-0.5 text-[0.5625rem] font-normal text-muted-foreground">
                    lb
                  </span>
                )}
              </span>

              {/* Stacked in department colour: the whole day at a glance. */}
              <span className="flex h-1 gap-px overflow-hidden rounded-sm bg-muted">
                {entry.departments.map((group) => (
                  <span
                    key={group.department}
                    title={`${group.department} — ${fmt(group.pounds || group.units)}`}
                    className={cn("block", look(group.department).dot)}
                    style={{
                      width: `${((group.pounds || group.units) / busiest) * 100}%`,
                    }}
                  />
                ))}
              </span>

              <span
                className={cn(
                  "truncate text-[0.5625rem]",
                  isToday
                    ? "font-bold text-primary"
                    : "text-muted-foreground"
                )}
              >
                {isToday
                  ? "TODAY"
                  : empty
                    ? "—"
                    : `${entry.recipeCount} item${entry.recipeCount === 1 ? "" : "s"}`}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        What is being looked at, said once.

        On one day that is the day; across a range it is the range and its
        total.
      */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b-2 border-b-foreground/15 pb-1">
        <h2 className="text-base font-bold">
          {span === "day" && day
            ? longDate(day.date)
            : `${longDate(from)} — ${longDate(to)}`}
        </h2>
        <Total
          value={shownDays.reduce((sum, entry) => sum + entry.pounds, 0)}
          unit="lb"
        />
        <Total
          value={shownDays.reduce((sum, entry) => sum + entry.units, 0)}
          unit="ea / cs"
        />
        <span className="ml-auto text-[0.6875rem] text-muted-foreground">
          {span === "day"
            ? `${day?.recipeCount ?? 0} items`
            : `${shownDays.filter((entry) => entry.departments.length > 0).length} days with work`}
        </span>
      </div>

      {/*
        The work itself.

        One day, or every day in the range side by side. Both are the same
        card, so the only thing that changes is how many columns of them there
        are - and on a phone that collapses to one column and reads as a list,
        which is the shape it has to have there anyway.
      */}
      {shownDays.every((entry) => entry.departments.length === 0) ? (
        <p className="flex flex-col items-center gap-1 rounded-sm bg-card px-3 py-10 text-center ring-1 ring-foreground/10">
          <Package className="size-5 text-muted-foreground/40" />
          <span className="text-sm font-semibold">Nothing planned</span>
          <span className="text-xs text-muted-foreground">
            {dept || line
              ? `${dept || line} has nothing ${span === "week" ? "in this range" : `on ${longDate(picked)}`}.`
              : span === "week"
                ? "Nothing is scheduled in this range."
                : `Nothing is scheduled for ${longDate(picked)}.`}
          </span>
        </p>
      ) : (
        <div
          className={cn(
            "grid gap-2",
            span === "week"
              ? "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              : "sm:grid-cols-2 xl:grid-cols-3"
          )}
        >
          {shownDays.map((entry) =>
            span === "week" && entry.departments.length === 0 ? null : (
              <div key={entry.date} className="flex flex-col gap-1.5">
                {span === "week" && (
                  <h3 className="flex items-baseline gap-2 border-b border-border pb-0.5">
                    <span className="text-xs font-bold">
                      {longDate(entry.date)}
                    </span>
                    <span className="ml-auto text-xs font-bold tabular-nums">
                      {fmt(entry.pounds)}
                      <span className="ml-0.5 text-[0.5625rem] font-normal text-muted-foreground">
                        lb
                      </span>
                    </span>
                  </h3>
                )}

                {entry.departments.map((group) => {
                  const style = look(group.department);
                  return (
                    <section
                      key={group.department}
                      className="relative overflow-hidden rounded-sm bg-card ring-1 ring-foreground/10"
                    >
                      {/* The department's colour down the full height, so a
                          column of cards reads as one area at a glance. */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-0 left-0 w-1",
                          style.dot
                        )}
                      />
                      <header
                        className={cn(
                          "flex items-baseline justify-between gap-2 py-1 pr-2 pl-3",
                          style.tint
                        )}
                      >
                        <span className="min-w-0 truncate text-[0.6875rem] font-bold tracking-wide uppercase">
                          {group.department}
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {fmt(group.pounds || group.units)}
                          <span className="ml-0.5 text-[0.5625rem] font-normal">
                            {group.pounds > 0 ? "lb" : "ea"}
                          </span>
                        </span>
                      </header>

                      <ul className="flex flex-col">
                        {group.rows.map((row) => (
                          <li
                            key={row.recipe.id}
                            className="flex items-center gap-2 border-b border-border/40 py-1 pr-2 pl-3 last:border-b-0"
                          >
                            <Link
                              href={`/recipes/${row.recipe.id}`}
                              className="min-w-0 flex-1 truncate text-xs hover:text-primary hover:underline"
                            >
                              {row.recipe.name}
                            </Link>
                            <span className="shrink-0 text-xs font-bold tabular-nums">
                              {fmt(row.quantity)}
                              <span className="ml-0.5 text-[0.5625rem] font-normal text-muted-foreground">
                                {shortUom(row.recipe.uom)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      <p className="mt-auto flex items-center gap-2 pt-2 text-[0.6875rem] text-muted-foreground">
        <CalendarRange className="size-3.5 shrink-0" />
        The confirmed plan only — open drafts are not shown here, so what you
        see is what the floor is working from.
        <Link
          href="/production/schedule"
          className="ml-auto text-primary hover:underline"
        >
          Open planning
        </Link>
      </p>
    </div>
  );
}


/** A hairline between groups in the control bar. */
function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

const STEP =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-primary transition-colors hover:bg-muted";

const SELECT =
  "h-7 max-w-40 rounded-sm border-none bg-transparent px-1 text-xs text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none";

const DATE =
  "h-7 rounded-sm border border-border bg-card px-1.5 text-xs tabular-nums focus:ring-1 focus:ring-primary focus:outline-none";

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type SavedView = { line: string; dept: string; span: "day" | "week" };

const VIEW_KEY = "bettrbyus:dashboard-view";
const DEFAULT_VIEW: SavedView = { line: "", dept: "", span: "day" };

/*
  The saved view as an external store.

  The snapshot is cached because useSyncExternalStore compares by identity:
  parsing the JSON afresh on every read would return a new object each time
  and never stop re-rendering.
*/
let snapshot: SavedView | null = null;
const listeners = new Set<() => void>();

function subscribeView(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The server has nobody's browser, so it hydrates against the default. */
function serverView(): SavedView {
  return DEFAULT_VIEW;
}

function readView(): SavedView {
  if (snapshot) return snapshot;
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SavedView>) : {};
    snapshot = {
      line: typeof parsed.line === "string" ? parsed.line : "",
      dept: typeof parsed.dept === "string" ? parsed.dept : "",
      span: parsed.span === "week" ? "week" : "day",
    };
  } catch {
    // A private window, or storage the browser refuses. The default view is
    // a fine answer; nothing here is worth failing a render over.
    snapshot = DEFAULT_VIEW;
  }
  return snapshot;
}

function writeView(next: SavedView): void {
  snapshot = next;
  try {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(next));
  } catch {
    // See readView.
  }
  for (const listener of listeners) listener();
}


/** One of the day's totals, in the unit it is counted in. */
function Total({ value, unit }: { value: number; unit: string }) {
  if (value <= 0) return null;
  return (
    <span className="text-sm">
      <span className="text-xl font-bold tabular-nums">{fmt(value)}</span>
      <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
    </span>
  );
}
