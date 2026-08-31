"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * One dataset, two renderings: a real table on iPad and desktop, a list of
 * cards on phones. Column definitions are shared, so the two can never drift.
 *
 * Phone cards show the columns marked `primary`; everything else moves into a
 * label/value list underneath. A table squeezed onto a 390px screen is either
 * unreadable or a horizontal-scroll guessing game, and most of these screens
 * get used one-handed on the floor.
 *
 * Genuinely grid-shaped data (the purchasing matrix, where the point is
 * comparing across columns) should NOT use this - use `scrollOnMobile` so it
 * stays a table and scrolls sideways with a frozen first column.
 */

export type ResponsiveColumn<T> = {
  /** Stable identity for the column. */
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Shown in the card header on phones. Everything else goes in the body. */
  primary?: boolean;
  /** Hidden entirely on phones - noise that only helps in a wide table. */
  hideOnCard?: boolean;
  headClassName?: string;
  cellClassName?: string;
};

type ResponsiveTableProps<T> = {
  data: readonly T[];
  columns: readonly ResponsiveColumn<T>[];
  getRowKey: (row: T, index: number) => React.Key;
  /** Rendered in place of everything when there is nothing to show. */
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /**
   * Keep the table on phones and scroll it horizontally instead of switching
   * to cards. For matrices where cross-column comparison is the whole point.
   */
  scrollOnMobile?: boolean;
  className?: string;
};

export function ResponsiveTable<T>({
  data,
  columns,
  getRowKey,
  empty,
  onRowClick,
  scrollOnMobile = false,
  className,
}: ResponsiveTableProps<T>) {
  if (data.length === 0 && empty) {
    return <div className={cn("py-10 text-center", className)}>{empty}</div>;
  }

  const cardColumns = columns.filter((column) => !column.hideOnCard);
  const primary = cardColumns.filter((column) => column.primary);
  const secondary = cardColumns.filter((column) => !column.primary);

  return (
    <div className={className}>
      <div
        className={cn(
          "overflow-x-auto",
          // The table is the only view when scrolling; otherwise it starts at md.
          scrollOnMobile ? "block" : "hidden md:block"
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.headClassName}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => (
              <TableRow
                key={getRowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} className={column.cellClassName}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!scrollOnMobile && (
        <ul className="flex flex-col gap-2.5 md:hidden">
          {data.map((row, index) => {
            const key = getRowKey(row, index);
            const content = (
              <>
                {primary.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {primary.map((column) => (
                      <div key={column.key} className={column.cellClassName}>
                        {column.cell(row)}
                      </div>
                    ))}
                  </div>
                )}
                {secondary.length > 0 && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    {secondary.map((column) => (
                      <React.Fragment key={column.key}>
                        <dt className="text-muted-foreground">{column.header}</dt>
                        <dd className={cn("text-right", column.cellClassName)}>
                          {column.cell(row)}
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                )}
              </>
            );

            return (
              <li key={key}>
                {onRowClick ? (
                  <button
                    type="button"
                    data-slot="button"
                    onClick={() => onRowClick(row)}
                    className={cn(
                      "flex w-full flex-col gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors",
                      "hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    )}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
