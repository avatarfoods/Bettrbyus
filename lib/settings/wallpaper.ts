import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Launcher wallpaper. A company-wide setting, changed by an admin in
 * Settings > Appearance and seen by everyone. Kept separate from the light/dark
 * preference, which is per person and never leaves the device.
 */

export type WallpaperPresetId =
  | "kitchen-green"
  | "avatar-blue"
  | "midnight"
  | "light"
  | "custom";

export type WallpaperPreset = {
  id: WallpaperPresetId;
  label: string;
  /** CSS background value. Presets ship as gradients so tiles stay legible. */
  background: string;
  /** Text colour that sits on top of it. */
  foreground: string;
  /** Whether the preset reads as dark, so the tile chrome can adapt. */
  dark: boolean;
};

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: "kitchen-green",
    label: "Kitchen Green",
    background:
      "radial-gradient(120% 100% at 50% 0%, #24503b 0%, #1b3a2b 45%, #13281e 100%)",
    foreground: "#ffffff",
    dark: true,
  },
  {
    id: "avatar-blue",
    label: "Avatar Blue",
    background:
      "radial-gradient(120% 100% at 50% 0%, #1a8cc6 0%, #10618c 50%, #0b3f5c 100%)",
    foreground: "#ffffff",
    dark: true,
  },
  {
    id: "midnight",
    label: "Midnight",
    background:
      "radial-gradient(120% 100% at 50% 0%, #253040 0%, #1a2230 50%, #11161f 100%)",
    foreground: "#ffffff",
    dark: true,
  },
  {
    id: "light",
    label: "Light",
    background:
      "radial-gradient(120% 100% at 50% 0%, #ffffff 0%, #eef3f7 55%, #dfe8ef 100%)",
    foreground: "#182029",
    dark: false,
  },
];

export type AppSettings = {
  wallpaperPreset: WallpaperPresetId;
  /** Solid colour, used when the preset is "custom". */
  wallpaperColor: string | null;
  /** Image URL, layered over the colour when present. */
  wallpaperImageUrl: string | null;
  showLogoWatermark: boolean;
  /** The logo in the top bar. Null means the one shipped with the app. */
  logoUrl: string | null;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  wallpaperPreset: "kitchen-green",
  wallpaperColor: null,
  wallpaperImageUrl: null,
  showLogoWatermark: true,
  logoUrl: null,
};

export function presetById(id: WallpaperPresetId): WallpaperPreset | null {
  return WALLPAPER_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Only #rgb / #rrggbb is accepted, so a stored value can never inject CSS. */
export function isSafeHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/** Only absolute http(s) URLs and same-origin paths, for the same reason. */
export function isSafeImageUrl(value: string | null | undefined): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export type WallpaperStyle = {
  background: string;
  color: string;
  dark: boolean;
};

/** Turns stored settings into the inline style the launcher renders. */
export function wallpaperStyle(settings: AppSettings): WallpaperStyle {
  const preset = presetById(settings.wallpaperPreset);

  const base = preset
    ? { background: preset.background, color: preset.foreground, dark: preset.dark }
    : {
        background: isSafeHexColor(settings.wallpaperColor)
          ? settings.wallpaperColor
          : "#1b3a2b",
        color: "#ffffff",
        dark: true,
      };

  if (isSafeImageUrl(settings.wallpaperImageUrl)) {
    // Scrim keeps white tile labels readable over an arbitrary photo.
    const scrim = base.dark
      ? "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.65) 100%)"
      : "linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.7) 100%)";
    return {
      ...base,
      background: `${scrim}, url("${encodeURI(settings.wallpaperImageUrl)}") center/cover no-repeat, ${base.background}`,
    };
  }

  return base;
}

type AppSettingsRow = {
  wallpaper_preset: string | null;
  wallpaper_color: string | null;
  wallpaper_image_url: string | null;
  show_logo_watermark: boolean | null;
  logo_url?: string | null;
};

function rowToSettings(row: AppSettingsRow | null): AppSettings {
  if (!row) return DEFAULT_APP_SETTINGS;

  const preset = WALLPAPER_PRESETS.some((p) => p.id === row.wallpaper_preset)
    ? (row.wallpaper_preset as WallpaperPresetId)
    : row.wallpaper_preset === "custom"
      ? "custom"
      : DEFAULT_APP_SETTINGS.wallpaperPreset;

  return {
    wallpaperPreset: preset,
    wallpaperColor: isSafeHexColor(row.wallpaper_color) ? row.wallpaper_color : null,
    wallpaperImageUrl: isSafeImageUrl(row.wallpaper_image_url)
      ? row.wallpaper_image_url
      : null,
    showLogoWatermark: row.show_logo_watermark ?? true,
    logoUrl: isSafeImageUrl(row.logo_url) ? row.logo_url : null,
  };
}

/**
 * Reads the company settings. Falls back to defaults rather than throwing -
 * a missing settings row should never stop the launcher from rendering.
 */
export async function fetchAppSettings(
  supabase: SupabaseClient
): Promise<AppSettings> {
  // "*" rather than a column list: the logo column arrived with a later
  // migration, and naming it on a database without it would fail the whole
  // read and blank the wallpaper too.
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .maybeSingle();

  if (error) return DEFAULT_APP_SETTINGS;
  return rowToSettings(data as AppSettingsRow | null);
}
