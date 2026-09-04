"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

/**
 * The wrapper every printed sheet sits in.
 *
 * The toolbar is screen-only; the sheet inside is what reaches paper. Keeping
 * both in one page means what you see before pressing print is exactly what
 * comes out, rather than a preview that drifts from the real thing.
 */
export function PrintFrame({
  backHref,
  title,
  subtitle,
  controls,
  children,
}: {
  backHref: string;
  title: string;
  subtitle?: string;
  /** Screen-only controls that change what the sheet shows. */
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-muted/50">
      <div className="print:hidden sticky top-(--app-bar-height) z-30 flex flex-wrap items-center gap-2 border-b-2 border-b-brand/25 bg-background/95 px-3 py-2 backdrop-blur sm:px-4">
        <Link
          href={backHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-card ring-1 ring-foreground/10 px-2.5 text-sm text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {controls}

        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Printer className="size-3.5" />
          Print
        </button>
      </div>

      {/*
        Sideways, every sheet, and nothing but the sheet.

        The page rule itself, not a named page: named pages are ignored on the
        positioned box the print stylesheet makes of this. Zero margin is what
        stops the browser stamping its URL, date and "3/3" in the corners -
        those live in the margin - so the sheet carries its own padding.
      */}
      <style>{`@media print { @page { size: 11in 8.5in; margin: 0; } }`}</style>
      <div className="flex justify-center px-2 py-4 print:p-0">
        {/* The id the global print stylesheet shows. */}
        <div
          id="production-print"
          data-print-landscape
          className="w-full max-w-[11in] bg-white p-6 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
          style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
        >
          <div className="print:px-[0.45in] print:py-[0.4in]">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The masthead every sheet carries - the batch record's, so the report, the
 * release and the batch record read as one family: the name large, the code
 * and department under it, the production date on the right with the one
 * number that matters in a heavy box.
 */
export function SheetHeader({
  title,
  date,
  scheduleName,
  subline,
  figure,
  right,
}: {
  title: string;
  date: string;
  scheduleName?: string;
  /** Under the title: code | department, or whatever names the sheet. */
  subline?: React.ReactNode;
  /** The boxed number on the right: pallets, runs, batches. */
  figure?: { label: string; value: string; note?: string };
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-3 flex items-start justify-between gap-6 border-b-[3px] border-black pb-2">
      <div className="min-w-0">
        <h2 className="text-[1.375rem] leading-tight font-bold tracking-tight uppercase">{title}</h2>
        <p className="mt-0.5 text-[0.6875rem] tracking-wide uppercase">
          {subline ?? (
            <>
              <span className="font-bold">Avatar Foods</span>
              {scheduleName && (
                <>
                  <span className="mx-1.5 text-neutral-400">|</span>
                  {scheduleName}
                </>
              )}
            </>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[0.5625rem] font-bold tracking-[0.08em] text-neutral-600 uppercase">
          Production date
        </p>
        <p className="text-[0.9375rem] font-bold tabular-nums">{date}</p>
        {figure && (
          <div className="mt-1.5 border-[3px] border-black px-3 py-1.5">
            <p className="text-[0.5625rem] font-bold tracking-[0.08em] uppercase">{figure.label}</p>
            <p className="text-[2rem] leading-none font-bold tabular-nums">{figure.value}</p>
            {figure.note && <p className="text-[0.5625rem] uppercase">{figure.note}</p>}
          </div>
        )}
        {right && <div className="mt-1 text-[0.6875rem] text-neutral-600">{right}</div>}
      </div>
    </header>
  );
}

/** Blank lines someone signs on the floor. */
export function SignoffRow({ labels }: { labels: string[] }) {
  return (
    <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4 text-[0.625rem] text-zinc-600">
      {labels.map((label) => (
        <div key={label} className="min-w-40 flex-1">
          <div className="h-7 border-b border-zinc-500" />
          <span className="mt-0.5 block tracking-wider uppercase">{label}</span>
        </div>
      ))}
    </div>
  );
}
