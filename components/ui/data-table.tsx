"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one table in the app.
 *
 * White rows on a white page gave nothing for the eye to hold onto, which is
 * what made long lists tiring to read. So: the table sits in a bordered card
 * on the grey page, the header band is filled, and every other row is tinted.
 * Those three things do the work - no extra colour needed.
 *
 * Everything (WIP, Users, Recipes, Master BOM) uses this, so the tables cannot
 * drift apart from screen to screen.
 */

export function DataTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-density="compact"
      className={cn(
        "overflow-x-auto overflow-y-hidden rounded-sm border border-zinc-300 bg-card dark:border-zinc-700",
        className
      )}
    >
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export type ColumnSpec = {
  label: React.ReactNode;
  numeric?: boolean;
  onSort?: () => void;
  sorted?: boolean;
  dir?: number;
  /** Hover hint, e.g. "Sort A → Z" on spreadsheet-style headers. */
  title?: string;
  className?: string;
};

export function THead({ columns }: { columns: ColumnSpec[] }) {
  return (
    <thead>
      <tr>
        {columns.map((column, index) => (
          <th
            key={index}
            scope="col"
            title={column.title}
            aria-sort={
              column.onSort && column.sorted
                ? column.dir && column.dir > 0
                  ? "ascending"
                  : "descending"
                : undefined
            }
            onClick={column.onSort}
            className={cn(
              // Grey band with a brand-blue edge, same language as the tab strip.
              "sticky top-0 z-10 border-b-2 border-b-brand/70 bg-brand-muted/50 px-2.5 py-2",
              "text-[0.625rem] font-semibold tracking-wider text-primary uppercase",
              "dark:border-b-brand dark:bg-zinc-800 dark:text-zinc-200",
              column.numeric ? "text-right" : "text-left",
              column.onSort && "cursor-pointer select-none hover:text-foreground",
              column.className
            )}
          >
            <span
              className={cn(
                "inline-flex items-center gap-1",
                column.numeric && "flex-row-reverse"
              )}
            >
              {column.label}
              {column.onSort && column.sorted && (
                <span aria-hidden className="text-[0.5rem] text-primary">
                  {column.dir && column.dir > 0 ? "▲" : "▼"}
                </span>
              )}
            </span>
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** Zebra striping lives here so every table stripes identically. */
export function TBody({ children }: { children: React.ReactNode }) {
  return (
    <tbody className="[&>tr:nth-child(even)]:bg-zinc-50/80 dark:[&>tr:nth-child(even)]:bg-zinc-900/25">{children}</tbody>
  );
}

export function TR({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-zinc-100 last:border-b-0 dark:border-zinc-800",
        "hover:bg-brand-muted/40 dark:hover:bg-zinc-900/60",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  numeric,
  muted,
  mono,
  strong,
  colSpan,
  className,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  muted?: boolean;
  mono?: boolean;
  strong?: boolean;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-2.5 py-1.5 align-middle",
        numeric && "text-right tabular-nums",
        muted && "text-muted-foreground",
        mono && "font-mono text-xs",
        strong && "font-medium",
        className
      )}
    >
      {children}
    </td>
  );
}

export function TableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-2.5 py-10 text-center text-muted-foreground"
      >
        {children}
      </td>
    </tr>
  );
}

/** Section heading used above every table, so they all sit the same way. */
export function TableTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wider text-primary uppercase">
        <span aria-hidden className="h-3 w-0.5 rounded-[1px] bg-brand" />
        {children}
      </h2>
      {aside && (
        <span className="text-xs text-muted-foreground">{aside}</span>
      )}
    </div>
  );
}
