import type { ScheduleRecipe } from "@/lib/production/schedule/fetch";
import type { ScheduleEntry } from "@/lib/production/schedule/model";

/**
 * What the dashboard shows, worked out.
 *
 * Plain functions with no "use client": the page builds this on the server
 * before there is any component to render, and a directive at the top of a
 * module makes every export in it client-only - which is why this used to be
 * in the same file as the view and could not be called.
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

export const DAY_LABEL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function longDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${DAY_LABEL[date.getUTCDay()]} ${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function fmt(value: number): string {
  return Math.round(value).toLocaleString();
}

export function shortUom(uom: string | null): string {
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
  to: string,
  /**
   * Departments in tree order, downstream first.
   *
   * Finished product, then assembly, then the kitchens that feed them - the
   * order the plan cascades, and the order somebody reads a day in. Alphabetical
   * put Garde Manger above Main Kitchen, which is backwards from how the work
   * actually flows. It comes from production_departments.sort_order, which is
   * seeded in exactly that sequence and editable in Settings.
   */
  departmentOrder: string[] = []
): DashboardDay[] {
  const rank = new Map(departmentOrder.map((name, index) => [name, index]));
  const place = (name: string) => rank.get(name) ?? Number.MAX_SAFE_INTEGER;
  type Row = { recipe: ScheduleRecipe; quantity: number };
  const byDate = new Map<string, Map<string, Row[]>>();

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

  const dates: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) dates.push(day);

  return dates
    .map((date) => {
      const deptMap = byDate.get(date) ?? new Map<string, Row[]>();
      const departments = [...deptMap.entries()]
        .sort(
          (a, b) => place(a[0]) - place(b[0]) || a[0].localeCompare(b[0])
        )
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

/**
 * The dashboard, as a week you can walk along.
 *
 * Four hundred people open this, most of them standing, most of them looking
 * for one answer: what is my area making, and how much. So it is not a table.
 * It is a row of days you read left to right the way a calendar is read, and
 * a day you tap to see what is in it.
 *
 * Colour does the work. Every department wears the colour it was given in
 * Settings - the same colour it has on the plan and in WIP - so somebody who
 * knows their band never has to read a word to find their column.
 */
