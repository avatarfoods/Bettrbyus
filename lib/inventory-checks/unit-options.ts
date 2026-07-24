export const INVENTORY_CHECK_UNIT_OPTIONS = [
  { value: "", label: "None" },
  { value: "LBS", label: "LBS" },
  { value: "UNIT", label: "UNIT" },
] as const;

export type InventoryCheckUnitValue =
  (typeof INVENTORY_CHECK_UNIT_OPTIONS)[number]["value"];

export function getInventoryCheckUnitOptions(currentUnit?: string | null): Array<{
  value: string;
  label: string;
}> {
  const options: Array<{ value: string; label: string }> = [
    ...INVENTORY_CHECK_UNIT_OPTIONS,
  ];
  const normalized = currentUnit?.trim();

  if (
    normalized &&
    !options.some((option) => option.value === normalized)
  ) {
    options.push({ value: normalized, label: normalized });
  }

  return options;
}

export function normalizeInventoryCheckUnit(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
