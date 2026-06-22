import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovingRecord } from "@/lib/movings/types";

export async function fetchMovingsForOut(
  supabase: SupabaseClient
): Promise<{ data: MovingRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from("movings")
    .select(
      `
      id,
      po_number,
      amount,
      prep_date,
      best_by,
      lot_number,
      storage_type,
      status,
      thawing_status,
      created_at,
      items ( id, code, item_name, thaw_range_days )
    `
    )
    .eq("direction", "in")
    .is("moved_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data as MovingRecord[]) ?? [], error: null };
}
