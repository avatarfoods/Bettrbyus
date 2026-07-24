"use client";

import { useEffect, useRef, useState } from "react";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";

type AuthTopBarClientProps = {
  email: string;
  isAdmin: boolean;
};

const TOP_REVEAL_OFFSET = 16;
const SCROLL_DELTA = 8;

export function AuthTopBarClient({ email, isAdmin }: AuthTopBarClientProps) {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function onScroll() {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= TOP_REVEAL_OFFSET) {
        setVisible(true);
      } else if (currentScrollY > lastScrollY.current + SCROLL_DELTA) {
        setVisible(false);
      } else if (currentScrollY < lastScrollY.current - SCROLL_DELTA) {
        setVisible(true);
      }

      lastScrollY.current = currentScrollY;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--auth-top-bar-offset",
      visible ? "3rem" : "0px"
    );
    document.body.style.paddingTop = visible ? "3rem" : "0px";

    return () => {
      document.documentElement.style.removeProperty("--auth-top-bar-offset");
      document.body.style.paddingTop = "";
    };
  }, [visible]);

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-30 h-12 border-b bg-background/95 px-4 backdrop-blur transition-transform duration-300 supports-[backdrop-filter]:bg-background/80",
        visible ? "translate-y-0" : "-translate-y-full pointer-events-none"
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-[1400px] items-center">
        <UserMenu email={email} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
