"use client";

import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchMovingsForOut } from "@/lib/movings/fetch-movings-out";
import {
  aggregateAvailableByItem,
  formatItemLabel,
  type ItemAvailableTotal,
} from "@/lib/movings/aggregate-available";
import type { MovingRecord } from "@/lib/movings/types";
import { cn } from "@/lib/utils";

type AvailableItemsSummaryProps = {
  movings?: MovingRecord[];
  className?: string;
};

export function AvailableItemsSummary({
  movings: movingsProp,
  className,
}: AvailableItemsSummaryProps) {
  const [movings, setMovings] = useState<MovingRecord[]>(movingsProp ?? []);
  const [isLoading, setIsLoading] = useState(!movingsProp);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (movingsProp) {
      setMovings(movingsProp);
      setIsLoading(false);
      return;
    }

    let active = true;
    (async () => {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();
      const result = await fetchMovingsForOut(supabase);
      if (!active) return;
      if (result.error) setError(result.error);
      setMovings(result.data);
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [movingsProp]);

  const totals = useMemo(() => aggregateAvailableByItem(movings), [movings]);
  const grandTotal = useMemo(
    () => totals.reduce((sum, row) => sum + row.totalAmount, 0),
    [totals]
  );

  if (isLoading) {
    return (
      <div className={cn("rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground", className)}>
        Loading available totals…
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive", className)}>
        Could not load available totals: {error}
      </div>
    );
  }

  if (totals.length === 0) {
    return (
      <div className={cn("rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground", className)}>
        No items currently available in thaw.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Available by item</p>
        <p className="text-sm text-muted-foreground">
          {grandTotal} total across {totals.length} item{totals.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {totals.map((row) => (
          <AvailableItemCard key={row.itemId} row={row} />
        ))}
      </div>
    </div>
  );
}

function AvailableItemCard({ row }: { row: ItemAvailableTotal }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Package className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{formatItemLabel(row)}</p>
        <p className="text-xs text-muted-foreground">
          {row.lotCount} lot{row.lotCount === 1 ? "" : "s"} in thaw
        </p>
      </div>
      <p className="text-lg font-semibold tabular-nums">{row.totalAmount}</p>
    </div>
  );
}
