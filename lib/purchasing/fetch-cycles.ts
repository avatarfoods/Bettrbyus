import type { SupabaseClient } from "@supabase/supabase-js";
import type { Material } from "@/lib/purchasing/types";
import {
  ingredientMatchesMaterial,
  normalizeIngredientName,
} from "@/lib/purchasing/master-parser";

export type LineStatus = "to_order" | "ordered" | "arrived" | "skipped";

export type PurchaseCycle = {
  id: string;
  po_number: number | null;
  required_date: string;
  week_label: string | null;
  status: "draft" | "in_progress" | "done" | "cancelled";
  import_id: string | null;
  created_at: string;
};

export type PurchaseLine = {
  id: string;
  cycle_id: string;
  /** Null when the Excel code has no purchasing_materials match. */
  material_id: string | null;
  /** Excel MASTER PICKING ORDER code — the fallback when material is null. */
  item_code: string | null;
  item_name: string | null;
  cases_required: number;
  lbs_required: number | null;
  on_hand_cases: number | null;
  required_to_order: number;
  order_by_date: string | null;
  status: LineStatus;
  /** Expected arrival date (ETA). */
  arrival_date: string | null;
  /** Actual date/time when status was set to arrived. */
  arrived_at: string | null;
  is_emergency: boolean;
  required_time: string | null;
  notes: string | null;
  material: Pick<
    Material,
    | "id"
    | "item_code"
    | "name"
    | "odoo_product_id"
    | "odoo_category"
    | "storage_type"
    | "department"
    | "lbs_per_case"
    | "is_protein"
    | "thaw_buffer_days"
    | "lead_time_days"
    | "price"
  > | null;
};

/** Odoo material wins; unmatched rows fall back to their Excel identity. */
export function lineItemCode(line: PurchaseLine): string {
  return line.material?.item_code ?? line.item_code ?? "—";
}

export function lineItemName(line: PurchaseLine): string {
  return line.material?.name ?? line.item_name ?? "Unknown";
}

const MATERIAL_SELECT_WITH_DEPT =
  "material:purchasing_materials ( id, item_code, name, odoo_product_id, odoo_category, storage_type, department, lbs_per_case, is_protein, thaw_buffer_days, lead_time_days, price )";

const MATERIAL_SELECT_WITHOUT_DEPT =
  "material:purchasing_materials ( id, item_code, name, odoo_product_id, odoo_category, storage_type, lbs_per_case, is_protein, thaw_buffer_days, lead_time_days, price )";

const LINE_BASE_COLUMNS =
  "id, cycle_id, material_id, cases_required, lbs_required, on_hand_cases, required_to_order, order_by_date, status, arrival_date, is_emergency, required_time, notes";

/**
 * Column sets degrade for databases missing a migration: item_code/item_name
 * (20260826), arrived_at (20260725), material department (20260729).
 */
function lineSelect(options: {
  excelItem: boolean;
  arrived: boolean;
  department: boolean;
}) {
  return [
    LINE_BASE_COLUMNS,
    options.excelItem ? "item_code, item_name" : null,
    options.arrived ? "arrived_at" : null,
    options.department ? MATERIAL_SELECT_WITH_DEPT : MATERIAL_SELECT_WITHOUT_DEPT,
  ]
    .filter(Boolean)
    .join(", ");
}

const LINE_SELECT_ATTEMPTS = [
  { excelItem: true, arrived: true, department: true },
  { excelItem: true, arrived: true, department: false },
  { excelItem: true, arrived: false, department: true },
  { excelItem: false, arrived: true, department: true },
  { excelItem: false, arrived: true, department: false },
  { excelItem: false, arrived: false, department: true },
  { excelItem: false, arrived: false, department: false },
].map(lineSelect);

const LINE_SELECT_WITH_ARRIVED = LINE_SELECT_ATTEMPTS[0];

function isMissingArrivedAtColumn(error: { message?: string; code?: string } | null) {
  if (!error?.message) return false;
  return error.message.includes("arrived_at");
}

function isMissingDepartmentColumn(error: { message?: string; code?: string } | null) {
  if (!error?.message) return false;
  return error.message.includes("department");
}

function isMissingItemColumn(error: { message?: string; code?: string } | null) {
  if (!error?.message) return false;
  return error.message.includes("item_code") || error.message.includes("item_name");
}

function normalizeLine(row: Record<string, unknown>): PurchaseLine {
  const material = row.material;
  const normalizedMaterial = Array.isArray(material)
    ? ((material[0] ?? null) as PurchaseLine["material"])
    : ((material ?? null) as PurchaseLine["material"]);
  return {
    ...(row as unknown as PurchaseLine),
    arrived_at: (row.arrived_at as string | null | undefined) ?? null,
    item_code: (row.item_code as string | null | undefined) ?? null,
    item_name: (row.item_name as string | null | undefined) ?? null,
    material: normalizedMaterial
      ? {
          ...normalizedMaterial,
          department:
            (normalizedMaterial as { department?: string | null }).department ?? null,
        }
      : null,
  };
}

async function selectPurchaseLines(
  supabase: SupabaseClient,
  cycleId?: string
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  let lastError: string | null = null;
  for (const select of LINE_SELECT_ATTEMPTS) {
    let query = supabase.from("purchasing_lines").select(select);
    if (cycleId) query = query.eq("cycle_id", cycleId);
    const result = await query;
    if (!result.error) {
      return {
        data: (result.data ?? []) as unknown as Record<string, unknown>[],
        error: null,
      };
    }
    lastError = result.error.message;
    const canRetry =
      isMissingArrivedAtColumn(result.error) ||
      isMissingDepartmentColumn(result.error) ||
      isMissingItemColumn(result.error);
    if (!canRetry) break;
  }

  return { data: [], error: lastError };
}

export async function fetchCycles(
  supabase: SupabaseClient
): Promise<{ data: PurchaseCycle[]; error: string | null }> {
  const { data, error } = await supabase
    .from("purchasing_cycles")
    .select("id, po_number, required_date, week_label, status, import_id, created_at")
    .order("required_date", { ascending: false });

  if (error) {
    console.error("Failed to fetch purchase cycles:", error);
    return { data: [], error: error.message };
  }
  return { data: (data ?? []) as PurchaseCycle[], error: null };
}

type MasterPoDeptLine = {
  itemCode?: string;
  name?: string;
  department?: string;
};

/** Prefer MASTER PO# departments from the cycle import over material.department. */
function applyMasterPoDepartments(
  lines: PurchaseLine[],
  masterPoLines: MasterPoDeptLine[]
): PurchaseLine[] {
  if (masterPoLines.length === 0) return lines;

  const usable = masterPoLines.filter((row) => {
    const dept = (row.department ?? "").trim();
    return Boolean(dept) && dept.toUpperCase() !== "OTHER";
  });
  if (usable.length === 0) return lines;

  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const row of usable) {
    const dept = (row.department ?? "").trim();
    if (row.itemCode) byCode.set(row.itemCode.toUpperCase(), dept);
    if (row.name) byName.set(normalizeIngredientName(row.name), dept);
  }

  return lines.map((line) => {
    const material = line.material;
    if (!material) return line;
    const fromSnap =
      byCode.get(material.item_code.toUpperCase()) ??
      byCode.get((line.item_code ?? "").toUpperCase()) ??
      byName.get(normalizeIngredientName(material.name)) ??
      usable.find(
        (row) =>
          row.name && ingredientMatchesMaterial(row.name, material.name)
      )?.department;
    if (!fromSnap) return line;
    const current = (material.department ?? "").trim().toUpperCase();
    if (current === fromSnap.toUpperCase()) return line;
    return {
      ...line,
      material: { ...material, department: fromSnap },
    };
  });
}

export async function fetchCycleWithLines(
  supabase: SupabaseClient,
  cycleId: string
): Promise<{ cycle: PurchaseCycle | null; lines: PurchaseLine[]; error: string | null }> {
  const cycleRes = await supabase
    .from("purchasing_cycles")
    .select("id, po_number, required_date, week_label, status, import_id, created_at")
    .eq("id", cycleId)
    .single();

  if (cycleRes.error) {
    console.error("Failed to fetch cycle:", cycleRes.error);
    return { cycle: null, lines: [], error: cycleRes.error.message };
  }

  const cycle = cycleRes.data as PurchaseCycle;

  const [linesRes, importRes] = await Promise.all([
    selectPurchaseLines(supabase, cycleId),
    cycle.import_id
      ? supabase
          .from("purchasing_master_imports")
          .select("stats")
          .eq("id", cycle.import_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (linesRes.error) {
    console.error("Failed to fetch cycle lines:", linesRes.error);
    return {
      cycle,
      lines: [],
      error: linesRes.error,
    };
  }

  const masterPoLines = ((importRes.data?.stats as { master_po_lines?: MasterPoDeptLine[] } | null)
    ?.master_po_lines ?? []) as MasterPoDeptLine[];

  const lines = applyMasterPoDepartments(
    linesRes.data
      .map(normalizeLine)
      .sort((a, b) => lineItemCode(a).localeCompare(lineItemCode(b))),
    masterPoLines
  );

  return { cycle, lines, error: null };
}

export async function fetchOpenLines(
  supabase: SupabaseClient
): Promise<{ data: (PurchaseLine & { cycle: PurchaseCycle | null })[]; error: string | null }> {
  const cycleJoin =
    "cycle:purchasing_cycles!purchasing_lines_cycle_id_fkey ( id, po_number, required_date, week_label, status, import_id, created_at )";

  let rows: Record<string, unknown>[] = [];
  let lastError: string | null = null;
  let loaded = false;

  for (const select of LINE_SELECT_ATTEMPTS) {
    const result = await supabase
      .from("purchasing_lines")
      .select(`${select}, ${cycleJoin}`)
      .gt("required_to_order", 0);

    if (!result.error) {
      rows = (result.data ?? []) as unknown as Record<string, unknown>[];
      loaded = true;
      break;
    }

    lastError = result.error.message;
    const canRetry =
      isMissingArrivedAtColumn(result.error) ||
      isMissingDepartmentColumn(result.error) ||
      isMissingItemColumn(result.error);
    if (!canRetry) break;
  }

  if (!loaded) {
    console.error("Failed to fetch open lines:", lastError);
    return { data: [], error: lastError };
  }

  const lines = rows.map((row) => {
    const line = normalizeLine(row) as PurchaseLine & { cycle: PurchaseCycle | null };
    const cycle = (row as { cycle?: PurchaseCycle | PurchaseCycle[] | null }).cycle;
    line.cycle = Array.isArray(cycle) ? (cycle[0] ?? null) : (cycle ?? null);
    return line;
  });

  return {
    data: lines.filter((line) => line.cycle?.status === "in_progress"),
    error: null,
  };
}

export async function fetchLatestImport(supabase: SupabaseClient): Promise<{
  data: {
    id: string;
    file_name: string;
    created_at: string;
    stats: Record<string, unknown> | null;
  } | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("purchasing_master_imports")
    .select("id, file_name, created_at, stats")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch latest import:", error);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

export type SchedulePlanEntry = {
  wip_code: string;
  schedule_date: string;
  quantity: number;
  uom: string | null;
  recipe_name: string | null;
  department: string | null;
};

export type SchedulePlan = {
  importId: string;
  fileName: string;
  createdAt: string;
  dates: string[];
  rows: {
    wipCode: string;
    recipeName: string;
    department: string;
    uom: string | null;
    quantities: Record<string, number>;
    total: number;
  }[];
  entryCount: number;
};

export async function fetchImportSchedulePlan(
  supabase: SupabaseClient,
  importId: string
): Promise<{ data: SchedulePlan | null; error: string | null }> {
  const [importRes, entriesRes] = await Promise.all([
    supabase
      .from("purchasing_master_imports")
      .select("id, file_name, created_at")
      .eq("id", importId)
      .single(),
    supabase
      .from("purchasing_schedule_entries")
      .select(
        "wip_code, schedule_date, quantity, uom, department, recipe_name, recipe:purchasing_recipes ( name, department )"
      )
      .eq("import_id", importId)
      .order("schedule_date", { ascending: true }),
  ]);

  if (importRes.error) {
    console.error("Failed to fetch import:", importRes.error);
    return { data: null, error: importRes.error.message };
  }
  if (entriesRes.error) {
    // Older DBs may not have department/recipe_name yet — fall back.
    if (
      typeof entriesRes.error.message === "string" &&
      (entriesRes.error.message.includes("department") ||
        entriesRes.error.message.includes("recipe_name"))
    ) {
      const fallback = await supabase
        .from("purchasing_schedule_entries")
        .select(
          "wip_code, schedule_date, quantity, uom, recipe:purchasing_recipes ( name, department )"
        )
        .eq("import_id", importId)
        .order("schedule_date", { ascending: true });
      if (fallback.error) {
        console.error("Failed to fetch schedule entries:", fallback.error);
        return { data: null, error: fallback.error.message };
      }
      return buildSchedulePlan(importRes.data, fallback.data ?? [], false);
    }
    console.error("Failed to fetch schedule entries:", entriesRes.error);
    return { data: null, error: entriesRes.error.message };
  }

  return buildSchedulePlan(importRes.data, entriesRes.data ?? [], true);
}

function buildSchedulePlan(
  importRow: { id: string; file_name: string; created_at: string },
  rawEntries: unknown[],
  hasScheduleLabels: boolean
): { data: SchedulePlan; error: null } {
  const entries = rawEntries as Array<{
    wip_code: string;
    schedule_date: string;
    quantity: number;
    uom: string | null;
    department?: string | null;
    recipe_name?: string | null;
    recipe:
      | { name: string; department: string | null }
      | { name: string; department: string | null }[]
      | null;
  }>;

  const dateSet = new Set<string>();
  const byKey = new Map<
    string,
    {
      wipCode: string;
      recipeName: string;
      department: string;
      uom: string | null;
      quantities: Record<string, number>;
      total: number;
    }
  >();

  for (const entry of entries) {
    dateSet.add(entry.schedule_date);
    const recipe = Array.isArray(entry.recipe)
      ? entry.recipe[0] ?? null
      : entry.recipe;

    const department = (
      (hasScheduleLabels ? entry.department : null) ||
      recipe?.department ||
      ""
    ).trim();
    const recipeName = (
      (hasScheduleLabels ? entry.recipe_name : null) ||
      recipe?.name ||
      entry.wip_code
    ).trim();

    // Prefer schedule department so Finished / Kitchen AM stay distinct.
    const key = `${department.toUpperCase()}::${entry.wip_code}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        wipCode: entry.wip_code,
        recipeName,
        department,
        uom: entry.uom,
        quantities: {},
        total: 0,
      };
      byKey.set(key, row);
    }
    row.quantities[entry.schedule_date] =
      (row.quantities[entry.schedule_date] ?? 0) + Number(entry.quantity);
    row.total += Number(entry.quantity);
  }

  const dates = [...dateSet].sort();
  const rows = [...byKey.values()].sort((a, b) => {
    const dept = a.department.localeCompare(b.department);
    if (dept !== 0) return dept;
    return a.wipCode.localeCompare(b.wipCode);
  });

  return {
    data: {
      importId: importRow.id,
      fileName: importRow.file_name,
      createdAt: importRow.created_at,
      dates,
      rows,
      entryCount: entries.length,
    },
    error: null,
  };
}

export type LiveSchedulePlan = {
  fromDate: string;
  toDate: string;
  dates: string[];
  rows: SchedulePlan["rows"];
  entryCount: number;
};

/**
 * The live production schedule for a Master PO's window - what is actually
 * committed to the floor across every line, not an Excel import snapshot.
 * Same shape as the legacy import-based plan so PurchasingPlanDialog can show
 * either without knowing which one it got.
 */
export async function fetchLiveSchedulePlan(
  supabase: SupabaseClient,
  range: { fromDate: string; toDate: string }
): Promise<{ data: LiveSchedulePlan | null; error: string | null }> {
  const { data: liveSchedules, error: scheduleError } = await supabase
    .from("production_schedules")
    .select("id")
    .eq("status", "live");
  if (scheduleError) return { data: null, error: scheduleError.message };

  const scheduleIds = (liveSchedules ?? []).map((row) => row.id as string);
  const empty: LiveSchedulePlan = {
    fromDate: range.fromDate,
    toDate: range.toDate,
    dates: [],
    rows: [],
    entryCount: 0,
  };
  if (scheduleIds.length === 0) return { data: empty, error: null };

  const { data: entryRows, error: entriesError } = await supabase
    .from("production_schedule_entries")
    .select(
      "recipe_id, production_date, quantity, recipe:purchasing_recipes ( wip_code, name, department, uom )"
    )
    .in("schedule_id", scheduleIds)
    .gte("production_date", range.fromDate)
    .lte("production_date", range.toDate);
  if (entriesError) return { data: null, error: entriesError.message };

  type EntryRow = {
    recipe_id: string;
    production_date: string;
    quantity: number;
    recipe:
      | { wip_code: string; name: string; department: string | null; uom: string | null }
      | { wip_code: string; name: string; department: string | null; uom: string | null }[]
      | null;
  };

  const dateSet = new Set<string>();
  const byRecipe = new Map<
    string,
    {
      wipCode: string;
      recipeName: string;
      department: string;
      uom: string | null;
      quantities: Record<string, number>;
      total: number;
    }
  >();

  let entryCount = 0;
  for (const row of (entryRows ?? []) as EntryRow[]) {
    if (!row.quantity) continue;
    entryCount += 1;
    dateSet.add(row.production_date);
    const recipe = Array.isArray(row.recipe) ? (row.recipe[0] ?? null) : row.recipe;

    let line = byRecipe.get(row.recipe_id);
    if (!line) {
      line = {
        wipCode: recipe?.wip_code ?? row.recipe_id,
        recipeName: recipe?.name ?? row.recipe_id,
        department: (recipe?.department ?? "").trim(),
        uom: recipe?.uom ?? null,
        quantities: {},
        total: 0,
      };
      byRecipe.set(row.recipe_id, line);
    }
    line.quantities[row.production_date] =
      (line.quantities[row.production_date] ?? 0) + Number(row.quantity);
    line.total += Number(row.quantity);
  }

  const dates = [...dateSet].sort();
  const rows = [...byRecipe.values()].sort((a, b) => {
    const dept = a.department.localeCompare(b.department);
    if (dept !== 0) return dept;
    return a.wipCode.localeCompare(b.wipCode);
  });

  return { data: { fromDate: range.fromDate, toDate: range.toDate, dates, rows, entryCount }, error: null };
}
