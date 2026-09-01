"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Loader2, Search } from "lucide-react";
import { saveProductionLine } from "@/lib/production/config-actions";
import type { ProductionConfig, ProductionLine } from "@/lib/production/config";
import type { OdooCategory } from "@/lib/odoo/orders";
import {
  FallbackBanner,
  Notice,
  primaryButton,
  useConfigRunner,
} from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * Where the order schedule pulls each tab's products from.
 *
 * This is the setting that makes the app work for a plant other than this one:
 * a line points at Odoo product categories, and everything downstream follows
 * from that link. A line can take several categories - somebody may want one
 * tab showing Bettr Bowl and Pita together - so this is a multi-select, not a
 * single choice. Categories are listed by name; nobody should have to know
 * that Bettr Bowl is id 80.
 */
export function OrdersSettings({
  config,
  categories,
  categoriesError,
}: {
  config: ProductionConfig;
  categories: OdooCategory[];
  categoriesError: string | null;
}) {
  const { run, pending, notice } = useConfigRunner();
  const [drafts, setDrafts] = useState<Record<string, number[]>>({});
  const [query, setQuery] = useState("");

  const selectionFor = (line: ProductionLine): number[] =>
    drafts[line.id] ?? line.odooCategoryIds;

  const dirty = (line: ProductionLine) => {
    const draft = drafts[line.id];
    if (!draft) return false;
    const a = [...draft].sort().join(",");
    const b = [...line.odooCategoryIds].sort().join(",");
    return a !== b;
  };

  function toggle(line: ProductionLine, categoryId: number) {
    setDrafts((prev) => {
      const current = prev[line.id] ?? line.odooCategoryIds;
      const next = current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId];
      return { ...prev, [line.id]: next };
    });
  }

  function save(line: ProductionLine) {
    const selection = selectionFor(line);
    run(
      () =>
        saveProductionLine({
          id: line.id.startsWith("fallback-") ? undefined : line.id,
          key: line.key,
          name: line.name,
          odooCategoryIds: selection,
          sortOrder: line.sortOrder,
          active: line.active,
        }),
      `${line.name} updated`
    );
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[line.id];
      return next;
    });
  }

  const visibleCategories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((category) =>
      `${category.name} ${category.fullName}`.toLowerCase().includes(needle)
    );
  }, [categories, query]);

  return (
    <div className="flex flex-col gap-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Tick every Odoo category a line should pull from. A line can take
          more than one, so a single tab can cover two product families.
          Which warehouses those orders come from is set under{" "}
          <Link
            href="/production/settings/warehouses"
            className="font-medium text-primary hover:underline"
          >
            Settings → Warehouses
          </Link>
          .
        </p>
        {categories.length > 6 && (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter categories…"
              aria-label="Filter categories"
              className="h-8 w-full rounded-md border border-border bg-card pr-2 pl-8 text-sm"
            />
          </div>
        )}
      </div>

      <FallbackBanner show={config.usingFallback} />

      {categoriesError && (
        <div className="flex items-start gap-2.5 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Could not read categories from Odoo: {categoriesError}</span>
        </div>
      )}

      <Notice notice={notice} />

      {/* One card per line, filling the width - a settings page has no reason
          to sit in a narrow column while half the screen goes unused. */}
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {config.lines.map((line) => {
          const selection = selectionFor(line);
          const changed = dirty(line);

          return (
            <section
              key={line.id}
              className={cn(
                "flex flex-col rounded-lg border bg-card",
                changed ? "border-primary" : "border-border"
              )}
            >
              <header className="flex items-center gap-2 border-b border-border bg-brand-muted/60 px-3 py-2">
                <span className="size-2 shrink-0 rounded-[1px] bg-brand" />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {line.name}
                </span>
                {selection.length > 0 ? (
                  <span className="shrink-0 rounded-[1px] bg-card px-2 py-0.5 text-[0.6875rem] font-medium text-primary">
                    {selection.length} linked
                  </span>
                ) : (
                  <span className="shrink-0 text-[0.6875rem] font-medium text-warning-foreground">
                    Tab will be empty
                  </span>
                )}
              </header>

              <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto p-2">
                {visibleCategories.map((category) => {
                  const checked = selection.includes(category.id);
                  return (
                    <label
                      key={category.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        checked ? "bg-accent/70" : "hover:bg-muted"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(line, category.id)}
                        className="size-3.5 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate" title={category.fullName}>
                        {category.name}
                      </span>
                      <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
                        {category.id}
                      </span>
                    </label>
                  );
                })}

                {visibleCategories.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    {categories.length === 0
                      ? "No categories read from Odoo."
                      : "No category matches that filter."}
                  </p>
                )}
              </div>

              {changed && (
                <footer className="flex justify-end border-t border-border p-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => save(line)}
                    className={primaryButton}
                  >
                    {pending && <Loader2 className="size-3.5 animate-spin" />}
                    Save {line.name}
                  </button>
                </footer>
              )}
            </section>
          );
        })}

        {config.lines.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No lines yet. Add one under Settings → Lines first.
          </p>
        )}
      </div>

      {config.lines.some((line) => line.odooCategoryIds.length > 0) && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3.5 text-success" />
          A product can belong to two lines at once — it will simply appear on
          both tabs.
        </p>
      )}
    </div>
  );
}
