"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/supabase/missing";

export type SaveCaseUnitsResult = { ok: true } | { ok: false; message: string };

/**
 * Saves the list of things a case can be counted in.
 *
 * Lower-case, trimmed, no duplicates, at least one. The RLS policy on
 * app_settings is the real gate; the admin check makes the message honest.
 */
export async function saveCaseUnits(input: unknown): Promise<SaveCaseUnitsResult> {
  const raw = Array.isArray(input) ? input : [];
  const units = [
    ...new Set(
      raw
        .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
        .filter((value) => value !== "")
    ),
  ];
  if (units.length === 0) return { ok: false, message: "Keep at least one unit" };
  if (units.length > 30) return { ok: false, message: "That is more units than a dropdown can hold" };
  if (units.some((unit) => unit.length > 20)) {
    return { ok: false, message: "A unit is one short word, twenty letters at most" };
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can change the case units" };
  }

  const { error } = await supabase
    .from("app_settings")
    .update({
      case_units: units,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", true);

  if (error) {
    if (isMissingColumn(error)) {
      return {
        ok: false,
        message:
          "The case units need the 20260904_case_units migration. Run it in the Supabase SQL editor, then try again.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/recipes/settings");
  revalidatePath("/recipes", "layout");
  return { ok: true };
}
