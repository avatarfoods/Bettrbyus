export function formatStorageType(value: string | null | undefined): string {
  if (value === "original_case") return "Original case";
  if (value === "black_container") return "Black container";
  return "—";
}
