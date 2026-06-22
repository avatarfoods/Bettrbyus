"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type UserMenuProps = {
  email: string;
};

export function UserMenu({ email }: UserMenuProps) {
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
