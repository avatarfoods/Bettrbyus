import type { LineStatus, PurchaseCycle, PurchaseLine } from "@/lib/purchasing/fetch-cycles";

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
};

export type FinalOrderGroup = {
  key: string;
  label: string;
  status: LineStatus;
  notes: string | null;
  lines: FinalOrderLineSnapshot[];
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

/** First two digits of the item code → category (220133 → "22"). */
export function itemCodeCategory(itemCode: string | null | undefined): string {
  const raw = (itemCode ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(0, 2);
  if (raw.length >= 2) return raw.slice(0, 2).toUpperCase();
  return raw ? raw.toUpperCase() : "OTHER";
}

export function categoryLabel(key: string): string {
  if (key === "OTHER") return "Other";
  return `${key}xxx`;
}

export function groupLinesByItemCategory(lines: PurchaseLine[]) {
  const buckets = new Map<string, PurchaseLine[]>();
  for (const line of lines) {
    const key = itemCodeCategory(line.material?.item_code);
    const list = buckets.get(key) ?? [];
    list.push(line);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([key, deptLines]) => ({
      key,
      label: categoryLabel(key),
      lines: deptLines.sort((a, b) =>
        (a.material?.item_code ?? "").localeCompare(b.material?.item_code ?? "")
      ),
    }));
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
}): { ok: true; snapshot: FinalOrderSnapshot } | { ok: false; message: string } {
  const orderLines = input.lines.filter(
    (line) => line.is_emergency || line.required_to_order > 0
  );
  if (orderLines.length === 0) {
    return {
      ok: false,
      message: "Nothing to order — no lines with Req. to order > 0.",
    };
  }

  const sections = groupLinesByItemCategory(orderLines);
  const groups: FinalOrderGroup[] = sections.map((section) => {
    const meta = input.tracking[section.key];
    return {
      key: section.key,
      label: section.label,
      status: meta?.status ?? "to_order",
      notes: meta?.notes ?? null,
      lines: section.lines.map((line) => ({
        itemCode: line.material?.item_code ?? "—",
        name: line.material?.name ?? "Unknown",
        category: section.key,
        casesRequired: line.cases_required,
        onHandCases: line.on_hand_cases,
        requiredToOrder: line.required_to_order,
        lbsRequired: line.lbs_required,
        isEmergency: line.is_emergency,
      })),
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

  return { ok: true, snapshot };
}
