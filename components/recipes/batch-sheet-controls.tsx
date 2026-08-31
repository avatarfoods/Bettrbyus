"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { batchPlan } from "@/lib/recipes/yield";

/**
 * How much to print for, and for when.
 *
 * Screen-only - it never reaches paper. Typing the scheduled quantity here is
 * what drives the multiplier on the sheet, so you can see 2,000 lb of a 200 lb
 * batch resolve to 10 full batches before anyone prints it.
 */
export function BatchSheetControls({
  recipeId,
  quantity,
  date,
  uom,
  batchYield,
}: {
  recipeId: string;
  quantity: number | null;
  date: string;
  uom: string;
  batchYield: number | null;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(quantity === null ? "" : String(quantity));
  const [day, setDay] = useState(date);

  const preview = batchPlan(qty === "" ? null : Number(qty), batchYield);

  function apply(nextQty: string, nextDate: string) {
    const params = new URLSearchParams({ date: nextDate });
    if (nextQty.trim() !== "") params.set("qty", nextQty.trim());
    router.push(`/recipes/${recipeId}/print?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-0.5">
        <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Print for
        </span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            step="any"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            onBlur={() => apply(qty, day)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply(qty, day);
            }}
            placeholder="quantity"
            aria-label="Scheduled quantity"
            className="h-8 w-28 rounded-md border border-border bg-card px-2 text-right text-sm tabular-nums"
          />
          <span className="text-xs text-muted-foreground">{uom}</span>
        </span>
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Production date
        </span>
        <input
          type="date"
          value={day}
          onChange={(event) => {
            setDay(event.target.value);
            apply(qty, event.target.value);
          }}
          aria-label="Production date"
          className="h-8 rounded-md border border-border bg-card px-2 text-sm"
        />
      </label>

      {preview.fullBatches !== null && (
        <span className="pb-1 text-xs text-muted-foreground">
          <strong className="text-foreground tabular-nums">
            {preview.fullBatches}
          </strong>{" "}
          full
          {(preview.finalBatch ?? 0) > 0.005 && (
            <>
              {" + "}
              <strong className="text-foreground tabular-nums">
                {preview.finalBatch!.toFixed(1)}
              </strong>{" "}
              final
            </>
          )}
        </span>
      )}
    </div>
  );
}
