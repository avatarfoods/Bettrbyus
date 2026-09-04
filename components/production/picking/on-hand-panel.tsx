"use client";

import { useEffect, useState } from "react";
import { Boxes, Loader2, X } from "lucide-react";
import {
  fetchMaterialStock,
  type MaterialStock,
} from "@/lib/production/picking/stock-actions";
import type { PickingRow } from "@/lib/production/picking/types";
import { cn } from "@/lib/utils";

function fmt(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : digits,
  });
}

/**
 * What Odoo holds of one material, opened beside the sheet.
 *
 * The on-hand column is one number; this is what is behind it - each lot,
 * how much, when it goes out of date - read live from Odoo for the row that
 * was clicked, the way the plan opens a recipe beside the grid.
 */
export function OnHandPanel({
  row,
  onClose,
}: {
  row: PickingRow;
  onClose: () => void;
}) {
  /*
    What was loaded, and for which row. Derived rather than reset in the
    effect: switching rows shows "Asking Odoo…" on the very first render, with
    no frame of the previous material's lots under the new name.
  */
  const [loaded, setLoaded] = useState<{ id: string; stock: MaterialStock | null } | null>(null);
  const stock = loaded?.id === row.materialId ? loaded.stock : null;
  const loading = loaded?.id !== row.materialId;

  useEffect(() => {
    let cancelled = false;
    fetchMaterialStock(row.materialId).then((result) => {
      if (!cancelled) setLoaded({ id: row.materialId, stock: result });
    });
    return () => {
      cancelled = true;
    };
  }, [row.materialId]);

  const packLabel =
    row.packSize !== null
      ? `${fmt(row.packSize, 2)} ${(row.packUom ?? (row.unit === "lb" ? "lbs" : "unit")).toLowerCase()} per case`
      : "no pack size";

  return (
    <aside className="sticky top-[calc(var(--app-bar-height)+var(--page-shell-height,0px)+0.75rem)] z-30 flex max-h-[calc(100dvh-var(--app-bar-height)-var(--page-shell-height,0px)-1.5rem)] w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-sm bg-card p-3 ring-1 ring-sky-400/40 print:hidden">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.625rem] text-muted-foreground">{row.itemCode}</p>
          <h2 className="text-sm leading-snug font-semibold">{row.name}</h2>
          <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
            {row.department ?? "No department"}
            {row.type && ` · ${row.type}`}
            {row.company && ` · ${row.company}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <section className="rounded-sm bg-sky-50 px-3 py-2 ring-1 ring-sky-400/30 dark:bg-sky-950/30">
        <p className="flex items-center gap-1.5 text-[0.5625rem] font-semibold tracking-wider text-sky-800 uppercase dark:text-sky-200">
          <Boxes className="size-3" />
          On hand in Odoo
        </p>
        {loading ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Asking Odoo…
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-zinc-950 dark:text-white">
              {fmt(stock?.onHand ?? null, 1)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">cases</span>
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">
              {stock?.incoming ? `${fmt(stock.incoming, 1)} coming in` : "nothing coming in"}
              {" · "}
              {stock?.outgoing ? `${fmt(stock.outgoing, 1)} going out` : "nothing going out"}
            </p>
            {stock?.error && (
              <p className="mt-1 text-[0.6875rem] text-destructive">{stock.error}</p>
            )}
          </>
        )}
      </section>

      <section>
        <p className="text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">Lots</p>
        {loading ? null : !stock || stock.lots.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No lots with stock at the plant&apos;s locations.</p>
        ) : (
          <table className="mt-1 w-full border-collapse text-xs">
            <thead>
              <tr className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                <th className="py-0.5 text-left">Lot</th>
                <th className="py-0.5 text-right">Qty</th>
                <th className="py-0.5 text-right">Expires</th>
              </tr>
            </thead>
            <tbody>
              {stock.lots.map((lot) => (
                <tr key={`${lot.lotName}|${lot.expiration ?? ""}`} className="border-t border-border/60">
                  <td className="py-1 font-mono">{lot.lotName}</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{fmt(lot.quantity, 1)}</td>
                  <td className={cn("py-1 text-right tabular-nums", lot.expiration && lot.expiration < new Date().toISOString().slice(0, 10) && "text-destructive")}>
                    {lot.expiration ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Fact label="Requested" value={row.need > 0 ? `${fmt(row.need, 1)} ${row.unit}` : "—"} />
        <Fact label="To pick" value={row.toPick === null ? "—" : `${fmt(row.toPick, 0)} cs`} strong />
        <Fact label="Pack size" value={packLabel} />
        <Fact label="Case" value={row.caseDescription ?? stock?.caseDescription ?? "—"} />
        <Fact label="Storage" value={stock?.storage ?? "—"} />
        <Fact
          label="Last count here"
          value={
            stock?.countedOnHand === null || stock?.countedOnHand === undefined
              ? "—"
              : `${fmt(stock.countedOnHand, 1)} cs${stock.countedAt ? ` · ${stock.countedAt.slice(0, 10)}` : ""}`
          }
        />
      </section>

      {row.sources.length > 0 && (
        <section>
          <p className="text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">Asked for by</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {row.sources.map((source) => (
              <li key={source} className="rounded-sm bg-muted px-1.5 py-px text-[0.6875rem]">
                {source}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
      <span className={cn("tabular-nums", strong && "font-bold")}>{value}</span>
    </span>
  );
}
