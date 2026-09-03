import { Suspense } from "react";
import Link from "next/link";
import { NavTrail } from "@/components/app-shell/nav-trail";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Odoo control panel, ported.
 *
 * Every list and form page gets the same three-part frame: actions on the
 * left, breadcrumb telling you where you are, then search and a record count
 * on the right. Content below runs the full width of the window rather than
 * sitting in a centred column - on a 1920px screen a 1100px box wastes half
 * the display, which is most of why the app felt scattered.
 */

export type Crumb = {
  label: string;
  href?: string;
};

type PageShellProps = {
  /**
   * Where this page sits, used until the live trail takes over.
   *
   * The rendered breadcrumb is a record of how somebody actually got here -
   * see NavTrail - so these are the fallback for a first load, and the last
   * one supplies this page's own crumb label.
   */
  breadcrumbs: Crumb[];
  /** True for an app's own home: arriving here starts the trail again. */
  trailRoot?: boolean;
  /** Primary actions, e.g. a New button. Sits left of the breadcrumb. */
  actions?: React.ReactNode;
  /** Search input and filter chips. */
  search?: React.ReactNode;
  /** Record count or pager, far right. */
  meta?: React.ReactNode;
  /** Full-bleed content; supply your own padding via contentClassName. */
  children: React.ReactNode;
  contentClassName?: string;
  /**
   * Fill the window under the app bar and keep the page from growing.
   * Used by the planning grid so its date headers can freeze while the
   * rows scroll.
   */
  fillViewport?: boolean;
};

export function PageShell({
  breadcrumbs,
  trailRoot,
  actions,
  search,
  meta,
  children,
  contentClassName,
  fillViewport,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col",
        fillViewport
          ? "h-[calc(100dvh-var(--app-bar-height))] min-h-0 overflow-hidden"
          : "min-h-full"
      )}
    >
      {/*
        Above the grid, below the app bar.

        The planning grid freezes columns and date headers at z-40, so a
        header at z-30 sat underneath them - and anything opening out of it,
        like the plan picker, was drawn behind the frozen cells.
      */}
      <div className="sticky top-(--app-bar-height) z-45 border-b-2 border-b-brand/25 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
          {actions && (
            <div className="order-1 flex shrink-0 items-center gap-2">
              {actions}
            </div>
          )}

          <Suspense fallback={<Breadcrumbs items={breadcrumbs} />}>
            <NavTrail
              label={breadcrumbs[breadcrumbs.length - 1]?.label ?? "Page"}
              root={trailRoot}
              fallback={breadcrumbs}
            />
          </Suspense>

          {search && (
            <div className="order-4 w-full min-w-0 sm:order-3 sm:ml-auto sm:w-auto sm:max-w-md sm:flex-1">
              {search}
            </div>
          )}

          {meta && (
            <div
              className={cn(
                "order-3 ml-auto shrink-0 text-xs text-muted-foreground sm:order-4",
                // Only give up the right edge when a search box has claimed it;
                // otherwise the meta ends up crammed against the breadcrumb.
                search && "sm:ml-0"
              )}
            >
              {meta}
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "flex-1",
          fillViewport && "min-h-0 overflow-hidden",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="order-2 flex min-w-0 items-center gap-1 text-sm"
    >
      {items.map((crumb, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && (
              <ChevronRight
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground/60"
              />
            )}
            {crumb.href && !last ? (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={last ? "page" : undefined}
                className={cn(
                  "truncate",
                  last ? "font-semibold" : "text-muted-foreground"
                )}
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
