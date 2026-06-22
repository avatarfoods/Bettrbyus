import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovingHistoryRecord } from "@/lib/movings/types";

const HISTORY_SELECT = `
  id,
  po_number,
  out_po_number,
  amount,
  prep_date,
  best_by,
  lot_number,
  storage_type,
  moved_at,
  created_at,
  items ( id, code, item_name ),
  starter:profiles!movings_started_by_fkey ( id, full_name, email ),
  completer:profiles!movings_completed_by_fkey ( id, full_name, email )
`;

const HISTORY_SELECT_FALLBACK = `
  id,
  po_number,
  out_po_number,
  amount,
  prep_date,
  best_by,
  lot_number,
  storage_type,
  moved_at,
  created_at,
  items ( id, code, item_name )
`;

export async function fetchMovingsHistory(
  supabase: SupabaseClient
): Promise<{ data: MovingHistoryRecord[]; error: string | null }> {
  const withProfiles = await supabase
    .from("movings")
    .select(HISTORY_SELECT)
    .not("moved_at", "is", null)
    .order("moved_at", { ascending: false });

  if (!withProfiles.error) {
    return { data: (withProfiles.data as MovingHistoryRecord[]) ?? [], error: null };
  }

  const fallback = await supabase
    .from("movings")
    .select(HISTORY_SELECT_FALLBACK)
    .not("moved_at", "is", null)
    .order("moved_at", { ascending: false });

  if (fallback.error) {
    return { data: [], error: fallback.error.message };
  }

  return {
    data: ((fallback.data as MovingHistoryRecord[]) ?? []).map((row) => ({
      ...row,
      starter: null,
      completer: null,
    })),
    error: null,
  };
}
