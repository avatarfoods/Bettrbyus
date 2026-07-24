import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getProfileDisplayName,
  getProfileSummary,
  type InventoryCheckHistoryDate,
  type InventoryCheckItem,
  type InventoryCheckRecord,
} from "@/lib/inventory-checks/types";

export async function fetchInventoryCheckHistoryDates(
  supabase: SupabaseClient,
  options?: { fromDate?: string; toDate?: string }
): Promise<{ data: InventoryCheckHistoryDate[]; error: string | null }> {
  let query = supabase
    .from("inventory_checks")
    .select(
      `
      check_date,
      department_id,
      checker:profiles!inventory_checks_checked_by_fkey (
        id,
        full_name,
        email
      ),
      inventory_check_entries ( id )
    `
    )
    .order("check_date", { ascending: false });

  if (options?.fromDate) {
    query = query.gte("check_date", options.fromDate);
  }
  if (options?.toDate) {
    query = query.lte("check_date", options.toDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch inventory check history:", error);
    return { data: [], error: error.message };
  }

  const byDate = new Map<string, InventoryCheckHistoryDate>();

  for (const row of data ?? []) {
    const date = row.check_date as string;
    const existing = byDate.get(date) ?? {
      checkDate: date,
      departmentsCompleted: 0,
      checkerNames: [],
      entryCount: 0,
    };

    existing.departmentsCompleted += 1;
    existing.entryCount += Array.isArray(row.inventory_check_entries)
      ? row.inventory_check_entries.length
      : 0;

    const checkerName = getProfileDisplayName(
      row.checker as InventoryCheckRecord["checker"]
    );
    if (!existing.checkerNames.includes(checkerName)) {
      existing.checkerNames.push(checkerName);
    }

    byDate.set(date, existing);
  }

  return {
    data: [...byDate.values()].sort((a, b) =>
      b.checkDate.localeCompare(a.checkDate)
    ),
    error: null,
  };
}

export async function fetchInventoryCheckDetailForDate(
  supabase: SupabaseClient,
  checkDate: string,
  departmentId?: string
): Promise<{
  items: InventoryCheckItem[];
  checks: InventoryCheckRecord[];
  error: string | null;
}> {
  const [itemsResult, checksResult] = await Promise.all([
    supabase
      .from("inventory_check_items")
      .select(
        "id, department_id, item_code, item_name, par_quantity, unit, sort_order, departments!inventory_check_items_department_id_fkey ( id, name )"
      )
      .order("sort_order", { ascending: true }),
    (() => {
      let query = supabase
        .from("inventory_checks")
        .select(
          `
          id,
          check_date,
          department_id,
          checked_by,
          created_at,
          updated_at,
          inventory_check_entries (
            id,
            inventory_check_item_id,
            actual_quantity,
            notes
          ),
          checker:profiles!inventory_checks_checked_by_fkey (
            id,
            full_name,
            email
          ),
          departments!inventory_checks_department_id_fkey ( id, name )
        `
        )
        .eq("check_date", checkDate);

      if (departmentId) {
        query = query.eq("department_id", departmentId);
      }

      return query;
    })(),
  ]);

  if (itemsResult.error) {
    console.error("Failed to fetch inventory items:", itemsResult.error);
    return { items: [], checks: [], error: itemsResult.error.message };
  }

  if (checksResult.error) {
    console.error("Failed to fetch inventory checks:", checksResult.error);
    return { items: [], checks: [], error: checksResult.error.message };
  }

  return {
    items: (itemsResult.data ?? []) as InventoryCheckItem[],
    checks: (checksResult.data ?? []) as InventoryCheckRecord[],
    error: null,
  };
}

export function buildEntryMap(checks: InventoryCheckRecord[]) {
  const map = new Map<
    string,
    { actualQuantity: number | null; notes: string | null }
  >();

  for (const check of checks) {
    for (const entry of check.inventory_check_entries ?? []) {
      map.set(entry.inventory_check_item_id, {
        actualQuantity: entry.actual_quantity,
        notes: entry.notes,
      });
    }
  }

  return map;
}

export function getCheckerNamesForDate(checks: InventoryCheckRecord[]): string[] {
  const names = new Set<string>();
  for (const check of checks) {
    names.add(getProfileDisplayName(getProfileSummary(check.checker)));
  }
  return [...names];
}
