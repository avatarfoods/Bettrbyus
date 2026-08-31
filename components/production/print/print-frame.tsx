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
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground hover:bg-muted"
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

      <div className="flex justify-center px-2 py-4 print:p-0">
        <div
          id="production-print"
          className="w-full max-w-[8.5in] bg-white p-6 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** The masthead every sheet carries, so a loose page can be identified. */
export function SheetHeader({
  title,
  date,
  scheduleName,
  right,
}: {
  title: string;
  date: string;
  scheduleName?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-3 flex items-start justify-between gap-4 border-b-2 border-black pb-2">
      <div>
        <h2 className="text-lg font-bold tracking-tight uppercase">{title}</h2>
        <p className="text-xs">
          Avatar Foods
          {scheduleName && ` · ${scheduleName}`}
        </p>
      </div>
      <div className="text-right text-xs">
        <p className="text-sm font-bold tabular-nums">{date}</p>
        {right}
      </div>
    </header>
  );
}

/** Blank lines someone signs on the floor. */
export function SignoffRow({ labels }: { labels: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4 text-[0.6875rem]">
      {labels.map((label) => (
        <div key={label} className="min-w-40 flex-1">
          <div className="h-6 border-b border-black" />
          <span className="mt-0.5 block uppercase">{label}</span>
        </div>
      ))}
    </div>
  );
}
