"use client";

import { Fragment, useState } from "react";
import { clearTrail } from "@/lib/nav-trail";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import { Menu } from "@base-ui/react/menu";
import {
  ChevronDown,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  X,
} from "lucide-react";
import {
  appForPath,
  isMenuActive,
  isMenuItemActive,
  type AppDefinition,
  type AppMenu,
} from "@/lib/apps";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

const APP_NAME = "Bettrbyus";

/**
 * One dark bar across the top, then the page.
 *
 * The menus live in the bar rather than a left rail: a rail costs 224px of
 * width on every screen, and these pages are wide tables that want it. The bar
 * carries the dark chrome instead, so the app still reads as Odoo-ish without
 * spending horizontal space on it.
 *
 * Switching apps is deliberately only possible from the launcher - the grid
 * icon goes home, and there is no app list in here.
 */
export function AppFrameClient({
  email,
  isAdmin,
  children,
}: {
  email: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const app = appForPath(pathname);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 flex h-(--app-bar-height) shrink-0 items-center gap-1 bg-sidebar px-2 text-sidebar-foreground sm:gap-2 sm:px-3">
        <Link
          href="/"
          aria-label="All apps"
          title="All apps"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-link transition-colors",
            "hover:bg-sidebar-accent hover:text-white",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
          )}
        >
          <LayoutGrid className="size-[1.05rem]" />
        </Link>

        <Link
          href={app?.href ?? "/"}
          className="flex shrink-0 items-center gap-2 rounded-md px-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring"
        >
          <Image
            src="/logo.png"
            alt=""
            width={22}
            height={22}
            className="size-[1.35rem] shrink-0 object-contain brightness-0 invert"
          />
          <span className="font-heading text-sm font-bold tracking-tight text-white">
            {app ? app.name : APP_NAME}
          </span>
        </Link>

        {app && (
          <>
            <nav
              aria-label={`${app.name} menu`}
              className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 md:flex"
            >
              {app.menus.map((menu) => (
                <BarMenu key={menu.label} menu={menu} pathname={pathname} />
              ))}
            </nav>
            <MobileNav app={app} pathname={pathname} />
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <ThemeToggle className="text-sidebar-link hover:bg-sidebar-accent hover:text-white data-popup-open:bg-sidebar-accent data-popup-open:text-white" />
          <UserMenuButton email={email} isAdmin={isAdmin} />
        </div>
      </header>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

/** One menu in the dark bar. A single-item menu is just a link. */
function BarMenu({ menu, pathname }: { menu: AppMenu; pathname: string }) {
  const active = isMenuActive(pathname, menu);

  const base = cn(
    "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-sm font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
    active
      ? "bg-sidebar-primary text-white"
      : "text-sidebar-link hover:bg-sidebar-accent hover:text-white",
  );

  if (menu.items.length === 1) {
    return (
      <Link
        href={menu.items[0].href}
        onClick={clearTrail}
        aria-current={active ? "page" : undefined}
        className={base}
      >
        {menu.label}
      </Link>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          base,
          "data-popup-open:bg-sidebar-accent data-popup-open:text-white",
        )}
      >
        {menu.label}
        <ChevronDown className="size-3.5 opacity-70" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          sideOffset={6}
          align="start"
          className="isolate z-50 outline-hidden"
        >
          <Menu.Popup className="min-w-52 origin-(--transform-origin) rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden transition-[scale,opacity] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
            {menu.items.map((item, index) => {
              const Icon = item.icon;
              const itemActive = isMenuItemActive(pathname, item.href);
              // A heading is drawn where the group changes, so a run of items
              // that belong together sits under one label.
              const heading =
                item.group && item.group !== menu.items[index - 1]?.group
                  ? item.group
                  : null;

              return (
                <Fragment key={item.href}>
                  {heading && (
                    <div
                      className={cn(
                        "px-2.5 pt-2 pb-1 text-[0.625rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase",
                        index > 0 && "mt-1 border-t border-border/70",
                      )}
                    >
                      {heading}
                    </div>
                  )}
                  <Menu.LinkItem
                    href={item.href}
                    onClick={clearTrail}
                    render={<Link href={item.href} />}
                    className={cn(
                      "flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 outline-hidden select-none",
                      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                      itemActive && "font-semibold text-primary",
                    )}
                  >
                    {Icon && <Icon className="size-4 opacity-70" />}
                    {item.label}
                  </Menu.LinkItem>
                </Fragment>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Phone menu: this app's pages only. Apps are switched from the launcher. */
function MobileNav({
  app,
  pathname,
}: {
  app: AppDefinition;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="left">
      <Drawer.Trigger
        aria-label={`Open ${app.name} menu`}
        className="ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-link transition-colors hover:bg-sidebar-accent hover:text-white md:hidden"
      >
        <MenuIcon className="size-[1.05rem]" />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black/50 transition-opacity duration-300 data-starting-style:opacity-0 data-ending-style:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-stretch justify-start">
          <Drawer.Popup
            className={cn(
              "relative flex h-full w-[min(17rem,82vw)] flex-col overflow-y-auto bg-sidebar p-2 text-sidebar-foreground outline-none",
              "[transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              "data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
            )}
          >
            <div className="mb-1 flex items-center justify-between px-1.5 py-2">
              <Drawer.Title className="font-heading text-sm font-bold text-white">
                {app.name}
              </Drawer.Title>
              <Drawer.Close
                aria-label="Close menu"
                className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-link hover:bg-sidebar-accent hover:text-white"
              >
                <X className="size-[1.05rem]" />
              </Drawer.Close>
            </div>

            {app.menus.map((menu) => (
              <div key={menu.label} className="mb-1">
                <p className="px-2.5 pt-2 pb-1 text-[0.625rem] tracking-[0.08em] text-sidebar-muted uppercase">
                  {menu.label}
                </p>
                {menu.items.map((item, index) => {
                  const Icon = item.icon;
                  const active = isMenuItemActive(pathname, item.href);
                  const heading =
                    item.group && item.group !== menu.items[index - 1]?.group
                      ? item.group
                      : null;
                  return (
                    <Fragment key={item.href}>
                      {heading && (
                        <p className="px-2.5 pt-2 pb-0.5 text-[0.5625rem] tracking-[0.08em] text-sidebar-muted/80 uppercase">
                          {heading}
                        </p>
                      )}
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "mb-0.5 flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-primary text-white"
                            : "text-sidebar-link hover:bg-sidebar-accent hover:text-white",
                        )}
                      >
                        {Icon && (
                          <Icon className="size-[0.95rem] shrink-0 opacity-90" />
                        )}
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </Fragment>
                  );
                })}
              </div>
            ))}

            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="mt-auto flex min-h-11 items-center gap-2.5 rounded-md border-t border-sidebar-border px-2.5 text-sm font-medium text-sidebar-link hover:bg-sidebar-accent hover:text-white"
            >
              <LayoutGrid className="size-[0.95rem] shrink-0 opacity-90" />
              All apps
            </Link>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function UserMenuButton({
  email,
  isAdmin,
}: {
  email: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Account"
        className="inline-flex size-8 items-center justify-center rounded-[1px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring"
      >
        <span className="flex size-7 items-center justify-center rounded-[1px] bg-sidebar-primary text-xs font-semibold text-white">
          {email.trim().charAt(0).toUpperCase() || "?"}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          sideOffset={6}
          align="end"
          className="isolate z-50 outline-hidden"
        >
          <Menu.Popup className="min-w-56 origin-(--transform-origin) rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden transition-[scale,opacity] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium" title={email}>
                {email}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAdmin ? "Administrator" : "User"}
              </p>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            {isAdmin && (
              <Menu.LinkItem
                href="/settings/users"
                render={<Link href="/settings/users" />}
                className="flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                Settings
              </Menu.LinkItem>
            )}
            <Menu.Item
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              className="flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-60"
            >
              <LogOut className="size-4 opacity-70" />
              {signingOut ? "Signing out…" : "Log out"}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
