"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  email: string;
  isAdmin?: boolean;
};

export function UserMenu({ email, isAdmin = false }: UserMenuProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="ml-auto flex w-full min-w-0 items-center justify-end gap-2 sm:w-auto sm:gap-3">
      <span className="min-w-0 truncate text-right text-sm text-muted-foreground sm:max-w-xs">
        {email}
      </span>
      {isAdmin && (
        <Link
          href="/admin/invite"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
        >
          <UserPlus />
          <span className="hidden sm:inline">Invite</span>
        </Link>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => void handleSignOut()}
        disabled={isSigningOut}
      >
        <LogOut />
        {isSigningOut ? "Signing out…" : "Log out"}
      </Button>
    </div>
  );
}
