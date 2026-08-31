"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  readStoredTheme,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

type ThemeToggleProps = {
  /** Show the label next to the icon. Off in the top bar, on in Settings. */
  showLabel?: boolean;
  className?: string;
};

/**
 * The preference lives in localStorage, which the server cannot read.
 *
 * useSyncExternalStore is built for exactly this: it renders the server
 * snapshot during SSR and hydration, then swaps to the real value. Reading
 * storage in a lazy useState instead would render "System" on the server and
 * "Light" in the browser - a hydration mismatch that blows away the tree.
 *
 * The page colours never flicker regardless: the inline script in <head> has
 * already set data-theme before the first paint. Only this button's icon
 * settles a frame later.
 */
let listeners: (() => void)[] = [];

function subscribe(onChange: () => void): () => void {
  listeners.push(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners = listeners.filter((listener) => listener !== onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function ThemeToggle({ showLabel = false, className }: ThemeToggleProps) {
  const preference = useSyncExternalStore(
    subscribe,
    readStoredTheme,
    () => DEFAULT_THEME
  );

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  const choose = useCallback((next: ThemePreference) => {
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference just will not persist; the theme still applies this session.
    }
    // storage events only fire in *other* tabs, so this tab is told directly.
    notify();
  }, []);

  const active = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <Menu.Root>
      <Menu.Trigger
        data-slot="button"
        aria-label={`Theme: ${active.label}`}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className
        )}
      >
        <ActiveIcon className="size-4" />
        {showLabel && <span>{active.label}</span>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="isolate z-50 outline-hidden">
          <Menu.Popup
            className={cn(
              "min-w-40 origin-(--transform-origin) rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden",
              "transition-[scale,opacity] duration-100 ease-out data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0"
            )}
          >
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = option.value === preference;
              return (
                <Menu.Item
                  key={option.value}
                  onClick={() => choose(option.value)}
                  className={cn(
                    "flex cursor-default items-center gap-2 rounded-md px-2 py-2 outline-hidden select-none",
                    "data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  )}
                >
                  <Icon className="size-4 opacity-70" />
                  <span className="flex-1">{option.label}</span>
                  {selected && <Check className="size-3.5 text-primary" />}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
