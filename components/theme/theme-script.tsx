import { THEME_SCRIPT } from "@/lib/theme";

/**
 * Applies the saved theme before the browser paints. Must be rendered inside
 * <head> so it runs during HTML parsing rather than after hydration - a
 * useEffect here would show a flash of the wrong theme on every load.
 *
 * The type flips to text/plain on the client so React stops warning that a
 * script rendered in a component will not execute. It does not need to: by the
 * time React is running, the server-parsed copy has already done its job.
 */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}
