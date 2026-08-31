"use client";

import { useState, useTransition } from "react";
import { Check, Factory, Loader2 } from "lucide-react";
import { markOnProduction, saveCompletionDate } from "@/lib/orders/actions";
import { PROGRESS_ON_PRODUCTION } from "@/lib/odoo/constants";
import type { OrderRow, OrderStatus } from "@/lib/orders/model";
import { cn } from "@/lib/utils";

/** Status colours follow the spreadsheet: green running, purple unplanned, red late. */
const STATUS_CLASS: Record<OrderStatus, string> = {
  "ON-GOING": "bg-success-muted text-success",
  "TO BE SCHEDULED":
    "bg-[oklch(0.95_0.04_300)] text-[oklch(0.40_0.13_300)] dark:bg-[oklch(0.33_0.06_300)] dark:text-[oklch(0.86_0.08_300)]",
  DELAYED: "bg-destructive/12 text-destructive",
  FINISHED: "bg-muted text-muted-foreground",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap",
        STATUS_CLASS[status]
      )}
    >
      {status}
    </span>
  );
}

export function fmt(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Short, unambiguous date. Fixed to UTC so it cannot shift a day by timezone. */
export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

/**
 * The Completion Date cell. Editing it writes straight to Odoo - this is the
 * field the plant owns, and the whole reason for not keeping a second copy in
 * a spreadsheet.
 */
export function CompletionDateCell({ row }: { row: OrderRow }) {
  const [value, setValue] = useState(row.completionDate ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit(next: string) {
    if (next === (row.completionDate ?? "")) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveCompletionDate(row.pickingId, next || null);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      } else {
        setError(result.message);
        setValue(row.completionDate ?? "");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="date"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        aria-label={`Completion date for ${row.saleOrder ?? row.pickingName}`}
        title={error ?? "Writes to Odoo"}
        className={cn(
          "h-7 w-[8.5rem] rounded border bg-card px-1.5 text-xs tabular-nums",
          error ? "border-destructive" : "border-border"
        )}
      />
      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      {saved && !pending && <Check className="size-3.5 text-success" />}
    </span>
  );
}

/** Sends the transfer to "2. On Production" in Odoo. */
export function OnProductionButton({ row }: { row: OrderRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const already = row.progress === PROGRESS_ON_PRODUCTION;

  if (already) {
    return (
      <span className="inline-flex items-center gap-1 text-[0.6875rem] text-success whitespace-nowrap">
        <Factory className="size-3" />
        On production
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      title={error ?? "Set Progress to 2. On Production in Odoo"}
      onClick={() =>
        startTransition(async () => {
          const result = await markOnProduction(row.pickingId);
          if (!result.ok) setError(result.message);
        })
      }
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[0.6875rem] whitespace-nowrap transition-colors",
        error
          ? "border-destructive text-destructive"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
        pending && "opacity-60"
      )}
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Factory className="size-3" />
      )}
      Start
    </button>
  );
}

/** A number that means something: emphasised when there is work to do. */
export function Metric({
  label,
  value,
  tone = "plain",
  suffix,
}: {
  label: string;
  value: number | string;
  tone?: "plain" | "good" | "warn" | "bad";
  suffix?: string;
}) {
  const toneClass = {
    plain: "text-foreground",
    good: "text-success",
    warn: "text-warning-foreground",
    bad: "text-destructive",
  }[tone];

  return (
    <div className="rounded-lg border border-border border-t-2 border-t-brand/50 bg-card px-3 py-2">
      <div className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className={cn("mt-0.5 text-lg leading-tight font-bold tabular-nums", toneClass)}>
        {typeof value === "number" ? fmt(value) : value}
        {suffix && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
