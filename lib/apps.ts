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
  Layers,
  LayoutDashboard,
  ListChecks,
  Package,
  Palette,
  Printer,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
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

export type AppId = "production" | "purchasing" | "hr" | "settings";

/** Tile colour. Maps to a token pair, never a raw hex. */
export type AppTint = "brand" | "warning" | "success" | "slate";

export type AppMenuItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
  /**
   * Heading this item sits under inside its menu.
   *
   * Configuration is a list of pages that each belong to somewhere else in
   * the app - the order schedule is an Orders rule, lead times is a Planning
   * rule - and a flat list of six makes you read all six to find the one you
   * want. Grouping them under the thing they configure means you look in one
   * place. Consecutive items sharing a group are drawn under one heading, so
   * order in this array is what decides the grouping.
   */
  group?: string;
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
        href: "/production/schedule?view=live",
        items: [
          {
            group: "Plan",
            label: "Schedule",
            href: "/production/schedule?view=live",
            icon: CalendarRange,
          },
          // Plan history lives behind the gear on the schedule page itself.
          {
            group: "Plan",
            label: "Picking Order",
            href: "/production/picking",
            icon: ClipboardList,
          },
          { group: "Plan", label: "Orders", href: "/orders", icon: CalendarDays },
          {
            group: "Thawing",
            label: "New thaw",
            href: "/movings/new",
            icon: ArrowLeftRight,
          },
          {
            group: "Thawing",
            label: "History",
            href: "/movings/history",
            icon: ListChecks,
          },
          {
            group: "Paper",
            label: "Print for the floor",
            href: "/production/print",
            icon: Printer,
          },
        ],
      },
      {
        // What is physically in the cooler, as against what is planned - a
        // different question, asked by different people, so its own menu.
        label: "WIP",
        href: "/production/wip",
        items: [
          {
            group: "On hand",
            label: "WIP on hand",
            href: "/production/wip",
            icon: Boxes,
          },
          {
            group: "On hand",
            label: "Count WIP",
            href: "/production/wip/count",
            icon: ClipboardList,
          },
          {
            group: "Work it out",
            label: "WIP calculator",
            href: "/wip",
            icon: Calculator,
          },
        ],
      },
      {
        label: "Recipes",
        href: "/recipes",
        items: [{ label: "All recipes", href: "/recipes", icon: CookingPot }],
      },
      {
        // Grouped by what each page configures, in the same order those
        // things appear in the menu bar above.
        label: "Configuration",
        href: "/production/settings/orders",
        items: [
          {
            group: "Planning",
            label: "Lead times",
            href: "/production/settings/schedule",
            icon: CalendarRange,
          },
          {
            group: "Orders",
            label: "Order schedule",
            href: "/production/settings/orders",
            icon: CalendarDays,
          },
          {
            group: "Orders",
            label: "Warehouses",
            href: "/production/settings/warehouses",
            icon: Warehouse,
          },
          {
            group: "Production",
            label: "Lines",
            href: "/production/settings/lines",
            icon: SlidersHorizontal,
          },
          {
            group: "Production",
            label: "Departments",
            href: "/production/settings/departments",
            icon: Building2,
          },
          {
            group: "Planning",
            label: "Plans",
            href: "/production/settings/plans",
            icon: ClipboardList,
          },
          {
            group: "Planning",
            label: "Reset",
            href: "/production/settings/reset",
            icon: Trash2,
          },
          {
            // Lives inside Recipes as its Settings tab; this is the same page.
            group: "Recipes",
            label: "Product Groups",
            href: "/recipes/settings",
            icon: Layers,
          },
          {
            group: "WIP",
            label: "Container sizes",
            href: "/production/settings/container-sizes",
            icon: Boxes,
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
    description: "Orders and materials",
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
        label: "Configuration",
        href: "/purchasing/settings/places",
        items: [
          {
            group: "Materials",
            label: "Places",
            href: "/purchasing/settings/places",
            icon: Building2,
          },
        ],
      },
    ],
  },
  {
    // People and their week: who is in, where, and what it costs. Fed from
    // Paychex, scheduled by supervisors, approved once, then printed.
    id: "hr",
    name: "HR",
    href: "/hr",
    icon: Users,
    tint: "success",
    description: "People, schedules and labour cost",
    routes: ["/hr"],
    menus: [
      {
        label: "Dashboard",
        href: "/hr",
        items: [{ label: "This week", href: "/hr", icon: LayoutDashboard }],
      },
      {
        // Printing and emailing live on the schedule itself, beside the
        // approved week they act on, not here.
        label: "Schedule",
        href: "/hr/schedule",
        items: [{ label: "This week", href: "/hr/schedule", icon: CalendarRange }],
      },
      {
        // Import is a button on the People page, top right, where the list is.
        label: "People",
        href: "/hr/people",
        items: [{ label: "All people", href: "/hr/people", icon: Users }],
      },
      {
        // Every rule in one place, so anyone with access can change it.
        label: "Configuration",
        href: "/hr/settings/departments",
        items: [
          { group: "People", label: "Departments", href: "/hr/settings/departments", icon: Building2 },
          { group: "People", label: "Groups", href: "/hr/settings/groups", icon: Users },
          { group: "Approval", label: "Approval chain", href: "/hr/settings/approval", icon: ListChecks },
          { group: "Schedule", label: "Off because", href: "/hr/settings/absences", icon: CalendarDays },
          { group: "Cost", label: "Pay rules", href: "/hr/settings/pay", icon: Calculator },
          // Who may open HR lives with every other access right, in Settings > Users.
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
