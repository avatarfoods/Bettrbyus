"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ClipboardList,
  CookingPot,
  LogOut,
  ShoppingCart,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
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
    href: "/inventory-checks/new",
    label: "Inventory",
    icon: ClipboardList,
    match: (pathname: string) => pathname.startsWith("/inventory-checks"),
  },
  {
    href: "/recipes",
    label: "Recipes",
    icon: CookingPot,
    match: (pathname: string) => pathname.startsWith("/recipes"),
  },
  {
    href: "/purchasing",
    label: "Purchasing",
    icon: ShoppingCart,
    match: (pathname: string) => pathname.startsWith("/purchasing"),
  },
] as const;

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
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
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
