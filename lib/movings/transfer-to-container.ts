import type { SupabaseClient } from "@supabase/supabase-js";
import { movingTransferSchema } from "@/lib/validations/moving-transfer";
import {
  getMovingItem,
  type MovingItemSummary,
  type MovingRecord,
} from "@/lib/movings/types";
import { itemRequiresStorageType } from "@/lib/movings/storage-type-items";
import { MOVING_IN_STATUS } from "@/lib/movings/status";

export const TRANSFER_ERROR_MESSAGE =
  "Could not move this lot to a container. Please try again or contact your manager.";

export const TRANSFER_AMOUNT_EXCEEDS_MESSAGE =
  "Transfer amount cannot exceed the amount in the original case.";

const AMOUNT_EPSILON = 0.001;

type TransferableMoving = {
  id: string;
  amount: number;
  storage_type: string | null;
  moved_at: string | null;
  po_number: string;
  item_id: string | null;
  prep_date: string | null;
  best_by: string | null;
  lot_number: string | null;
  direction: string | null;
  started_by: string | null;
  items:
    | { id: string }
    | { id: string }[]
    | MovingItemSummary
    | MovingItemSummary[]
    | null;
};

export function canTransferToContainer(moving: {
  storage_type: string | null;
  items:
    | { id: string }
    | { id: string }[]
    | MovingItemSummary
    | MovingItemSummary[]
    | null;
}): boolean {
  if (moving.storage_type !== "original_case") return false;
  const item = getMovingItem(moving as Pick<MovingRecord, "items">);
  return itemRequiresStorageType(item?.id);
}

function isFullTransfer(existingAmount: number, transferAmount: number): boolean {
  return transferAmount >= existingAmount - AMOUNT_EPSILON;
}

export async function transferToContainer(
  supabase: SupabaseClient,
  movingId: string,
  amount: number
): Promise<{ success: true } | { success: false; message: string }> {
  const parsed = movingTransferSchema.safeParse({
    movingId,
    storageType: "black_container",
    amount,
  });

  if (!parsed.success) {
    return { success: false, message: TRANSFER_ERROR_MESSAGE };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, message: TRANSFER_ERROR_MESSAGE };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("movings")
    .select(
      `
      id,
      amount,
      storage_type,
      moved_at,
      po_number,
      item_id,
      prep_date,
      best_by,
      lot_number,
      direction,
      started_by,
      items ( id )
    `
    )
    .eq("id", movingId)
    .maybeSingle();

  if (fetchError || !existing || !canTransferToContainer(existing)) {
    console.error("Failed to validate transfer:", fetchError);
    return { success: false, message: TRANSFER_ERROR_MESSAGE };
  }

  const existingMoving = existing as TransferableMoving;
  const existingAmount = Number(existingMoving.amount);

  if (amount > existingAmount + AMOUNT_EPSILON) {
    return { success: false, message: TRANSFER_AMOUNT_EXCEEDS_MESSAGE };
  }

  if (isFullTransfer(existingAmount, amount)) {
    const { data, error } = await supabase
      .from("movings")
      .update({ storage_type: "black_container" })
      .eq("id", movingId)
      .eq("storage_type", "original_case")
      .is("moved_at", null)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Failed to transfer to container:", error);
      return { success: false, message: TRANSFER_ERROR_MESSAGE };
    }

    return { success: true };
  }

  const remainingAmount = existingAmount - amount;

  const { error: updateError } = await supabase
    .from("movings")
    .update({ amount: remainingAmount })
    .eq("id", movingId)
    .eq("storage_type", "original_case")
    .is("moved_at", null);

  if (updateError) {
    console.error("Failed to reduce original case amount:", updateError);
    return { success: false, message: TRANSFER_ERROR_MESSAGE };
  }

  const { error: insertError } = await supabase.from("movings").insert({
    direction: existingMoving.direction ?? "in",
    po_number: existingMoving.po_number,
    amount,
    item_id: existingMoving.item_id,
    prep_date: existingMoving.prep_date,
    best_by: existingMoving.best_by,
    lot_number: existingMoving.lot_number,
    storage_type: "black_container",
    started_by: existingMoving.started_by ?? user.id,
    created_by: user.id,
    status: MOVING_IN_STATUS,
  });

  if (insertError) {
    console.error("Failed to create container moving:", insertError);
    await supabase
      .from("movings")
      .update({ amount: existingAmount })
      .eq("id", movingId);
    return { success: false, message: TRANSFER_ERROR_MESSAGE };
  }

  return { success: true };
}
