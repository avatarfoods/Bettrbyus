"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The control panel under the app bar.
 *
 * Its height is published as --page-shell-height so the planning date row
 * can freeze just beneath it instead of sliding under the menus.
 */
export function PageShellBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const bar = el;
    function apply() {
      document.documentElement.style.setProperty(
        "--page-shell-height",
        `${bar.offsetHeight}px`
      );
    }

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--page-shell-height");
    };
  }, []);

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
