import {
  getProfileDisplayName,
  getProfileSummary,
  type ProfileSummary,
} from "@/lib/movings/types";

export type DepartmentSummary = {
  id: string;
  name: string;
};

export type InventoryCheckItem = {
  id: string;
  department_id: string;
  item_code: string;
  item_name: string;
  par_quantity: number | null;
  unit: string | null;
  sort_order: number;
  departments: DepartmentSummary | DepartmentSummary[] | null;
};

export type InventoryCheckEntryRecord = {
  id: string;
  inventory_check_item_id: string;
  actual_quantity: number | null;
  notes: string | null;
};

export type InventoryCheckRecord = {
  id: string;
  check_date: string;
  department_id: string;
  checked_by: string;
  created_at: string;
  updated_at: string;
  inventory_check_entries: InventoryCheckEntryRecord[] | null;
  checker: ProfileSummary | ProfileSummary[] | null;
  departments: DepartmentSummary | DepartmentSummary[] | null;
};

export type InventoryCheckHistoryDate = {
  checkDate: string;
  departmentsCompleted: number;
  checkerNames: string[];
  entryCount: number;
};

export type InventoryCheckItemHistoryRecord = {
  id: string;
  checkDate: string;
  actualQuantity: number | null;
  notes: string | null;
  checker: ProfileSummary | ProfileSummary[] | null;
  checkerName: string;
};

export function getDepartmentSummary(
  department: DepartmentSummary | DepartmentSummary[] | null | undefined
): DepartmentSummary | null {
  if (!department) return null;
  return Array.isArray(department) ? (department[0] ?? null) : department;
}

export function getInventoryCheckItemDepartment(
  item: Pick<InventoryCheckItem, "departments">
): DepartmentSummary | null {
  return getDepartmentSummary(item.departments);
}

export { getProfileDisplayName, getProfileSummary };
