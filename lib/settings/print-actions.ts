"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/supabase/missing";
import { PRINT_SHEET_IDS, type PrintSheetId } from "@/lib/settings/wallpaper";

// "use server" files may only export async functions: anything else comes
// out the other side as a server reference. The ids live in wallpaper.ts.

export type SavePrintSheetsResult = { ok: true } | { ok: false; message: string };

/**
 * Saves which sheets "Print all" prints and in what order.
 *
 * Only the three known ids, each at most once, at least one. The RLS policy
 * on app_settings is the real gate; the admin check makes the message honest.
 */
export async function savePrintSheets(input: unknown): Promise<SavePrintSheetsResult> {
  const raw = Array.isArray(input) ? input : [];
  const sheets = [
    ...new Set(
      raw.filter((value): value is PrintSheetId =>
        typeof value === "string" && (PRINT_SHEET_IDS as readonly string[]).includes(value)
      )
    ),
  ];
  if (sheets.length === 0) return { ok: false, message: "Keep at least one sheet" };

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can change what prints" };
  }

  const { error } = await supabase
    .from("app_settings")
    .update({
      print_sheets: sheets,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", true);

  if (error) {
    if (isMissingColumn(error)) {
      return {
        ok: false,
        message:
          "This setting needs the 20260904_print_sheets migration. Run it in the Supabase SQL editor, then try again.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/production/settings/print");
  revalidatePath("/production/print", "layout");
  return { ok: true };
}

/**
 * Saves the per-department plan: which sheets print for each department and
 * in what order. Unknown sheet ids are dropped; a department with nothing
 * left prints nothing, which is allowed - some rooms only ever get a batch
 * record handed over by someone else.
 */
export async function savePrintPlan(input: unknown): Promise<SavePrintSheetsResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "Nothing to save" };
  }
  const plan: Record<string, PrintSheetId[]> = {};
  for (const [department, sheets] of Object.entries(input as Record<string, unknown>)) {
    if (typeof department !== "string" || department.trim() === "" || department.length > 80) continue;
    if (!Array.isArray(sheets)) continue;
    plan[department.trim().toUpperCase()] = [
      ...new Set(
        sheets.filter((value): value is PrintSheetId =>
          typeof value === "string" && (PRINT_SHEET_IDS as readonly string[]).includes(value)
        )
      ),
    ];
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can change what prints" };
  }

  const { error } = await supabase
    .from("app_settings")
    .update({
      print_plan: plan,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", true);

  if (error) {
    if (isMissingColumn(error)) {
      return {
        ok: false,
        message:
          "This setting needs the 20260904_print_sheets migration. Run it in the Supabase SQL editor, then try again.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/production/settings/print");
  revalidatePath("/production/print", "layout");
  return { ok: true };
}
