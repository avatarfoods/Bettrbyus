import Link from "next/link";
import { CalendarRange, Package } from "lucide-react";
import type { ScheduleRecipe } from "@/lib/production/schedule/fetch";
import type { ScheduleEntry } from "@/lib/production/schedule/model";
import { cn } from "@/lib/utils";

/**
 * The dashboard.
 *
 * Anyone in the company can open this, so it is read-only and it shows only
 * what is actually being made: a row exists because something is scheduled on
 * it. Planning is where the empty grid lives - a page meant for looking at
 * should never make someone scan past 190 blank lines to find the six that
 * matter.
 *
 * Grouped by day, then by department, because "what is my area making
 * tomorrow" is the question it is opened to answer.
 */

export type DashboardDay = {
  date: string;
  departments: {
    department: string;
    rows: { recipe: ScheduleRecipe; quantity: number }[];
    pounds: number;
    units: number;
  }[];
  pounds: number;
  units: number;
  recipeCount: number;
};

const DAY_LABEL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${DAY_LABEL[date.getUTCDay()]} ${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString();
}

function shortUom(uom: string | null): string {
  const value = (uom ?? "LB").trim().toUpperCase();
  if (value === "LBS" || value === "POUND") return "lb";
  if (value === "UNIT" || value === "EACH" || value === "EA") return "ea";
  if (value === "CASE" || value === "CS") return "cs";
  return value.toLowerCase();
}

/** Everything scheduled in a range, folded into days and departments. */
export function buildDashboard(
  entries: ScheduleEntry[],
  recipes: Map<string, ScheduleRecipe>,
  from: string,
  to: string
): DashboardDay[] {
  const byDate = new Map<string, Map<string, { recipe: ScheduleRecipe; quantity: number }[]>>();

  for (const entry of entries) {
    if (entry.productionDate < from || entry.productionDate > to) continue;
    if (!entry.quantity) continue;

    const recipe = recipes.get(entry.recipeId);
    if (!recipe) continue;

    const dept = recipe.department ?? "Unassigned";
    const day = byDate.get(entry.productionDate) ?? new Map();
    const rows = day.get(dept) ?? [];
    rows.push({ recipe, quantity: entry.quantity });
    day.set(dept, rows);
    byDate.set(entry.productionDate, day);
  }

  const isWeight = (uom: string | null) =>
    ["LB", "LBS", "POUND", "OZ"].includes((uom ?? "LB").trim().toUpperCase());

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, deptMap]) => {
      const departments = [...deptMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([department, rows]) => ({
          department,
          rows: rows.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name)),
          pounds: rows
            .filter((r) => isWeight(r.recipe.uom))
            .reduce((s, r) => s + r.quantity, 0),
          units: rows
            .filter((r) => !isWeight(r.recipe.uom))
            .reduce((s, r) => s + r.quantity, 0),
        }));

      return {
        date,
        departments,
        pounds: departments.reduce((s, d) => s + d.pounds, 0),
        units: departments.reduce((s, d) => s + d.units, 0),
        recipeCount: departments.reduce((s, d) => s + d.rows.length, 0),
      };
    });
}

export function ProductionDashboard({
  days,
  from,
  to,
  isDraftOnly,
}: {
  days: DashboardDay[];
  from: string;
  to: string;
  /** True when nothing has been confirmed, so this is not yet official. */
  isDraftOnly: boolean;
}) {
  const totalRecipes = days.reduce((s, d) => s + d.recipeCount, 0);

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h2 className="text-sm font-semibold">
          {from === to ? longDate(from) : `${longDate(from)} → ${longDate(to)}`}
        </h2>
        <span className="text-xs text-muted-foreground">
          {days.length} {days.length === 1 ? "day" : "days"} · {totalRecipes}{" "}
          {totalRecipes === 1 ? "item" : "items"} scheduled
        </span>
        <Link
          href="/production/schedule"
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground hover:bg-muted"
        >
          <CalendarRange className="size-3.5" />
          Open planning
        </Link>
      </div>

      {isDraftOnly && days.length > 0 && (
        <p className="rounded-md bg-warning-muted px-3 py-1.5 text-xs text-warning-foreground">
          Nothing has been confirmed yet, so this is what planning currently
          holds rather than a finalised plan.
        </p>
      )}

      {days.length === 0 ? (
        <div className="rounded-md bg-card px-4 py-10 text-center ring-1 ring-foreground/10">
          <Package className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Nothing scheduled</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nothing is planned between {from} and {to}.
          </p>
          <Link
            href="/production/schedule"
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <CalendarRange className="size-3.5" />
            Go to planning
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((day) => (
            <section
              key={day.date}
              className="overflow-hidden rounded-md ring-1 ring-foreground/10"
            >
              <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-b-brand/25 bg-brand-muted px-3 py-1.5">
                <h3 className="text-sm font-bold text-primary">
                  {longDate(day.date)}
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {day.pounds > 0 && <strong>{fmt(day.pounds)} lb</strong>}
                  {day.pounds > 0 && day.units > 0 && " · "}
                  {day.units > 0 && <strong>{fmt(day.units)} units</strong>}
                </span>
                <span className="ml-auto text-[0.6875rem] text-muted-foreground">
                  {day.recipeCount} {day.recipeCount === 1 ? "item" : "items"}
                </span>
              </header>

              {day.departments.map((dept) => (
                <div key={dept.department}>
                  <h4 className="flex items-baseline gap-2 border-b border-border bg-muted px-3 py-1 text-[0.625rem] font-semibold tracking-wider text-foreground uppercase">
                    {dept.department}
                    <span className="font-normal tabular-nums text-muted-foreground">
                      {dept.pounds > 0 && `${fmt(dept.pounds)} lb`}
                      {dept.pounds > 0 && dept.units > 0 && " · "}
                      {dept.units > 0 && `${fmt(dept.units)} units`}
                    </span>
                  </h4>

                  <ul className="divide-y divide-border">
                    {dept.rows.map(({ recipe, quantity }) => (
                      <li
                        key={recipe.id}
                        className="flex items-baseline gap-3 px-3 py-1.5"
                      >
                        <span className="w-20 shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                          {recipe.wipCode}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[0.8125rem]",
                            recipe.isFinished && "font-semibold text-primary"
                          )}
                        >
                          {recipe.name}
                        </span>
                        {recipe.allergens.length > 0 && (
                          <span className="hidden shrink-0 text-[0.625rem] text-muted-foreground sm:inline">
                            {recipe.allergens.join(", ")}
                          </span>
                        )}
                        <span className="shrink-0 text-[0.9375rem] font-bold tabular-nums">
                          {fmt(quantity)}
                          <span className="ml-1 text-[0.625rem] font-medium text-muted-foreground uppercase">
                            {shortUom(recipe.uom)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
