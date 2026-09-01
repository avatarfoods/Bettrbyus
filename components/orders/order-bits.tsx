"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2 } from "lucide-react";
import { saveCompletionDate } from "@/lib/orders/actions";
import type { OrderRow, OrderStatus, ProductLotExtra } from "@/lib/orders/model";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<OrderStatus, string> = {
  "ON-GOING": "bg-brand-muted text-primary",
  "TO BE SCHEDULED": "bg-muted text-foreground",
  DELAYED: "bg-destructive/12 text-destructive",
  FINISHED: "bg-muted text-muted-foreground",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-[1px] px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap",
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
 * The Completion Date cell. Editing it writes straight to Odoo — this is the
 * field the plant owns from this screen.
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
    <span
      className="inline-flex items-center gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="date"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        aria-label={`Completion date for ${row.saleOrder ?? row.pickingName}`}
        title={error ?? "Writes the completion date to Odoo"}
        className={cn(
          "h-7 w-[9.5rem] rounded border bg-card px-1.5 text-xs tabular-nums",
          error ? "border-destructive" : "border-border"
        )}
      />
      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      {saved && !pending && <Check className="size-3.5 text-success" />}
    </span>
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
    <div className="rounded-sm border border-zinc-300 border-t-2 border-t-brand bg-card px-3 py-2 dark:border-zinc-600">
      <div className="text-[0.625rem] font-semibold tracking-wider text-primary uppercase">
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

/**
 * Same "?" language as the schedule grid: a mark that needs explaining.
 * Hover (or focus) opens the detail so the table itself stays quiet.
 */
export function HintMark({
  label,
  tone = "muted",
  children,
}: {
  label: string;
  tone?: "success" | "danger" | "muted";
  children: ReactNode;
}) {
  const markRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function show() {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    const rect = markRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 240;
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
    setOpen(true);
  }

  function hide() {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  const markClass = {
    success: "bg-success text-white",
    danger: "bg-destructive text-white",
    muted: "bg-zinc-500 text-white",
  }[tone];

  return (
    <span
      className="inline-flex items-center justify-end"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={markRef}
        type="button"
        aria-label={label}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={cn(
          "inline-flex size-3.5 shrink-0 cursor-help items-center justify-center rounded-[1px] text-[0.5625rem] font-bold",
          markClass
        )}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={hide}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 w-60 rounded-md border border-zinc-300 bg-popover px-2.5 py-2 text-left text-xs text-popover-foreground shadow-md dark:border-zinc-600"
          >
            {children}
          </div>,
          document.body
        )}
    </span>
  );
}

/** Leftover cases by lot after open orders are covered. */
export function CoveredHint({
  surplus,
  uom,
  lots,
}: {
  surplus: number;
  uom: string | null;
  lots: ProductLotExtra[];
}) {
  const unit = (uom ?? "cs").toLowerCase();

  return (
    <HintMark label="Extra on hand by lot" tone="success">
      <p className="font-semibold text-success">
        {surplus > 0.0001
          ? `${fmt(surplus)} extra ${unit} on hand`
          : "On hand matches the orders"}
      </p>
      {lots.length > 0 ? (
        <ul className="mt-1.5 divide-y divide-border">
          {lots.map((lot, index) => (
            <li
              key={`${lot.lotName}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 py-1"
            >
              <span className="min-w-0 truncate font-mono">{lot.lotName}</span>
              <span className="shrink-0 text-muted-foreground">
                {lot.expiration ? shortDate(lot.expiration) : ""}
              </span>
              <span className="shrink-0 tabular-nums font-medium">
                {fmt(lot.extra)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        surplus > 0.0001 && (
          <p className="mt-1 text-muted-foreground">No lot numbers on this stock.</p>
        )
      )}
    </HintMark>
  );
}

/** Product-row status: late / unplanned live behind the mark, not in the cell. */
export function GroupStatusHint({
  lateCount,
  unscheduledCount,
}: {
  lateCount: number;
  unscheduledCount: number;
}) {
  if (lateCount === 0 && unscheduledCount === 0) return null;

  return (
    <HintMark
      label="Order status"
      tone={lateCount > 0 ? "danger" : "muted"}
    >
      <ul className="space-y-0.5">
        {lateCount > 0 && (
          <li className="font-semibold text-destructive">
            {lateCount} late
          </li>
        )}
        {unscheduledCount > 0 && (
          <li>
            {unscheduledCount} unplanned
          </li>
        )}
      </ul>
    </HintMark>
  );
}
