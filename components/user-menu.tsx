"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeftRight, ChevronDown, CookingPot, LogOut, Package, ShoppingCart, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  email: string;
  isAdmin?: boolean;
};

const NAV_ITEMS = [
  {
    href: "/movings/new",
    label: "Movings",
    icon: ArrowLeftRight,
    match: (pathname: string) => pathname.startsWith("/movings"),
  },
  {
    href: "/recipes",
    label: "Recipes",
    icon: CookingPot,
    match: (pathname: string) => pathname.startsWith("/recipes"),
  },
] as const;

const PURCHASING_LINKS = [
  { href: "/purchasing", label: "Total Orders", icon: ShoppingCart },
  { href: "/purchasing/orders", label: "Orders list", icon: ShoppingCart },
  { href: "/purchasing/materials", label: "Materials", icon: Package },
] as const;

function PurchasingNavItem({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const active = pathname.startsWith("/purchasing");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex shrink-0 items-center">
        <Link
          href="/purchasing"
          aria-current={active ? "page" : undefined}
          className={cn(
            buttonVariants({
              variant: active ? "secondary" : "ghost",
              size: "sm",
            }),
            "shrink-0 rounded-r-none pr-2",
            active && "font-semibold"
          )}
        >
          <ShoppingCart />
          <span className="hidden sm:inline">Purchasing</span>
        </Link>
        <PopoverTrigger
          className={cn(
            buttonVariants({
              variant: active ? "secondary" : "ghost",
              size: "sm",
            }),
            "shrink-0 rounded-l-none border-l border-border/40 px-1.5"
          )}
          aria-label="Open Purchasing menu"
        >
          <ChevronDown
            className={cn(
              "size-3.5 opacity-70 transition-transform",
              open && "rotate-180"
            )}
          />
        </PopoverTrigger>
      </div>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-52 gap-0.5 p-1"
      >
        {PURCHASING_LINKS.map((item) => {
          const Icon = item.icon;
          const itemActive =
            item.href === "/purchasing"
              ? pathname === "/purchasing" ||
                pathname.startsWith("/purchasing/cycles")
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                itemActive && "bg-accent font-medium"
              )}
            >
              <Icon className="size-3.5 opacity-70" />
              {item.label}
            </Link>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function UserMenu({ email, isAdmin = false }: UserMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
      <Link
        href="/"
        className="shrink-0 text-sm font-semibold tracking-tight text-foreground hover:opacity-80"
      >
        TMS
      </Link>

      <nav
        aria-label="Main"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-visible"
      >
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                buttonVariants({
                  variant: active ? "secondary" : "ghost",
                  size: "sm",
                }),
                "shrink-0",
                active && "font-semibold"
              )}
            >
              <Icon />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
        <PurchasingNavItem pathname={pathname} />
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <span
          className="hidden max-w-40 truncate text-xs text-muted-foreground md:inline lg:max-w-56"
          title={email}
        >
          {email}
        </span>
        {isAdmin && (
          <Link
            href="/admin/invite"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "shrink-0"
            )}
            aria-label="Invite user"
          >
            <UserPlus />
            <span className="hidden lg:inline">Invite</span>
          </Link>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          aria-label={isSigningOut ? "Signing out" : "Log out"}
        >
          <LogOut />
          <span className="hidden sm:inline">
            {isSigningOut ? "Signing out…" : "Log out"}
          </span>
        </Button>
      </div>
    </div>
  );
}
