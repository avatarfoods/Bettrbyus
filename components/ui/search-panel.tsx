"use client";

import { useMemo } from "react";
import { Check, Filter, Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Search + filters for list pages.
 *
 * The field is for typing. Filters are a separate button that opens a short
 * list — not a three-column Odoo panel. Active filters show as pills you can
 * pull off. Grouping stays on the page (By product / By order, etc.).
 */

export type SearchFilterItem = {
  id: string;
  label: string;
};

export type SearchFilterGroup = {
  /** When true, at most one item in the group can be on (radio). */
  exclusive?: boolean;
  items: SearchFilterItem[];
};

export function SearchPanel({
  query,
  onQueryChange,
  placeholder = "Search…",
  "aria-label": ariaLabel = "Search",
  filterGroups = [],
  filters,
  onFiltersChange,
  className,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  filterGroups?: SearchFilterGroup[];
  filters: string[];
  onFiltersChange: (filters: string[]) => void;
  className?: string;
}) {
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of filterGroups) {
      for (const item of group.items) map.set(item.id, item.label);
    }
    return map;
  }, [filterGroups]);

  function toggleFilter(id: string) {
    const group = filterGroups.find((entry) =>
      entry.items.some((item) => item.id === id)
    );
    const groupIds = new Set(group?.items.map((item) => item.id) ?? [id]);
    const on = filters.includes(id);
    let next: string[];
    if (group?.exclusive) {
      next = filters.filter((value) => !groupIds.has(value));
      if (!on) next.push(id);
    } else if (on) {
      next = filters.filter((value) => value !== id);
    } else {
      next = [...filters, id];
    }
    onFiltersChange(next);
  }

  const hasFilters = filterGroups.some((group) => group.items.length > 0);

  return (
    <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:max-w-2xl", className)}>
      <div className="flex h-8 min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden rounded-sm border border-zinc-300 bg-card dark:border-zinc-600">
        <Search className="pointer-events-none ml-2.5 size-3.5 shrink-0 text-zinc-500" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden py-0.5 pr-2 pl-2">
          {filters.map((id) => (
            <span
              key={id}
              className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-brand-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary"
            >
              {labels.get(id) ?? id}
              <button
                type="button"
                aria-label={`Remove ${labels.get(id) ?? id}`}
                onClick={() => toggleFilter(id)}
                className="rounded text-primary/70 hover:text-primary"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={filters.length ? "" : placeholder}
            aria-label={ariaLabel}
            className="h-7 min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
        </div>
      </div>

      {hasFilters && (
        <Popover>
          <PopoverTrigger
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-sm font-medium",
              filters.length > 0
                ? "border-brand bg-brand text-brand-foreground"
                : "border-zinc-300 bg-card text-primary hover:bg-brand-muted dark:border-zinc-600"
            )}
          >
            <Filter className="size-3.5" />
            Filter
            {filters.length > 0 && (
              <span className="tabular-nums opacity-90">{filters.length}</span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 rounded-sm p-1">
            {filterGroups.map((group, index) => (
              <div key={index}>
                {index > 0 && <div className="mx-1 my-1 border-t border-border" />}
                {group.items.map((item) => {
                  const active = filters.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleFilter(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                        active
                          ? "bg-brand-muted font-medium text-primary"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      )}
                    >
                      <span className="inline-flex size-4 shrink-0 items-center justify-center">
                        {active && <Check className="size-3.5 text-primary" />}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
