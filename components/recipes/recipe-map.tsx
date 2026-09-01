"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { BomRow, LineKind } from "@/lib/recipes/catalog";
import { cn } from "@/lib/utils";

/**
 * The recipe map: the same picture the demo builder drew, but of the real
 * imported BOM instead of a localStorage workspace.
 *
 * Read-only on purpose. The demo's canvas let you drag nodes and rewire edges
 * because it owned its data; these recipes come from the master workbook, so
 * the map shows structure and links through to each recipe rather than
 * pretending edits here would stick.
 */

const CARD_W = 216;
const CARD_H = 54;
const GAP_X = 76;
const GAP_Y = 12;

const KIND_ACCENT: Record<LineKind, string> = {
  subrecipe: "border-l-brand",
  packaging: "border-l-[oklch(0.62_0.13_300)]",
  material: "border-l-border",
  unlinked: "border-l-warning",
};

type Placed = {
  key: string;
  parentKey: string | null;
  row: BomRow | null;
  x: number;
  y: number;
};

export function RecipeMap({
  rows,
  rootName,
  rootCode,
  rootUom,
}: {
  rows: BomRow[];
  rootName: string;
  rootCode: string;
  rootUom: string | null;
}) {
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 24, y: 16 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const { placed, edges, width, height } = useMemo(
    () => layout(rows),
    [rows]
  );

  function onPointerDown(event: React.PointerEvent) {
    // Let clicks on the cards through; only empty canvas pans.
    if ((event.target as HTMLElement).closest("[data-node]")) return;
    dragging.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragging.current) return;
    setPan({
      x: event.clientX - dragging.current.x,
      y: event.clientY - dragging.current.y,
    });
  }

  return (
    <section className="min-w-0 px-3 py-3 sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[0.6875rem] font-semibold tracking-wider uppercase">
          Map
        </h2>
        <div className="flex items-center gap-1">
          <IconButton
            label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.35, z - 0.15))}
          >
            <Minus className="size-3.5" />
          </IconButton>
          <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            label="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
          >
            <Plus className="size-3.5" />
          </IconButton>
          <IconButton
            label="Reset view"
            onClick={() => {
              setZoom(0.85);
              setPan({ x: 24, y: 16 });
            }}
          >
            <Maximize2 className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
        className="relative h-[32rem] cursor-grab overflow-hidden rounded-lg border border-border bg-muted/40 active:cursor-grabbing"
      >
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width,
            height,
          }}
        >
          <svg
            width={width}
            height={height}
            className="absolute inset-0 overflow-visible"
            aria-hidden
          >
            {edges.map((edge) => (
              <path
                key={edge.key}
                d={edge.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.25}
                className="text-border"
              />
            ))}
          </svg>

          {/* Root */}
          <MapCard
            x={0}
            y={placed.find((p) => p.key === "__root__")?.y ?? 0}
            title={rootName}
            code={rootCode}
            meta={`1 ${rootUom?.toLowerCase() ?? "unit"}`}
            accent="border-l-foreground"
            strong
          />

          {placed
            .filter((node) => node.row)
            .map((node) => {
              const row = node.row as BomRow;
              const card = (
                <MapCard
                  x={node.x}
                  y={node.y}
                  title={row.name}
                  code={row.code ?? ""}
                  meta={`${fmt(row.qtyPerUnit)} ${row.uom?.toLowerCase() ?? ""}`}
                  accent={KIND_ACCENT[row.kind]}
                />
              );
              return row.subRecipeId ? (
                <Link
                  key={node.key}
                  href={`/recipes/${row.subRecipeId}`}
                  className="contents"
                >
                  {card}
                </Link>
              ) : (
                <div key={node.key} className="contents">
                  {card}
                </div>
              );
            })}
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Drag to pan. Subrecipe cards link through to their own recipe.
      </p>
    </section>
  );
}

function MapCard({
  x,
  y,
  title,
  code,
  meta,
  accent,
  strong,
}: {
  x: number;
  y: number;
  title: string;
  code: string;
  meta: string;
  accent: string;
  strong?: boolean;
}) {
  return (
    <div
      data-node
      style={{ left: x, top: y, width: CARD_W, height: CARD_H }}
      className={cn(
        "absolute flex flex-col justify-center gap-0.5 rounded-md border border-l-4 border-border bg-card px-2.5 py-1.5",
        "shadow-sm transition-colors hover:bg-accent/50",
        accent
      )}
    >
      <div className="flex items-baseline gap-1.5">
        {code && (
          <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
            {code}
          </span>
        )}
        <span
          className={cn(
            "truncate text-xs",
            strong ? "font-bold" : "font-medium"
          )}
          title={title}
        >
          {title}
        </span>
      </div>
      <span className="text-[0.625rem] tabular-nums text-muted-foreground">
        {meta}
      </span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

/**
 * Tidy tree layout: leaves take the next free row, parents centre on their
 * children. Keeps sibling groups visually together instead of letting deep
 * branches drift apart.
 */
function layout(rows: BomRow[]) {
  const childrenOf = new Map<string, BomRow[]>();
  for (const row of rows) {
    const key = row.parentKey ?? "__root__";
    const bucket = childrenOf.get(key);
    if (bucket) bucket.push(row);
    else childrenOf.set(key, [row]);
  }

  const placed: Placed[] = [];
  const yByKey = new Map<string, number>();
  let cursor = 0;

  function walk(key: string, row: BomRow | null, depth: number): number {
    const children = childrenOf.get(key) ?? [];

    let y: number;
    if (children.length === 0) {
      y = cursor * (CARD_H + GAP_Y);
      cursor += 1;
    } else {
      const childYs = children.map((child) =>
        walk(child.key, child, depth + 1)
      );
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }

    yByKey.set(key, y);
    placed.push({
      key,
      parentKey: row?.parentKey ?? null,
      row,
      x: depth * (CARD_W + GAP_X),
      y,
    });
    return y;
  }

  walk("__root__", null, 0);

  const edges = placed
    .filter((node) => node.key !== "__root__")
    .map((node) => {
      const parentKey = node.parentKey ?? "__root__";
      const parentY = yByKey.get(parentKey) ?? 0;
      const parentDepth = node.row ? node.row.depth : 0;
      const x1 = parentDepth * (CARD_W + GAP_X) + CARD_W;
      const y1 = parentY + CARD_H / 2;
      const x2 = node.x;
      const y2 = node.y + CARD_H / 2;
      const mid = x1 + (x2 - x1) / 2;
      return {
        key: `e-${node.key}`,
        d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
      };
    });

  const maxDepth = rows.reduce((max, row) => Math.max(max, row.depth), 0);
  return {
    placed,
    edges,
    width: (maxDepth + 1) * (CARD_W + GAP_X) + CARD_W,
    height: Math.max(cursor, 1) * (CARD_H + GAP_Y) + CARD_H,
  };
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
