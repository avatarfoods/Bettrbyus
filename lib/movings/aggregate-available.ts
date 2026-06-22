import { getMovingItem, type MovingItemSummary, type MovingRecord } from "@/lib/movings/types";

export type ItemAvailableTotal = {
  itemId: string;
  code: string | null;
  itemName: string | null;
  totalAmount: number;
  lotCount: number;
};

export function aggregateAvailableByItem(
  movings: Pick<MovingRecord, "amount" | "items">[]
): ItemAvailableTotal[] {
  const map = new Map<string, ItemAvailableTotal>();

  for (const moving of movings) {
    const item = getMovingItem(moving);
    if (!item) continue;

    const amount = Number(moving.amount) || 0;
    const existing = map.get(item.id);

    if (existing) {
      existing.totalAmount += amount;
      existing.lotCount += 1;
      continue;
    }

    map.set(item.id, {
      itemId: item.id,
      code: item.code,
      itemName: item.item_name,
      totalAmount: amount,
      lotCount: 1,
    });
  }

  return [...map.values()].sort((a, b) =>
    formatItemLabel(a).localeCompare(formatItemLabel(b))
  );
}

export function formatItemLabel(
  item: Pick<ItemAvailableTotal, "code" | "itemName"> | MovingItemSummary
): string {
  const code = "code" in item ? item.code : null;
  const name = "itemName" in item ? item.itemName : item.item_name;
  return `${code ?? "—"} – ${name ?? "Unnamed"}`;
}
