"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { setCompletionDate } from "@/lib/odoo/orders";
import { createClient } from "@/lib/supabase/server";

/**
 * The only write back to Odoo today is the production completion date.
 * Progress / Start stays in Odoo until that flow is built on purpose.
 */

export type OdooWriteResult = { ok: true } | { ok: false; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function requireSignedIn(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  return { ok: true };
}

/** Sets the production Completion Date — the sheet's DATE SCHEDULED. */
export async function saveCompletionDate(
  pickingId: number,
  date: string | null
): Promise<OdooWriteResult> {
  if (!Number.isInteger(pickingId) || pickingId <= 0) {
    return { ok: false, message: "Missing transfer" };
  }
  if (date !== null && !ISO_DATE.test(date)) {
    return { ok: false, message: "Enter a valid date" };
  }

  const gate = await requireSignedIn();
  if (!gate.ok) return gate;

  try {
    await setCompletionDate(pickingId, date);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Odoo refused the write",
    };
  }

  revalidatePath("/orders");
  return { ok: true };
}

export async function markOnProduction(
  _pickingId: number
): Promise<OdooWriteResult> {
  return {
    ok: false,
    message: "Progress is changed in Odoo. This app does not write it yet.",
  };
}
