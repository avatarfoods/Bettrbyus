"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import type { PickingResult, PickingRow } from "@/lib/production/picking/types";

function fmt(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "";
  if (Math.abs(value) < 0.05) return "0";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : digits,
  });
}

/**
 * The picking order on paper.
 *
 * Black on white, one section per department (or type), what is on hand in
 * Odoo beside each line, and the totals at the end. The browser's print
 * dialog saves it as a PDF, which is the file people email.
 */
export function PickingPrintSheet({
  result,
  lineName,
  groupBy,
  showAll,
  backHref,
}: {
  result: PickingResult;
  lineName: string | null;
  groupBy: "department" | "type";
  showAll: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const rows = showAll ? result.rows : result.rows.filter((row) => row.need > 0.0001);
  const groups = new Map<string, PickingRow[]>();
  for (const row of rows) {
    const key = (groupBy === "department" ? row.department : row.type) ?? "—";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b)
  );
  const totalCases = rows.reduce((sum, row) => sum + (row.toPick ?? 0), 0);
  const totalLbs = rows.filter((row) => row.unit === "lb").reduce((sum, row) => sum + row.need, 0);

  const when =
    result.mode === "daily"
      ? result.from === result.to
        ? result.from
        : `${result.from} to ${result.to}`
      : `open orders as of ${result.from}`;

  function toggle(key: "group" | "all", value: string) {
    const search = new URLSearchParams(window.location.search);
    search.set(key, value);
    router.push(`/production/picking/print?${search}`);
  }

  return (
    <div className="min-h-full bg-muted/50">
      <div className="sticky top-(--app-bar-height) z-30 flex flex-wrap items-center gap-2 border-b-2 border-b-brand/25 bg-background/95 px-3 py-2 backdrop-blur print:hidden sm:px-4">
        <Link
          href={backHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-card px-2.5 text-sm text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Picking order</h1>
          <p className="truncate text-xs text-muted-foreground">
            {lineName ?? "All lines"} · {when} · portrait, one section per {groupBy}
          </p>
        </div>
        <select
          value={groupBy}
          onChange={(event) => toggle("group", event.target.value)}
          aria-label="Group by"
          className="h-8 rounded-sm bg-card px-2 text-sm ring-1 ring-foreground/10"
        >
          <option value="department">By department</option>
          <option value="type">By type</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => toggle("all", event.target.checked ? "1" : "0")}
            className="size-3.5"
          />
          Show rows with nothing to pick
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Printer className="size-3.5" />
          Print / Save as PDF
        </button>
      </div>

      <div className="flex justify-center px-2 py-4 print:p-0">
        <div
          id="production-print"
          className="w-full max-w-[8.5in] bg-white p-6 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
          style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
        >
          <header className="mb-3 flex items-end justify-between gap-4 border-b-2 border-zinc-700 pb-2">
            <div>
              <h1 className="text-lg font-bold tracking-tight uppercase">Picking order</h1>
              <p className="text-xs">
                {lineName ?? "All lines"} · {when} · {result.extraPct}% extra
              </p>
            </div>
            <div className="text-right text-xs">
              <p>
                <span className="font-semibold">{fmt(totalCases, 0)}</span> cases ·{" "}
                <span className="font-semibold">{fmt(totalLbs, 0)}</span> lb
              </p>
            </div>
          </header>

          {ordered.map(([key, list]) => (
            <section key={key} className="print-keep mb-3">
              <h2 className="mb-1 flex items-baseline gap-2 bg-zinc-800 px-2 py-1 text-[0.6875rem] font-bold tracking-wider text-white uppercase">
                {key}
                <span className="font-normal opacity-70">{list.length}</span>
                <span className="ml-auto font-normal tabular-nums">
                  {fmt(list.reduce((sum, row) => sum + (row.toPick ?? 0), 0), 0)} cs
                </span>
              </h2>
              <table className="w-full border-collapse text-[0.75rem]">
                <thead>
                  <tr className="border-b-2 border-zinc-700 bg-zinc-100 text-[0.5625rem] font-bold tracking-wider text-zinc-700 uppercase">
                    <th className="w-16 py-0.5 text-left">Item #</th>
                    <th className="py-0.5 text-left">Item</th>
                    <th className="w-20 py-0.5 text-center">To pick</th>
                    <th className="w-16 py-0.5 text-right">Pack</th>
                    <th className="w-10 py-0.5 text-left">U/M</th>
                    <th className="w-24 py-0.5 text-right">Requested</th>
                    <th className="w-16 py-0.5 text-right">On hand</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:nth-child(even)]:bg-zinc-50">
                  {list.map((row) => (
                    <tr key={row.materialId} className="border-b border-zinc-200">
                      <td className="py-1.5 font-mono text-[0.6875rem]">{row.itemCode}</td>
                      <td className="py-1.5 font-semibold">{row.name}</td>
                      <td className="py-1.5 text-center text-base font-extrabold tabular-nums">
                        {row.toPick === null ? (row.need > 0 ? "?" : "") : fmt(row.toPick, 0)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{row.packSize === null ? "" : fmt(row.packSize, 2)}</td>
                      <td className="py-1.5">{row.packSize === null ? "" : (row.packUom ?? (row.unit === "lb" ? "lbs" : "unit")).toLowerCase()}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {row.need > 0 ? `${fmt(row.need, 1)} ${row.unit}` : ""}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-black/60">
                        {row.onHand === null ? "" : fmt(row.onHand, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          {rows.length === 0 && (
            <p className="py-10 text-center text-sm">Nothing to pick for {when}.</p>
          )}

          <footer className="mt-4 flex items-center justify-between border-t-2 border-zinc-700 pt-2 text-xs text-zinc-600">
            <span>
              Total <span className="font-bold">{fmt(totalCases, 0)}</span> cases ·{" "}
              <span className="font-bold">{fmt(totalLbs, 0)}</span> lb
            </span>
            <span>Printed {new Date().toLocaleString()}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
