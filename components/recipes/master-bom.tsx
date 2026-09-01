"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { BomRow, LineKind } from "@/lib/recipes/catalog";
import {
  DataTable,
  TBody,
  THead,
  TableEmpty,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

/**
 * Master BOM: the whole tree, foldable, in one table.
 *
 * The reference version nests coloured blocks inside coloured blocks, which
 * stops being readable around the third level. Here the hierarchy is carried
 * by indentation and a hairline guide, and what a row *is* is carried by one
 * small chip. Same information, one visual system.
 */

const KIND_LABEL: Record<LineKind, string> = {
  subrecipe: "subrecipe",
  packaging: "packaging",
  material: "material",
  unlinked: "not linked",
};

const KIND_CLASS: Record<LineKind, string> = {
  subrecipe: "bg-brand-muted text-primary",
  packaging: "bg-[oklch(0.95_0.04_300)] text-[oklch(0.42_0.13_300)]",
  material: "bg-muted text-muted-foreground",
  unlinked: "bg-warning-muted text-warning-foreground",
};

export function MasterBom({
  rows,
  rootName,
  rootUom,
}: {
  rows: BomRow[];
  rootName: string;
  rootUom: string | null;
}) {
  const [units, setUnits] = useState("1");
  const [fullExplosion, setFullExplosion] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const multiplier = Number(units) > 0 ? Number(units) : 1;

  /** An item appearing under more than one branch is worth calling out. */
  const sharedNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.code ?? row.name;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key)
    );
  }, [rows]);

  const visible = useMemo(() => {
    if (!fullExplosion) return rows.filter((row) => row.depth === 0);

    // A row is hidden when any ancestor is collapsed.
    const hidden = new Set<string>();
    return rows.filter((row) => {
      if (row.parentKey && (hidden.has(row.parentKey) || collapsed.has(row.parentKey))) {
        hidden.add(row.key);
        return false;
      }
      return true;
    });
  }, [rows, fullExplosion, collapsed]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="min-w-0 px-3 py-3 sm:px-4">
      <h2 className="mb-2 text-[0.6875rem] font-semibold tracking-wider uppercase">
        Master BOM
      </h2>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Units to build</span>
          <input
            inputMode="decimal"
            value={units}
            onChange={(event) => setUnits(event.target.value)}
            className="h-8 w-24 rounded-md border border-border bg-card px-2 text-right tabular-nums"
          />
          <span className="text-muted-foreground">
            {rootUom?.toLowerCase() ?? "unit"}
          </span>
        </label>

        <span className="ml-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Detail
        </span>
        <Toggle active={fullExplosion} onClick={() => setFullExplosion(true)}>
          Full explosion
        </Toggle>
        <Toggle active={!fullExplosion} onClick={() => setFullExplosion(false)}>
          Top level only
        </Toggle>

        {fullExplosion && collapsed.size > 0 && (
          <button
            type="button"
            onClick={() => setCollapsed(new Set())}
            className="h-8 rounded-md px-2.5 text-sm text-primary hover:bg-muted"
          >
            Expand all
          </button>
        )}

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {visible.length} rows
        </span>
      </div>

      <DataTable>
          <THead
            columns={[
              { label: "Item" },
              { label: "Kind" },
              { label: "Qty", numeric: true },
              { label: "U/M" },
              { label: "" },
            ]}
          />
          <TBody>
            {/* The finished product itself, so the tree has a visible root. */}
            <tr className="border-b border-border bg-muted/60">
              <td className="px-2 py-1.5 font-semibold" colSpan={2}>
                {rootName}
              </td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                {fmt(multiplier)}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {rootUom?.toLowerCase() ?? "unit"}
              </td>
              <td />
            </tr>

            {visible.map((row) => {
              const isCollapsed = collapsed.has(row.key);
              const shared = sharedNames.has(row.code ?? row.name);
              return (
                <tr
                  key={row.key}
                  className="border-b border-border/60 hover:bg-accent/40"
                >
                  <td className="px-2 py-1.5">
                    <span
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: `${row.depth * 1.1}rem` }}
                    >
                      {row.hasChildren && fullExplosion ? (
                        <button
                          type="button"
                          onClick={() => toggle(row.key)}
                          aria-expanded={!isCollapsed}
                          aria-label={isCollapsed ? "Expand" : "Collapse"}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </button>
                      ) : (
                        <span className="inline-block size-[1.125rem]" />
                      )}
                      {row.code && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.code}
                        </span>
                      )}
                      <span className={cn(row.depth === 0 && "font-medium")}>
                        {row.name}
                      </span>
                      {shared && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
                          shared
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-[0.6875rem] font-medium",
                        KIND_CLASS[row.kind]
                      )}
                    >
                      {KIND_LABEL[row.kind]}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmt(row.qtyPerUnit * multiplier)}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {row.uom?.toLowerCase() ?? ""}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {row.subRecipeId && (
                      <Link
                        href={`/recipes/${row.subRecipeId}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Open
                        <ExternalLink className="size-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}

            {visible.length === 0 && (
              <TableEmpty colSpan={5}>
                No components below this recipe.
              </TableEmpty>
            )}
          </TBody>
      </DataTable>
    </section>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-md px-2.5 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "border border-border text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
