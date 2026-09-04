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
  /** What a case can be counted in on a specification: bowl, burrito, cup… */
  caseUnits: string[];
  /** What "Print all" prints, in order: release, batch, report. */
  printSheets: string[];
  /** Per department, which sheets Print all prints and in what order. */
  printPlan: PrintPlan;
};

export const DEFAULT_PRINT_SHEETS = ["release", "batch", "report"];

/** The three sheets Print all can print. A plain module, so a client page can read it. */
export const PRINT_SHEET_IDS = ["batch", "release", "report"] as const;
export type PrintSheetId = (typeof PRINT_SHEET_IDS)[number];

/** Department name -> sheet ids ("batch" | "release" | "report"), in print order. */
export type PrintPlan = Record<string, string[]>;

/**
 * What a department prints when nobody has said: Finished Product gets the
 * batch record, the release and the report; everyone else the batch record
 * and the report - nothing in a kitchen goes on a pallet.
 */
export function defaultSheetsFor(department: string, plan: PrintPlan): string[] {
  const set = plan[department] ?? plan[department.trim().toUpperCase()];
  if (Array.isArray(set)) return set;
  return /finished/i.test(department) ? ["batch", "release", "report"] : ["batch", "report"];
}

export const DEFAULT_CASE_UNITS = ["bowl", "burrito", "cup", "bag", "tray", "piece"];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  wallpaperPreset: "kitchen-green",
  wallpaperColor: null,
  wallpaperImageUrl: null,
  showLogoWatermark: true,
  logoUrl: null,
  caseUnits: DEFAULT_CASE_UNITS,
  printSheets: DEFAULT_PRINT_SHEETS,
  printPlan: {},
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
  case_units?: string[] | null;
  print_sheets?: string[] | null;
  print_plan?: unknown;
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
    caseUnits:
      Array.isArray(row.case_units) && row.case_units.length > 0
        ? row.case_units.filter((unit): unit is string => typeof unit === "string")
        : DEFAULT_CASE_UNITS,
    printSheets:
      Array.isArray(row.print_sheets) && row.print_sheets.length > 0
        ? row.print_sheets.filter((sheet): sheet is string => typeof sheet === "string")
        : DEFAULT_PRINT_SHEETS,
    printPlan: parsePrintPlan(row.print_plan),
  };
}

function parsePrintPlan(value: unknown): PrintPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: PrintPlan = {};
  for (const [department, sheets] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(sheets)) continue;
    out[department] = sheets.filter(
      (sheet): sheet is string =>
        typeof sheet === "string" && ["batch", "release", "report"].includes(sheet)
    );
  }
  return out;
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
