export type MovingItemSummary = {
  id: string;
  code: string | null;
  item_name: string | null;
  thaw_range_days?: string | null;
};

export type ProfileSummary = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type MovingRecord = {
  id: string;
  po_number: string;
  amount: number;
  prep_date: string | null;
  best_by: string | null;
  lot_number: string | null;
  storage_type: string | null;
  status: string | null;
  thawing_status: string | null;
  created_at: string;
  items: MovingItemSummary | MovingItemSummary[] | null;
};

export type MovingHistoryRecord = {
  id: string;
  po_number: string;
  out_po_number: string | null;
  amount: number;
  prep_date: string | null;
  best_by: string | null;
  lot_number: string | null;
  storage_type: string | null;
  moved_at: string | null;
  created_at: string;
  items: MovingItemSummary | MovingItemSummary[] | null;
  starter: ProfileSummary | ProfileSummary[] | null;
  completer: ProfileSummary | ProfileSummary[] | null;
};

export function getMovingItem(
  moving: Pick<MovingRecord, "items">
): MovingItemSummary | null {
  if (!moving.items) return null;
  return Array.isArray(moving.items) ? (moving.items[0] ?? null) : moving.items;
}

export function getItemThawRangeDays(
  moving: Pick<MovingRecord, "items">
): string | null {
  return getMovingItem(moving)?.thaw_range_days ?? null;
}

export function getProfileSummary(
  profile: ProfileSummary | ProfileSummary[] | null | undefined
): ProfileSummary | null {
  if (!profile) return null;
  return Array.isArray(profile) ? (profile[0] ?? null) : profile;
}

export function getProfileDisplayName(
  profile: ProfileSummary | ProfileSummary[] | null | undefined
): string {
  const value = getProfileSummary(profile);
  if (!value) return "Unknown";
  return value.full_name?.trim() || value.email || "Unknown";
}
