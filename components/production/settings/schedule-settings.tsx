"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Search } from "lucide-react";
import { saveTimingWindow } from "@/lib/production/schedule/actions";
import {
  Notice,
  SettingsPage,
  useConfigRunner,
} from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

export type WindowRow = {
  recipeId: string;
  wipCode: string;
  name: string;
  department: string | null;
  uom: string | null;
  earliestOffset: number | null;
  latestOffset: number | null;
};

/** How far back the chart draws. Anything earlier is clamped to the edge. */
const SCALE = 14;

/**
 * Every timing window in one table.
 *
 * The same rule is editable on each recipe's own Timing window tab - this is
 * the same stored window, not a second copy - but setting them one recipe at a
 * time means opening 199 pages. Here they can be swept through, which is how
 * you notice the one item that is the odd one out.
 *
 * The bar down the right is the point of the page. Two numbers in two boxes
 * are read one row at a time; a row of bars against a shared scale is read all
 * at once, and a window that does not belong stands out without being looked
 * for.
 */
export function ScheduleSettings({
  windows,
  isAdmin,
}: {
  windows: WindowRow[];
  isAdmin: boolean;
}) {
  const { run, pending, notice } = useConfigRunner();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "set" | "unset">("all");
  const [department, setDepartment] = useState("");

  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const row of windows) if (row.department) names.add(row.department);
    return [...names].sort();
  }, [windows]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return windows.filter((row) => {
      const set = row.earliestOffset !== null || row.latestOffset !== null;
      if (filter === "set" && !set) return false;
      if (filter === "unset" && set) return false;
      if (department && row.department !== department) return false;
      if (!needle) return true;
      return `${row.wipCode} ${row.name} ${row.department ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [windows, query, filter, department]);

  /** Rows under a department heading, so the eye has somewhere to rest. */
  const groups = useMemo(() => {
    const map = new Map<string, WindowRow[]>();
    for (const row of rows) {
      const key = row.department ?? "No department";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const configured = windows.filter(
    (row) => row.earliestOffset !== null || row.latestOffset !== null
  ).length;

  return (
    <SettingsPage
      intro={
        <>
          How many days ahead of the day it is wanted each item may be made —
          the same window each recipe carries on its own Timing window tab, so
          a change here shows there. Typing saves as you leave the field.
          {!isAdmin && " Editing is limited to administrators."}
        </>
      }
    >
      <Notice notice={notice} />

      <div className="flex flex-col gap-2">
        {/* Toolbar. Search, then the two questions actually asked of this
            page: which department, and what is still blank. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-0 flex-1 sm:max-w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipe or item…"
              aria-label="Search recipes"
              className="h-7 w-full rounded-md border border-border bg-card pr-2 pl-7 text-xs placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            aria-label="Department"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
          >
            <option value="">All departments</option>
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <div className="flex overflow-hidden rounded-md border border-border">
            {(
              [
                ["all", "All"],
                ["set", "Set"],
                ["unset", "Blank"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  "h-7 px-2.5 text-xs transition",
                  filter === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="ml-auto text-[0.6875rem] text-muted-foreground tabular-nums">
            <strong className="text-foreground">{configured}</strong> of{" "}
            {windows.length} set · showing {rows.length}
          </span>
        </div>

        <div className="overflow-hidden rounded-md ring-1 ring-foreground/10">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/60 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                <th className="w-16 px-2 py-1 text-left font-semibold">Item</th>
                <th className="px-2 py-1 text-left font-semibold">Recipe</th>
                <th className="w-16 px-1 py-1 text-right font-semibold">
                  Earliest
                </th>
                <th className="w-16 px-1 py-1 text-right font-semibold">
                  Latest
                </th>
                <th className="px-2 py-1 text-left font-semibold">
                  <Scale />
                </th>
                <th className="w-8" />
              </tr>
            </thead>

            {groups.map(([name, list]) => (
              <tbody key={name}>
                <tr>
                  <th
                    colSpan={6}
                    className="sticky top-0 z-10 border-y border-border bg-brand-muted px-2 py-0.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase"
                  >
                    {name}
                    <span className="ml-1.5 font-normal opacity-60">
                      {list.length}
                    </span>
                  </th>
                </tr>
                {list.map((row) => (
                  <WindowEditor
                    key={row.recipeId}
                    row={row}
                    run={run}
                    pending={pending}
                    isAdmin={isAdmin}
                  />
                ))}
              </tbody>
            ))}

            {groups.length === 0 && (
              <tbody>
                <tr>
                  <td
                    colSpan={6}
                    className="px-2 py-6 text-center text-muted-foreground"
                  >
                    Nothing matches.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>
    </SettingsPage>
  );
}

/** The ruler the bars are read against. Day 0 is the day it is wanted. */
function Scale() {
  return (
    <span className="flex justify-between font-normal tabular-nums">
      {[-14, -10, -7, -4, -2, 0].map((day) => (
        <span key={day}>{day === 0 ? "day 0" : day}</span>
      ))}
    </span>
  );
}

function WindowEditor({
  row,
  run,
  pending,
  isAdmin,
}: {
  row: WindowRow;
  run: ReturnType<typeof useConfigRunner>["run"];
  pending: boolean;
  isAdmin: boolean;
}) {
  const asText = (value: number | null) => (value === null ? "" : String(value));

  const [earliest, setEarliest] = useState(asText(row.earliestOffset));
  const [latest, setLatest] = useState(asText(row.latestOffset));
  const [saved, setSaved] = useState(false);

  const dirty =
    earliest !== asText(row.earliestOffset) || latest !== asText(row.latestOffset);

  /**
   * Saving happens on the way out of the field rather than through a button.
   * Two hundred rows means two hundred buttons, and every one of them is a
   * chance to type a number and walk away thinking it stuck.
   */
  function commit() {
    if (!dirty || !isAdmin) return;
    run(
      () =>
        saveTimingWindow({
          recipeId: row.recipeId,
          earliestOffset: earliest === "" ? null : Number(earliest),
          latestOffset: latest === "" ? null : Number(latest),
        }),
      `${row.name} saved`
    );
    setSaved(true);
  }

  const from = earliest === "" ? null : Number(earliest);
  const to = latest === "" ? null : Number(latest);

  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/40">
      <td className="px-2 py-0.5 font-mono text-[0.625rem] text-muted-foreground">
        {row.wipCode}
      </td>
      <td className="max-w-0 truncate px-2 py-0.5 font-medium" title={row.name}>
        {row.name}
      </td>
      <td className="px-1 py-0.5 text-right">
        <Offset
          value={earliest}
          onChange={setEarliest}
          onCommit={commit}
          disabled={!isAdmin || pending}
          label={`Earliest for ${row.name}`}
        />
      </td>
      <td className="px-1 py-0.5 text-right">
        <Offset
          value={latest}
          onChange={setLatest}
          onCommit={commit}
          disabled={!isAdmin || pending}
          label={`Latest for ${row.name}`}
        />
      </td>
      <td className="px-2 py-0.5">
        <WindowBar from={from} to={to} />
      </td>
      <td className="px-1 py-0.5 text-right">
        {saved && !dirty ? (
          <Check className="ml-auto size-3 text-success" aria-label="Saved" />
        ) : (
          <Link
            href={`/recipes/${row.recipeId}`}
            aria-label={`Open ${row.name}`}
            title="Open the recipe"
            className="inline-flex text-muted-foreground/50 hover:text-primary"
          >
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </td>
    </tr>
  );
}

function Offset({
  value,
  onChange,
  onCommit,
  disabled,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <input
      type="number"
      max={0}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      placeholder="—"
      aria-label={label}
      className={cn(
        "h-5 w-14 rounded border border-transparent bg-transparent px-1 text-right tabular-nums",
        "hover:border-border focus:border-primary focus:bg-card focus:outline-none",
        "disabled:hover:border-transparent",
        value === "" && "text-muted-foreground/40"
      )}
    />
  );
}

/**
 * The window drawn against the shared scale, day 0 on the right.
 *
 * A window with only one end set is still worth drawing: it says "no earlier
 * than this" or "no later than this", and an open end reads as a fade rather
 * than a hard stop.
 */
function WindowBar({ from, to }: { from: number | null; to: number | null }) {
  if (from === null && to === null) {
    return (
      <span className="block h-1.5 rounded-[1px] bg-[repeating-linear-gradient(90deg,var(--color-border)_0_3px,transparent_3px_6px)]" />
    );
  }

  const pct = (day: number) =>
    ((Math.max(-SCALE, Math.min(0, day)) + SCALE) / SCALE) * 100;

  const left = pct(from ?? -SCALE);
  const right = pct(to ?? 0);
  const openStart = from === null;
  const openEnd = to === null;

  return (
    <span className="relative block h-1.5 rounded-[1px] bg-muted">
      {/* Day 0 - the day it is wanted. Everything is measured back from here. */}
      <span className="absolute inset-y-[-2px] right-0 w-px bg-foreground/25" />
      <span
        className={cn(
          "absolute inset-y-0 rounded-[1px] bg-primary",
          openStart && "rounded-l-none opacity-70",
          openEnd && "rounded-r-none"
        )}
        style={{
          left: `${left}%`,
          width: `${Math.max(right - left, 2)}%`,
        }}
      />
    </span>
  );
}
