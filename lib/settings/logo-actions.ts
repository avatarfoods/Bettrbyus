"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { isSafeImageUrl } from "@/lib/settings/wallpaper";
import { isMissingColumn } from "@/lib/supabase/missing";

export type SaveLogoResult = { ok: true } | { ok: false; message: string };

/**
 * Saves the logo shown in the top bar, company-wide.
 *
 * A URL rather than an upload: the logo already lives somewhere (the website,
 * a shared drive link), and a URL keeps this a one-column setting with the
 * same safety rule the wallpaper image has. Empty puts the shipped logo back.
 * The RLS policy on app_settings is the real gate; the admin check here only
 * makes the message honest.
 */
export async function saveLogoUrl(input: unknown): Promise<SaveLogoResult> {
  const raw = typeof input === "string" ? input.trim() : "";
  if (raw.length > 2000) return { ok: false, message: "That URL is too long" };
  if (raw !== "" && !isSafeImageUrl(raw)) {
    return {
      ok: false,
      message: "Enter an https:// URL or a path starting with /",
    };
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can change the logo" };
  }

  const { error } = await supabase
    .from("app_settings")
    .update({
      logo_url: raw === "" ? null : raw,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", true);

  if (error) {
    if (isMissingColumn(error)) {
      return {
        ok: false,
        message:
          "The logo setting needs the 20260904_app_logo migration. Run it in the Supabase SQL editor, then try again.",
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
