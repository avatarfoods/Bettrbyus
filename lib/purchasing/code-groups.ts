import {
  lineItemCode,
  lineItemName,
  type PurchaseLine,
} from "@/lib/purchasing/fetch-cycles";
import { odooCategoryKey, odooCategoryLabel } from "@/lib/purchasing/finalize-order";

/**
 * Text before a trailing `-<digits>` suffix.
 *
 * `510028-2` and `510028` share the stem `510028`. Codes with no numeric
 * suffix, or the placeholder `—`, are their own stem.
 */
export function itemCodeStem(code: string): string {
  const trimmed = code.trim();
  if (!trimmed || trimmed === "—") return trimmed;
  const match = trimmed.match(/^(.+)-(\d+)$/);
  return match ? match[1] : trimmed;
}

export type CodeGroup = {
  /** Stem for real families; `__id:<lineId>` for unmatched placeholder rows. */
  key: string;
  stem: string;
  name: string;
  lines: PurchaseLine[];
  categoryKey: string;
  casesRequired: number;
  onHand: number | null;
  requiredToOrder: number;
  lbsRequired: number | null;
  mixedPack: boolean;
  mixedUom: boolean;
  packSizes: number[];
  isEmergency: boolean;
  hasToOrder: boolean;
  isProtein: boolean;
};

export type CodeGroupSection = {
  key: string;
  label: string;
  groups: CodeGroup[];
};

function lbsPerCase(line: PurchaseLine): number | null {
  const value = line.material?.lbs_per_case;
  if (value == null || value <= 0) return null;
  return value;
}

/** No pack size, but demand was stored — packaging / each, not pounds. */
function isUnitLine(line: PurchaseLine): boolean {
  return lbsPerCase(line) === null && line.lbs_required != null;
}

function isWeightLine(line: PurchaseLine): boolean {
  return lbsPerCase(line) !== null;
}

/**
 * Pounds this SKU contributes to a parent total.
 *
 * Prefer the stored `lbs_required`. Fall back to cases × lbs/case. Unit
 * lines (no pack size) stay out of the pounds sum.
 */
function childLbs(line: PurchaseLine): number | null {
  if (isUnitLine(line)) return null;
  if (line.lbs_required != null) return line.lbs_required;
  const pack = lbsPerCase(line);
  if (pack != null) return line.cases_required * pack;
  return null;
}

export function mixedPackLabel(packSizes: number[]): string {
  if (packSizes.length === 0) return "Mixed pack sizes";
  const parts = packSizes.map((size) => `${size} lb`);
  if (parts.length === 2) {
    return `Mixed pack: ${parts[0]} and ${parts[1]} cases`;
  }
  return `Mixed pack: ${parts.join(", ")} cases`;
}

export function aggregateCodeGroup(
  lines: PurchaseLine[]
): Omit<CodeGroup, "key" | "categoryKey"> {
  const sorted = [...lines].sort((a, b) =>
    lineItemCode(a).localeCompare(lineItemCode(b), undefined, { numeric: true })
  );
  const first = sorted[0];
  const stem = first ? itemCodeStem(lineItemCode(first)) : "";
  const unsuffixed = sorted.find((line) => lineItemCode(line) === stem);
  const name = unsuffixed
    ? lineItemName(unsuffixed)
    : first
      ? lineItemName(first)
      : "Unknown";

  const packSizes = [
    ...new Set(sorted.map(lbsPerCase).filter((value): value is number => value != null)),
  ].sort((a, b) => a - b);

  let lbsSum = 0;
  let lbsAny = false;
  for (const line of sorted) {
    const lbs = childLbs(line);
    if (lbs == null) continue;
    lbsAny = true;
    lbsSum += lbs;
  }

  let onHandSum = 0;
  let onHandAny = false;
  for (const line of sorted) {
    if (line.on_hand_cases == null) continue;
    onHandAny = true;
    onHandSum += line.on_hand_cases;
  }

  return {
    stem,
    name,
    lines: sorted,
    casesRequired: sorted.reduce((sum, line) => sum + line.cases_required, 0),
    onHand: onHandAny ? onHandSum : null,
    requiredToOrder: sorted.reduce((sum, line) => sum + line.required_to_order, 0),
    lbsRequired: lbsAny ? lbsSum : null,
    mixedPack: packSizes.length > 1,
    mixedUom: sorted.some(isWeightLine) && sorted.some(isUnitLine),
    packSizes,
    isEmergency: sorted.some((line) => line.is_emergency),
    hasToOrder: sorted.some((line) => line.required_to_order > 0),
    isProtein: sorted.some((line) => Boolean(line.material?.is_protein)),
  };
}

function categoryForGroup(lines: PurchaseLine[], stem: string): string {
  const unsuffixed = lines.find((line) => lineItemCode(line) === stem);
  const source = unsuffixed ?? lines[0];
  return odooCategoryKey(source?.material?.odoo_category);
}

/**
 * Families of dash-suffixed SKUs, plus every unmatched row as its own group.
 * A family is only collapsible when `lines.length >= 2`.
 */
export function groupLinesByCodeStem(lines: PurchaseLine[]): CodeGroup[] {
  const buckets = new Map<string, PurchaseLine[]>();
  const placeholders: PurchaseLine[] = [];

  for (const line of lines) {
    const code = lineItemCode(line);
    if (!code || code === "—") {
      placeholders.push(line);
      continue;
    }
    const stem = itemCodeStem(code);
    const list = buckets.get(stem) ?? [];
    list.push(line);
    buckets.set(stem, list);
  }

  const groups: CodeGroup[] = [];

  for (const [stem, members] of buckets) {
    const agg = aggregateCodeGroup(members);
    groups.push({
      ...agg,
      key: stem,
      categoryKey: categoryForGroup(members, stem),
    });
  }

  for (const line of placeholders) {
    const agg = aggregateCodeGroup([line]);
    groups.push({
      ...agg,
      key: `__id:${line.id}`,
      categoryKey: odooCategoryKey(line.material?.odoo_category),
    });
  }

  return groups;
}

/** Same Odoo-category sections as the flat matrix, but families stay together. */
export function groupCodeGroupsByCategory(groups: CodeGroup[]): CodeGroupSection[] {
  const buckets = new Map<string, CodeGroup[]>();
  for (const group of groups) {
    const list = buckets.get(group.categoryKey) ?? [];
    list.push(group);
    buckets.set(group.categoryKey, list);
  }

  return [...buckets.entries()]
    .map(([key, members]) => ({
      key,
      label: odooCategoryLabel(key),
      groups: members.sort((a, b) =>
        a.stem.localeCompare(b.stem, undefined, { numeric: true })
      ),
    }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true })
    );
}

/**
 * Stems whose children (not the unsuffixed code itself) match the query.
 * Used to auto-expand a family when the buyer searched for a variant.
 */
export function stemsMatchingChildQuery(
  groups: CodeGroup[],
  query: string
): Set<string> {
  const needle = query.trim().toLowerCase();
  const stems = new Set<string>();
  if (!needle) return stems;

  for (const group of groups) {
    if (group.lines.length < 2) continue;
    const childHit = group.lines.some((line) => {
      const code = lineItemCode(line);
      if (code === group.stem) return false;
      return (
        code.toLowerCase().includes(needle) ||
        lineItemName(line).toLowerCase().includes(needle)
      );
    });
    if (childHit) stems.add(group.key);
  }
  return stems;
}
