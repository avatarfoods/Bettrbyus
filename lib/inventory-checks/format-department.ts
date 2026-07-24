const DEPARTMENT_LABELS: Record<string, string> = {
  main_kitchen_am: "Main Kitchen AM",
  main_kitchen_pm: "Main Kitchen PM",
  fresh_mixing: "Fresh Mixing",
  produce: "Produce",
  garde_manger: "Garde Manger",
  assembly: "Assembly",
  finish_product: "Finished Product",
};

export function formatDepartmentName(name: string): string {
  return (
    DEPARTMENT_LABELS[name] ??
    name
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function computeVariance(
  actual: number | null | undefined,
  par: number | null | undefined
): number | null {
  if (actual == null || par == null) return null;
  return actual - par;
}

export function formatQuantity(value: number | null | undefined): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : String(value);
}
