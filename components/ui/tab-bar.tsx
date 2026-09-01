"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The one tab style for the whole app.
 *
 * Every tabbed screen imports this rather than styling its own strip, so
 * Recipes, Settings and anything added later look the same. Taken from
 * avatar-production_8.html: a white strip, a hairline under the whole row, and
 * the active tab marked by a blue underline that sits on that hairline.
 *
 * Two flavours share one look - `TabBar` for URL-driven tabs, `ButtonTabBar`
 * for local state. Use TabBar when a tab is worth linking to or reloading on.
 */

export type TabItem = {
  id: string;
  label: string;
  /** Optional trailing count, e.g. Ingredients (12). */
  count?: number;
};

const STRIP =
  "flex items-end gap-0 overflow-x-auto overflow-y-hidden border-b border-border bg-card px-3 sm:px-4";

function tabClass(active: boolean): string {
  return cn(
    "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors",
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    active
      ? "border-brand font-semibold text-primary"
      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
  );
}

function Label({ item }: { item: TabItem }) {
  return (
    <>
      {item.label}
      {item.count != null && (
        <span className="ml-1.5 text-xs tabular-nums opacity-70">
          {item.count}
        </span>
      )}
    </>
  );
}

/** Tabs that change the URL. */
export function TabBar({
  items,
  activeId,
  hrefFor,
  className,
}: {
  items: readonly TabItem[];
  activeId: string;
  hrefFor: (id: string) => string;
  className?: string;
}) {
  return (
    <nav className={cn(STRIP, className)} aria-label="Sections">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Link
            key={item.id}
            href={hrefFor(item.id)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={tabClass(active)}
          >
            <Label item={item} />
          </Link>
        );
      })}
    </nav>
  );
}

/** Tabs held in local state. */
export function ButtonTabBar({
  items,
  activeId,
  onSelect,
  className,
}: {
  items: readonly TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn(STRIP, className)} role="tablist">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.id)}
            className={tabClass(active)}
          >
            <Label item={item} />
          </button>
        );
      })}
    </div>
  );
}

/** Padding wrapper so every tab's body starts at the same place. */
export function TabBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-3 py-4 sm:px-4", className)}>{children}</div>
  );
}
