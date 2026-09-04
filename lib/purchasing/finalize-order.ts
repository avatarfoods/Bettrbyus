import {
  lineItemCode,
  lineItemName,
  type LineStatus,
  type PurchaseCycle,
  type PurchaseLine,
} from "@/lib/purchasing/fetch-cycles";
import {
  PURCHASING_CATEGORIES,
  PURCHASING_CATEGORY_LABELS,
} from "@/lib/validations/purchasing-material";

export type GroupTracking = {
  status: LineStatus;
  notes: string | null;
};

export type GroupTrackingMap = Record<string, GroupTracking>;

export type FinalOrderLineSnapshot = {
  itemCode: string;
  name: string;
  category: string;
  casesRequired: number;
  onHandCases: number | null;
  requiredToOrder: number;
  lbsRequired: number | null;
  isEmergency: boolean;
  /** When the buyer must place the order (arrival date minus lead/thaw time). */
  orderByDate: string | null;
};

export type FinalOrderGroup = {
  key: string;
  label: string;
  status: LineStatus;
  notes: string | null;
  lines: FinalOrderLineSnapshot[];
  /** Soonest orderByDate across the group's lines, for the group header. */
  earliestOrderBy: string | null;
};

export type FinalOrderSnapshot = {
  cycleId: string;
  orderNumber: string;
  requiredDate: string;
  productionWeek: string | null;
  finalizedAt: string;
  groups: FinalOrderGroup[];
  totals: {
    lineCount: number;
    casesToOrder: number;
  };
};

const TRACKING_KEY = "purchasing-group-tracking";
const ORDERS_KEY = "purchasing-final-orders";

/** Stable group key from stored Odoo category path (or Other). */
export function odooCategoryKey(category: string | null | undefined): string {
  const raw = (category ?? "").trim();
  return raw || "OTHER";
}

/** Short label for headers — last segment of "All / Expenses / 50105 Dairy…". */
export function odooCategoryLabel(key: string): string {
  if (!key || key === "OTHER") return "Other / uncategorized";
  const parts = key
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? key;
}

/** @deprecated Prefer odooCategoryKey — kept for older local snapshots. */
export function itemCodeCategory(itemCode: string | null | undefined): string {
  const raw = (itemCode ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(0, 2);
  if (raw.length >= 2) return raw.slice(0, 2).toUpperCase();
  return raw ? raw.toUpperCase() : "OTHER";
}

/** @deprecated Prefer odooCategoryLabel. */
export function categoryLabel(key: string): string {
  if (key === "OTHER") return "Other / uncategorized";
  if (key.includes("/")) return odooCategoryLabel(key);
  if (/^\d{2}$/.test(key)) return `${key}xxx`;
  return odooCategoryLabel(key);
}

const UNCATEGORIZED_KEY = "UNCATEGORIZED";

/** Fixed buyer-friendly order: named categories first, untagged last. */
const CATEGORY_ORDER = [...PURCHASING_CATEGORIES, UNCATEGORIZED_KEY];

/**
 * Group buy lines by the admin-tagged purchasing_category
 * (Produce / Protein / Dairy & Refrigerated / Dry Goods / Packaging),
 * not the Odoo-synced odoo_category. Untagged materials land in their own
 * "Uncategorized" bucket rather than being silently merged elsewhere, so
 * gaps in tagging are visible on every finalized order.
 */
export function groupLinesByPurchasingCategory(lines: PurchaseLine[]) {
  const buckets = new Map<string, PurchaseLine[]>();
  for (const line of lines) {
    const key = line.material?.purchasing_category ?? UNCATEGORIZED_KEY;
    const list = buckets.get(key) ?? [];
    list.push(line);
    buckets.set(key, list);
  }

  return CATEGORY_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    label:
      key === UNCATEGORIZED_KEY
        ? "Uncategorized"
        : PURCHASING_CATEGORY_LABELS[key as (typeof PURCHASING_CATEGORIES)[number]],
    lines: (buckets.get(key) ?? []).sort((a, b) =>
      lineItemCode(a).localeCompare(lineItemCode(b))
    ),
  }));
}

/**
 * Group buy lines by Odoo category on the matched material
 * (Master Fresh item id → purchasing_materials.item_code → odoo_category).
 * @deprecated Prefer groupLinesByPurchasingCategory — kept for old snapshots.
 */
export function groupLinesByItemCategory(lines: PurchaseLine[]) {
  const buckets = new Map<string, PurchaseLine[]>();
  for (const line of lines) {
    const key = odooCategoryKey(line.material?.odoo_category);
    const list = buckets.get(key) ?? [];
    list.push(line);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .map(([key, deptLines]) => ({
      key,
      label: odooCategoryLabel(key),
      lines: deptLines.sort((a, b) =>
        lineItemCode(a).localeCompare(lineItemCode(b))
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function formatOrderNumber(poNumber: number | null, requiredDate: string) {
  const ymd = requiredDate.replace(/-/g, "");
  const seq =
    poNumber != null && Number.isFinite(poNumber)
      ? String(poNumber).padStart(4, "0")
      : "0000";
  return `PO-${ymd}-${seq}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export function loadGroupTracking(cycleId: string): GroupTrackingMap {
  const all = readJson<Record<string, GroupTrackingMap>>(TRACKING_KEY, {});
  return all[cycleId] ?? {};
}

export function saveGroupTracking(
  cycleId: string,
  tracking: GroupTrackingMap
): void {
  const all = readJson<Record<string, GroupTrackingMap>>(TRACKING_KEY, {});
  all[cycleId] = tracking;
  writeJson(TRACKING_KEY, all);
}

export function loadFinalOrder(cycleId: string): FinalOrderSnapshot | null {
  const all = readJson<Record<string, FinalOrderSnapshot>>(ORDERS_KEY, {});
  return all[cycleId] ?? null;
}

export function saveFinalOrder(snapshot: FinalOrderSnapshot): void {
  const all = readJson<Record<string, FinalOrderSnapshot>>(ORDERS_KEY, {});
  all[snapshot.cycleId] = snapshot;
  writeJson(ORDERS_KEY, all);
}

export function clearFinalOrderLocal(cycleId: string): void {
  const all = readJson<Record<string, FinalOrderSnapshot>>(ORDERS_KEY, {});
  delete all[cycleId];
  writeJson(ORDERS_KEY, all);
}

export function listFinalOrders(): FinalOrderSnapshot[] {
  const all = readJson<Record<string, FinalOrderSnapshot>>(ORDERS_KEY, {});
  return Object.values(all).sort((a, b) =>
    b.finalizedAt.localeCompare(a.finalizedAt)
  );
}

/*
  A stable snapshot of the list above.

  useSyncExternalStore compares snapshots by identity, so handing it
  listFinalOrders directly would return a fresh array on every read and never
  stop re-rendering. The cache is keyed on the raw stored text: if the storage
  has not changed, the same array comes back.
*/
let ordersRaw: string | null = null;
let ordersSnapshot: FinalOrderSnapshot[] = [];

export function finalOrdersSnapshot(): FinalOrderSnapshot[] {
  if (typeof window === "undefined") return ordersSnapshot;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ORDERS_KEY);
  } catch {
    // Storage the browser refuses. An empty list is the honest answer.
    return ordersSnapshot;
  }
  if (raw !== ordersRaw) {
    ordersRaw = raw;
    ordersSnapshot = listFinalOrders();
  }
  return ordersSnapshot;
}

export const GROUP_STATUS_OPTIONS: {
  value: LineStatus;
  label: string;
}[] = [
  { value: "to_order", label: "To order" },
  { value: "ordered", label: "Ordered" },
  { value: "arrived", label: "Arrived" },
  { value: "skipped", label: "Skipped" },
];

export function groupStatusLabel(status: LineStatus): string {
  return (
    GROUP_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

/** Snapshot containing only one category group (for per-group print / Excel). */
export function sliceFinalOrderToGroup(
  snapshot: FinalOrderSnapshot,
  groupKey: string
): FinalOrderSnapshot | null {
  const group = snapshot.groups.find((entry) => entry.key === groupKey);
  if (!group) return null;

  const casesToOrder = group.lines.reduce(
    (sum, line) => sum + line.requiredToOrder,
    0
  );

  return {
    ...snapshot,
    orderNumber: `${snapshot.orderNumber}-${group.label}`,
    groups: [group],
    totals: {
      lineCount: group.lines.length,
      casesToOrder,
    },
  };
}

export function updateFinalOrderGroupStatus(
  snapshot: FinalOrderSnapshot,
  groupKey: string,
  status: LineStatus
): FinalOrderSnapshot {
  const next: FinalOrderSnapshot = {
    ...snapshot,
    groups: snapshot.groups.map((group) =>
      group.key === groupKey ? { ...group, status } : group
    ),
  };
  saveFinalOrder(next);

  const tracking = loadGroupTracking(snapshot.cycleId);
  const prev = tracking[groupKey];
  tracking[groupKey] = {
    status,
    notes: prev?.notes ?? null,
  };
  saveGroupTracking(snapshot.cycleId, tracking);

  return next;
}

export function buildFinalOrderSnapshot(input: {
  cycle: PurchaseCycle;
  lines: PurchaseLine[];
  tracking: GroupTrackingMap;
}):
  | { ok: true; snapshot: FinalOrderSnapshot; warning: string | null }
  | { ok: false; message: string } {
  const orderLines = input.lines.filter(
    (line) => line.is_emergency || line.required_to_order > 0
  );
  if (orderLines.length === 0) {
    return {
      ok: false,
      message: "Nothing to order — no lines with Req. to order > 0.",
    };
  }

  const sections = groupLinesByPurchasingCategory(orderLines);
  const groups: FinalOrderGroup[] = sections.map((section) => {
    const meta = input.tracking[section.key];
    const lines = section.lines.map((line) => ({
      itemCode: lineItemCode(line),
      name: lineItemName(line),
      category: section.key,
      casesRequired: line.cases_required,
      onHandCases: line.on_hand_cases,
      requiredToOrder: line.required_to_order,
      lbsRequired: line.lbs_required,
      isEmergency: line.is_emergency,
      orderByDate: line.order_by_date,
    }));
    const orderByDates = lines
      .map((line) => line.orderByDate)
      .filter((value): value is string => value != null)
      .sort();
    return {
      key: section.key,
      label: section.label,
      status: meta?.status ?? "to_order",
      notes: meta?.notes ?? null,
      lines,
      earliestOrderBy: orderByDates[0] ?? null,
    };
  });

  const all = groups.flatMap((group) => group.lines);
  const finalizedAt = new Date().toISOString();
  const snapshot: FinalOrderSnapshot = {
    cycleId: input.cycle.id,
    orderNumber: formatOrderNumber(
      input.cycle.po_number,
      input.cycle.required_date
    ),
    requiredDate: input.cycle.required_date,
    productionWeek: input.cycle.week_label,
    finalizedAt,
    groups,
    totals: {
      lineCount: all.length,
      casesToOrder: all.reduce((sum, line) => sum + line.requiredToOrder, 0),
    },
  };

  const uncategorized = groups.find((group) => group.key === UNCATEGORIZED_KEY);
  const warning = uncategorized
    ? `${uncategorized.lines.length} material(s) have no buy category set, grouped under Uncategorized. Tag them on Purchasing → Materials.`
    : null;

  return { ok: true, snapshot, warning };
}
