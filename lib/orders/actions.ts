"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { setCompletionDate, setOnProduction } from "@/lib/odoo/orders";
import { createClient } from "@/lib/supabase/server";

/**
 * The only two things Bettrbyus writes back to Odoo.
 *
 * Deliberately narrow. Everything else on a delivery order stays Odoo's, so
 * there is no chance of this app quietly overwriting something customer
 * service or accounting depends on.
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

/** Sets the production Completion Date - the sheet's DATE SCHEDULED. */
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

/** Moves the transfer to "2. On Production" in Odoo. */
export async function markOnProduction(
  pickingId: number
): Promise<OdooWriteResult> {
  if (!Number.isInteger(pickingId) || pickingId <= 0) {
    return { ok: false, message: "Missing transfer" };
  }

  const gate = await requireSignedIn();
  if (!gate.ok) return gate;

  try {
    await setOnProduction(pickingId);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Odoo refused the write",
    };
  }

  revalidatePath("/orders");
  return { ok: true };
}
