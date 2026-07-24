import { formatDepartmentName } from "@/lib/inventory-checks/format-department";
import {
  getInventoryCheckItemDepartment,
  type DepartmentSummary,
  type InventoryCheckItem,
} from "@/lib/inventory-checks/types";

export function attachDepartmentsToItems(
  items: InventoryCheckItem[],
  departments: DepartmentSummary[]
): InventoryCheckItem[] {
  if (departments.length === 0) return items;

  const byId = new Map(
    departments.map((department) => [department.id, department])
  );

  return items.map((item) => {
    const resolved =
      byId.get(item.department_id) ?? getInventoryCheckItemDepartment(item);
    if (!resolved) return item;
    return { ...item, departments: resolved };
  });
}

export function resolveItemDepartment(
  item: Pick<InventoryCheckItem, "department_id" | "departments">,
  departments?: DepartmentSummary[]
): DepartmentSummary | null {
  const fromJoin = getInventoryCheckItemDepartment(item);
  if (fromJoin?.name) return fromJoin;
  return (
    departments?.find((department) => department.id === item.department_id) ??
    null
  );
}

export function resolveItemDepartmentName(
  item: Pick<InventoryCheckItem, "department_id" | "departments">,
  departments?: DepartmentSummary[]
): string {
  const department = resolveItemDepartment(item, departments);
  return department?.name ? formatDepartmentName(department.name) : "";
}
