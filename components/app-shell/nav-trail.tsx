"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  getTrailServerSnapshot,
  getTrailSnapshot,
  pushStep,
  subscribeTrail,
  type TrailStep,
} from "@/lib/nav-trail";
import { cn } from "@/lib/utils";

/**
 * The breadcrumb, as a record of where you have been.
 *
 * Odoo's rule: opening a record from a list adds a crumb; clicking a crumb
 * goes back to that view exactly as you left it. What makes it work is that
 * each crumb remembers the whole URL - the date range, the department, the
 * search - so returning to Planning from four recipes deep puts you back on
 * the fortnight you were planning, not on a fresh default view.
 *
 * The trail is per tab and lives in sessionStorage, so a link someone pastes
 * to a colleague carries the page and not this person's path to it.
 */
export function NavTrail({
  label,
  root,
  fallback,
}: {
  /** What this page's crumb says. */
  label: string;
  /** True for an app's own home: arriving here starts the trail again. */
  root?: boolean;
  /** Crumbs to show before anything has been recorded, e.g. on first load. */
  fallback: { label: string; href?: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const steps = useSyncExternalStore(
    subscribeTrail,
    getTrailSnapshot,
    getTrailServerSnapshot
  );

  const query = searchParams.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  // Recording the visit updates the external store, which notifies the
  // subscription above - no state of our own to keep in step with it.
  useEffect(() => {
    pushStep({ label, href, key: pathname }, { root });
  }, [label, href, pathname, root]);

  // Before the effect runs there is nothing recorded, so the page's own static
  // crumbs stand in. They are also what a reader with no session sees.
  const shown: { label: string; href?: string }[] =
    steps.length > 0 ? steps : fallback;

  return (
    <nav
      aria-label="Breadcrumb"
      className="order-2 flex min-w-0 flex-1 items-center gap-1 text-sm"
    >
      {shown.map((crumb, index) => {
        const last = index === shown.length - 1;
        return (
          <span key={`${crumb.href ?? crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
            )}
            {last || !crumb.href ? (
              <span
                aria-current={last ? "page" : undefined}
                className={cn(
                  "truncate",
                  last
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-primary hover:underline"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Reads the trail without recording anything. For a back link, say. */
export function useTrail(): TrailStep[] {
  return useSyncExternalStore(
    subscribeTrail,
    getTrailSnapshot,
    getTrailServerSnapshot
  );
}
