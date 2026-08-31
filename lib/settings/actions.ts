"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { wallpaperSettingsSchema } from "@/lib/validations/appearance";

export type SaveWallpaperResult = { ok: true } | { ok: false; message: string };

/**
 * Saves the company-wide launcher wallpaper.
 *
 * The admin check here is for the error message, not the security boundary -
 * that is the "Admins can update app settings" RLS policy, which the anon
 * client cannot talk its way past. This action deliberately does not use the
 * service-role client, so a non-admin request fails at the database.
 */
export async function saveWallpaperSettings(
  input: unknown
): Promise<SaveWallpaperResult> {
  const parsed = wallpaperSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Those settings are not valid",
    };
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can change the wallpaper" };
  }

  const { preset, color, imageUrl, showLogoWatermark } = parsed.data;

  const { error } = await supabase
    .from("app_settings")
    .update({
      wallpaper_preset: preset,
      // Colour and image only apply to a custom wallpaper; clearing them when
      // a preset is chosen keeps the stored row honest about what is showing.
      wallpaper_color: preset === "custom" ? (color ?? null) : null,
      wallpaper_image_url: preset === "custom" ? (imageUrl || null) : null,
      show_logo_watermark: showLogoWatermark,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", true);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  revalidatePath("/settings/appearance");

  return { ok: true };
}
