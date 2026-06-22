import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovingFormData } from "@/lib/validations/moving";
import { combineDateAndTime } from "@/lib/thaw-range";
import { MOVING_IN_STATUS, MOVING_OUT_STATUS } from "@/lib/movings/status";

export const MOVING_SUBMIT_ERROR_MESSAGE =
  "Something went wrong while saving this moving. Please contact your manager.";

export const MOVING_SUBMIT_SUCCESS_MESSAGE =
  "Moving saved successfully.";

type MovingInsert = {
  direction: "in" | "out";
  po_number: string;
  amount: number;
  item_id?: string | null;
  prep_date?: string | null;
  best_by?: string | null;
  lot_number?: string | null;
  storage_type?: string | null;
  moved_at?: string | null;
  started_by: string;
  created_by: string;
  status: string;
};

export function buildMovingInsert(
  data: MovingFormData,
  userId: string
): MovingInsert {
  const base = {
    direction: data.direction,
    po_number: data.poNumber ?? data.inPoNumber ?? "",
    amount: data.amount,
    started_by: userId,
    created_by: userId,
    status: MOVING_IN_STATUS,
  };

  if (data.direction === "in") {
    return {
      ...base,
      item_id: data.itemId ?? null,
      prep_date:
        data.prepDate && data.prepTime
          ? combineDateAndTime(data.prepDate, data.prepTime).toISOString()
          : null,
      best_by:
        data.bestByDate && data.bestByTime
          ? combineDateAndTime(data.bestByDate, data.bestByTime).toISOString()
          : null,
      lot_number: data.lotNumber ?? null,
      storage_type: data.storageType ?? null,
    };
  }

  return {
    ...base,
    moved_at:
      data.movedOutDate && data.movedOutTime
        ? combineDateAndTime(data.movedOutDate, data.movedOutTime).toISOString()
        : null,
  };
}

export async function submitMoving(
  supabase: SupabaseClient,
  data: MovingFormData
): Promise<{ success: true } | { success: false }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false };
  }

  if (data.direction === "out" && data.movingId) {
    const movedAt =
      data.movedOutDate && data.movedOutTime
        ? combineDateAndTime(data.movedOutDate, data.movedOutTime).toISOString()
        : null;

    const { error } = await supabase
      .from("movings")
      .update({
        moved_at: movedAt,
        completed_by: user.id,
        out_po_number: data.outPoNumber ?? null,
        status: MOVING_OUT_STATUS,
      })
      .eq("id", data.movingId);

    if (error) {
      console.error("Failed to complete moving out:", error);
      return { success: false };
    }

    return { success: true };
  }

  const record = buildMovingInsert(data, user.id);
  const { error } = await supabase.from("movings").insert(record);

  if (error) {
    console.error("Failed to save moving:", error);
    return { success: false };
  }

  return { success: true };
}
