export const STORAGE_TYPE_ITEM_IDS = [
  "0780470a-78fa-4deb-b6e5-e057ebef5123",
  "e7b15300-8319-4d82-8920-1166d195a59b",
] as const;

export type StorageType = "original_case" | "black_container";

export function itemRequiresStorageType(itemId: string | null | undefined): boolean {
  if (!itemId) return false;
  return (STORAGE_TYPE_ITEM_IDS as readonly string[]).includes(itemId);
}
