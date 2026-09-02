import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_LINES } from "@/lib/odoo/constants";

/**
 * Production lines and departments, read from the database.
 *
 * These used to be constants in the code. They are business configuration -
 * which Odoo category Pizza Cupcake pulls from, what a department is called,
 * which line it belongs to - so they live in a table an admin can edit.
 *
 * lib/odoo/constants.ts keeps the original values as the fallback, so the app
 * still works before the migration runs or if the tables are empty.
 */

export type ProductionLine = {
  id: string;
  key: string;
  name: string;
  /** Odoo categories this line pulls from. Empty means the tab shows nothing. */
  odooCategoryIds: number[];
  sortOrder: number;
  active: boolean;
};

export type ProductionDepartment = {
  id: string;
  name: string;
  lineId: string | null;
  lineName: string | null;
  sortOrder: number;
  active: boolean;
  /** A key from DEPARTMENT_COLORS. Null means take the palette in order. */
  color: string | null;
};

/**
 * True when this line is a real row and can be referenced by a foreign key.
 *
 * The fallback lines are built from code when the table is empty, so they
 * have made-up ids. Writing one into a uuid column fails, and it failed in
 * exactly the place you would least want it to: creating the live plan.
 */
export function isRealLine(line: ProductionLine | null | undefined): boolean {
  return Boolean(line && !line.id.startsWith("fallback-"));
}

export type ProductionConfig = {
  lines: ProductionLine[];
  departments: ProductionDepartment[];
  /** True when the tables are missing or empty and defaults are in use. */
  usingFallback: boolean;
};

/** What the code assumed before any of this was configurable. */
function fallbackLines(): ProductionLine[] {
  return PRODUCT_LINES.map((line, index) => ({
    /*
      Deliberately not a uuid, and it matters.

      These lines exist only in code, so they have no database row and no id
      to give. Anything that writes a line reference has to notice that and
      refuse - see isRealLine - rather than handing Postgres a string it will
      reject with "invalid input syntax for type uuid".
    */
    id: `fallback-${line.key}`,
    key: line.key,
    name: line.label,
    odooCategoryIds: [line.id],
    sortOrder: index + 1,
    active: true,
  }));
}

export async function fetchProductionConfig(
  supabase: SupabaseClient
): Promise<ProductionConfig> {
  const [linesResult, deptResult] = await Promise.all([
    supabase
      // select("*") for the same reason the departments query uses it: naming
      // a column PostgREST has not caught up with fails the whole query, and
      // a failed query here silently swaps every real line for a fake one.
      .from("production_lines")
      .select("*")
      .order("sort_order"),
    supabase
      // select("*") rather than a column list: PostgREST rejects the whole
      // query for one unknown column, so naming `color` here would empty the
      // departments table on any database that has not run the migration.
      .from("production_departments")
      .select("*")
      .order("sort_order"),
  ]);

  const rows = linesResult.data ?? [];

  if (linesResult.error || rows.length === 0) {
    return { lines: fallbackLines(), departments: [], usingFallback: true };
  }

  const lines: ProductionLine[] = rows.map((row) => {
    // The array is authoritative; the old single column is the fallback for a
    // database that has not run the 20260828_line_categories migration yet.
    const many = (row.odoo_category_ids as number[] | null) ?? [];
    const one = (row.odoo_category_id as number | null) ?? null;

    return {
      id: row.id as string,
      key: row.key as string,
      name: row.name as string,
      odooCategoryIds:
        many.length > 0 ? many : one !== null ? [one] : [],
      sortOrder: (row.sort_order as number) ?? 0,
      active: (row.active as boolean) ?? true,
    };
  });

  const nameById = new Map(lines.map((line) => [line.id, line.name]));

  const departments: ProductionDepartment[] = (deptResult.data ?? []).map(
    (row) => ({
      id: row.id as string,
      name: row.name as string,
      lineId: (row.line_id as string | null) ?? null,
      lineName: row.line_id ? (nameById.get(row.line_id as string) ?? null) : null,
      sortOrder: (row.sort_order as number) ?? 0,
      active: (row.active as boolean) ?? true,
      color: (row.color as string | null) ?? null,
    })
  );

  return { lines, departments, usingFallback: false };
}

/** Only the lines the order schedule should build tabs for. */
export function tabLines(config: ProductionConfig): ProductionLine[] {
  return config.lines.filter(
    (line) => line.active && line.odooCategoryIds.length > 0
  );
}

/** Department name -> line name, for grouping filters. */
export function departmentLineMap(
  config: ProductionConfig
): Map<string, string> {
  const map = new Map<string, string>();
  for (const department of config.departments) {
    if (department.lineName) map.set(department.name, department.lineName);
  }
  return map;
}
