"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn, isMissingTable } from "@/lib/supabase/missing";
import { lotToDate } from "@/lib/production/wip/model";

/**
 * Recording a count.
 *
 * A count is an observation, so any signed-in person may make one - this is
 * floor work at four in the morning, not an admin task. Deleting one is
 * rewriting history and stays with admins.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

const WIP_PATH = "/production/wip";

function fail(message: string): ActionResult {
  return { ok: false, message };
}

export type CountLotInput = {
  recipeId: string;
  /** As written on the bucket. MMDDYYYY. */
  lotCode: string;
  containers: number;
  containerSize: number;
  /** Loose amount on top of the whole containers, in the recipe uom. */
  partialQuantity?: number;
  containerLabel?: string;
  note?: string | null;
};

/**
 * Saves the lots found for one recipe.
 *
 * Every lot is a new row rather than an update, so the history stays intact:
 * "what did we count Tuesday morning" has to remain answerable. The latest
 * row for a lot is what counts as on-hand.
 */
export async function saveWipCount(input: {
  lots: CountLotInput[];
}): Promise<ActionResult & { saved?: number }> {
  const lots = input.lots ?? [];
  if (lots.length === 0) return fail("Nothing to record");

  for (const lot of lots) {
    if (!lot.recipeId) return fail("Missing recipe");

    const code = (lot.lotCode ?? "").trim();
    if (!code) return fail("Every lot needs a lot number");
    if (lotToDate(code) === null) {
      return fail(
        `Lot "${code}" is not a date. Lots are MMDDYYYY — the day it was produced — because that is what tells the app which day the stock came from.`
      );
    }

    const partial = lot.partialQuantity ?? 0;

    if (!Number.isFinite(lot.containers) || lot.containers < 0) {
      return fail("The number of containers must be zero or more");
    }
    if (!Number.isFinite(lot.containerSize) || lot.containerSize <= 0) {
      return fail("A container has to hold more than nothing");
    }
    if (!Number.isFinite(partial) || partial < 0) {
      return fail("The part-bucket amount must be zero or more");
    }
    if (lot.containers * lot.containerSize + partial <= 0) {
      return fail("A lot with nothing in it is not a count");
    }
    if (lot.containers > 10_000 || lot.containerSize > 10_000) {
      return fail("That is larger than any real count — check the numbers");
    }
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const rows = lots.map((lot) => ({
    recipe_id: lot.recipeId,
    lot_code: lot.lotCode.trim(),
    produced_on: lotToDate(lot.lotCode.trim()),
    containers: lot.containers,
    container_size: lot.containerSize,
    partial_quantity: lot.partialQuantity ?? 0,
    container_label: (lot.containerLabel ?? "bucket").trim() || "bucket",
    note: lot.note?.trim() || null,
    counted_by: profile.id,
  }));

  let { error } = await supabase.from("wip_counts").insert(rows);

  // Part-buckets arrived with 20260901_wip_partial. Without it a count still
  // saves, minus the loose amount - and says so, rather than losing it
  // quietly or refusing the whole count.
  if (error && isMissingColumn(error)) {
    const dropped = rows.some((row) => row.partial_quantity > 0);
    const plain = rows.map((row) => {
      const copy = { ...row } as Record<string, unknown>;
      delete copy.partial_quantity;
      return copy;
    });
    ({ error } = await supabase.from("wip_counts").insert(plain));
    if (!error && dropped) {
      revalidatePath(WIP_PATH);
      return fail(
        "Saved the whole buckets, but the part-bucket amounts need the 20260901_wip_partial migration."
      );
    }
  }

  if (error) {
    if (isMissingTable(error)) {
      return fail(
        "WIP counts need the 20260830_wip_counts migration. Run it, then try again."
      );
    }
    return fail(error.message);
  }

  revalidatePath(WIP_PATH);
  revalidatePath("/production/wip/count");
  revalidatePath("/production/schedule");
  return { ok: true, saved: rows.length };
}

/**
 * Removes a count.
 *
 * A count is a record of what was physically there, so deleting one changes
 * the answer to a question someone may ask later. But a miscount typed at
 * four in the morning is the normal case, and making someone find an
 * administrator to undo their own typo is worse than the risk: whoever took
 * the count can remove it, and an administrator can remove anyone's.
 */
export async function deleteWipCount(input: {
  id: string;
}): Promise<ActionResult> {
  if (!input.id) return fail("Missing count");

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  const { data: count } = await supabase
    .from("wip_counts")
    .select("id, counted_by")
    .eq("id", input.id)
    .maybeSingle();

  if (!count) return fail("That count no longer exists");
  if (count.counted_by !== profile.id && !isAdminProfile(profile)) {
    return fail("Only an administrator can remove someone else's count");
  }

  const { error } = await supabase.from("wip_counts").delete().eq("id", input.id);
  if (error) return fail(error.message);

  revalidatePath(WIP_PATH);
  revalidatePath("/production/schedule");
  return { ok: true };
}
