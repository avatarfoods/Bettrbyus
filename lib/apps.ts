import {
  ArrowLeftRight,
  Boxes,
  Building2,
  Calculator,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  CookingPot,
  Factory,
  FileInput,
  Layers,
  LayoutDashboard,
  ListChecks,
  Package,
  Palette,
  Printer,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  UserPlus,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

/**
 * The app registry: one source of truth for the launcher tiles and for the
 * per-app menus in the top bar. Adding an app is a single entry here - no
 * other file needs to change.
 *
 * Hrefs still point at the routes as they exist today. Reorganising URLs to
 * match the app boundaries is deliberately a later step, so this change stays
 * a shell change and nothing breaks underneath it.
 */

export type AppId = "production" | "purchasing" | "inventory" | "settings";

/** Tile colour. Maps to a token pair, never a raw hex. */
export type AppTint = "brand" | "warning" | "success" | "slate";

export type AppMenuItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
};

export type AppMenu = {
  label: string;
  /** Clicking the menu label itself navigates here, Odoo-style. */
  href?: string;
  items: AppMenuItem[];
};

export type AppDefinition = {
  id: AppId;
  name: string;
  /** Where the tile lands you. */
  href: string;
  icon: LucideIcon;
  tint: AppTint;
  description: string;
  menus: AppMenu[];
  /** Hidden from the launcher for non-admins. */
  adminOnly?: boolean;
  /**
   * Route prefixes owned by this app, used to decide which app the current
   * page belongs to. Order matters only in that longer prefixes win.
   */
  routes: string[];
};

export const APPS: AppDefinition[] = [
  {
    id: "production",
    name: "Production",
    href: "/production",
    icon: Factory,
    tint: "brand",
    description: "Planning, orders, recipes and WIP",
    routes: ["/movings", "/recipes", "/wip", "/orders", "/production"],
    menus: [
      {
        label: "Dashboard",
        href: "/production",
        items: [
          {
            label: "Today on the floor",
            href: "/production",
            icon: LayoutDashboard,
          },
        ],
      },
      {
        // Everything that decides what gets made and when lives together:
        // the plan itself, what it needs, what is already thawing, and the
        // paper that comes out of it.
        label: "Planning",
        href: "/production/schedule",
        items: [
          { label: "Schedule", href: "/production/schedule", icon: CalendarRange },
          { label: "Orders", href: "/orders", icon: CalendarDays },
          { label: "Thawing", href: "/movings/new", icon: ArrowLeftRight },
          { label: "Thawing history", href: "/movings/history", icon: ListChecks },
          { label: "Print for the floor", href: "/production/print", icon: Printer },
        ],
      },
      {
        // What is physically in the cooler, as against what is planned - a
        // different question, asked by different people, so its own menu.
        label: "WIP",
        href: "/production/wip",
        items: [
          { label: "WIP on hand", href: "/production/wip", icon: Boxes },
          {
            label: "Count WIP",
            href: "/production/wip/count",
            icon: ClipboardList,
          },
          { label: "WIP calculator", href: "/wip", icon: Calculator },
        ],
      },
      {
        label: "Recipes",
        href: "/recipes",
        items: [{ label: "All recipes", href: "/recipes", icon: CookingPot }],
      },
      {
        label: "Settings",
        href: "/production/settings/orders",
        items: [
          {
            label: "Order schedule",
            href: "/production/settings/orders",
            icon: CalendarDays,
          },
          {
            label: "Warehouses",
            href: "/production/settings/warehouses",
            icon: Warehouse,
          },
          {
            label: "Lines",
            href: "/production/settings/lines",
            icon: SlidersHorizontal,
          },
          {
            label: "Departments",
            href: "/production/settings/departments",
            icon: Building2,
          },
          {
            label: "Product Groups",
            href: "/production/settings/groups",
            icon: Layers,
          },
          {
            label: "Lead times",
            href: "/production/settings/schedule",
            icon: CalendarRange,
          },
        ],
      },
    ],
  },
  {
    id: "inventory",
    name: "Inventory",
    href: "/inventory-checks/new",
    icon: Boxes,
    tint: "success",
    description: "Counts and stock on hand",
    routes: ["/inventory-checks"],
    menus: [
      {
        label: "Checks",
        href: "/inventory-checks/new",
        items: [
          {
            label: "New check",
            href: "/inventory-checks/new",
            icon: ClipboardList,
          },
          {
            label: "History",
            href: "/inventory-checks/history",
            icon: ListChecks,
          },
        ],
      },
    ],
  },
  {
    id: "purchasing",
    name: "Purchasing",
    href: "/purchasing",
    icon: ShoppingCart,
    tint: "warning",
    description: "Orders, materials and imports",
    routes: ["/purchasing"],
    menus: [
      {
        label: "Orders",
        href: "/purchasing",
        items: [
          { label: "Total orders", href: "/purchasing", icon: ShoppingCart },
          {
            label: "Orders list",
            href: "/purchasing/orders",
            icon: ListChecks,
          },
        ],
      },
      {
        label: "Materials",
        href: "/purchasing/materials",
        items: [
          {
            label: "All materials",
            href: "/purchasing/materials",
            icon: Package,
          },
        ],
      },
      {
        label: "Imports",
        href: "/purchasing/imports",
        items: [
          {
            label: "Master workbook",
            href: "/purchasing/imports",
            icon: FileInput,
          },
        ],
      },
    ],
  },
  {
    id: "settings",
    name: "Settings",
    href: "/settings",
    icon: Settings,
    tint: "slate",
    description: "Users and appearance",
    adminOnly: true,
    routes: ["/settings", "/admin"],
    menus: [
      {
        label: "Appearance",
        href: "/settings/appearance",
        items: [
          { label: "Theme & wallpaper", href: "/settings/appearance", icon: Palette },
        ],
      },
      {
        label: "Users",
        href: "/settings/users",
        items: [
          { label: "All users", href: "/settings/users", icon: Users },
          { label: "New user", href: "/settings/users/new", icon: UserPlus },
        ],
      },
    ],
  },
];

/** Tiles this user is allowed to see. */
export function visibleApps(isAdmin: boolean): AppDefinition[] {
  return APPS.filter((app) => !app.adminOnly || isAdmin);
}

/**
 * Which app owns this path. Longest matching prefix wins so that a future
 * "/purchasing/inventory" would resolve to Purchasing rather than Inventory.
 */
export function appForPath(pathname: string): AppDefinition | null {
  let best: { app: AppDefinition; length: number } | null = null;

  for (const app of APPS) {
    for (const route of app.routes) {
      const matches = pathname === route || pathname.startsWith(`${route}/`);
      if (matches && (!best || route.length > best.length)) {
        best = { app, length: route.length };
      }
    }
  }

  return best?.app ?? null;
}

/** True when this menu item is the page currently being shown. */
export function isMenuItemActive(pathname: string, href: string): boolean {
  const path = href.split("#")[0];
  return pathname === path;
}

/** True when any item under this menu is active. */
export function isMenuActive(pathname: string, menu: AppMenu): boolean {
  return menu.items.some((item) => isMenuItemActive(pathname, item.href));
}

/**
 * Accent classes per tint. Written out in full because Tailwind can only see
 * class names that appear literally in the source.
 *
 * The icon colours the glyph itself on a plain white tile - the way Odoo does
 * it. An earlier version nested a coloured block inside the white tile, which
 * read as a badge stuck on a card rather than as one app icon.
 */
export const TINT_CLASSES: Record<AppTint, { icon: string; dot: string }> = {
  brand: { icon: "text-brand", dot: "bg-brand" },
  warning: { icon: "text-[oklch(0.72_0.17_62)]", dot: "bg-warning" },
  success: { icon: "text-success", dot: "bg-success" },
  slate: { icon: "text-foreground/70", dot: "bg-foreground/70" },
};
