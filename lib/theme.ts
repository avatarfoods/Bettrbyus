/**
 * Theme preference handling.
 *
 * The stored preference is "light" | "dark" | "system". The inline script in
 * the root layout resolves "system" against the OS setting and writes the
 * result to data-theme on <html>, so data-theme is only ever "light" or
 * "dark" and globals.css never needs a duplicate prefers-color-scheme block.
 *
 * THEME_SCRIPT and readStoredTheme must stay in agreement: the script sets the
 * DOM before hydration, and any lazy useState initialiser reads the same value.
 * If they disagree, React re-renders and the user sees a flash.
 */

export const THEME_STORAGE_KEY = "bettrbyus-theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** What actually gets written to data-theme. */
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/** Reads the saved preference. Returns the default when storage is unavailable. */
export function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Safari private mode and locked-down kiosk browsers throw on access.
    return DEFAULT_THEME;
  }
}

export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.setAttribute(
    "data-theme",
    resolveTheme(preference)
  );
}

/**
 * Runs synchronously in <head> while the browser parses the HTML, before the
 * first paint. Kept as a single expression string so it can be inlined via
 * dangerouslySetInnerHTML.
 */
export const THEME_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY
)};var p=localStorage.getItem(k);if(p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(
  DEFAULT_THEME
)};var t=p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","light")}})()`;
