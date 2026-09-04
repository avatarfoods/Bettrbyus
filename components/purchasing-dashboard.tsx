"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  Loader2,
  Package,
  ShoppingCart,
  Snowflake,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchCycles,
  fetchOpenLines,
  lineItemCode,
  lineItemName,
  type PurchaseCycle,
  type PurchaseLine,
} from "@/lib/purchasing/fetch-cycles";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OpenLine = PurchaseLine & { cycle: PurchaseCycle | null };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "EEE, MMM d");
  } catch {
    return value;
  }
}

function LineList({ lines, empty }: { lines: OpenLine[]; empty: string }) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="flex flex-col divide-y">
      {lines.map((line) => (
        <li key={line.id} className="flex items-center gap-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              <span className="font-mono text-xs text-muted-foreground">
                {lineItemCode(line)}
              </span>{" "}
              {lineItemName(line)}
              {line.material?.is_protein && (
                <Snowflake className="ml-1 inline size-3.5 text-sky-500" />
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {line.required_to_order.toLocaleString()} cs · order by{" "}
              {formatDate(line.order_by_date)} · PO #
              {line.cycle?.po_number ?? "—"} ({formatDate(line.cycle?.required_date ?? null)})
            </p>
          </div>
          {line.cycle && (
            <Link
              href={`/purchasing/cycles/${line.cycle.id}`}
              className="shrink-0 text-sm font-medium text-primary hover:underline"
            >
              Open
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PurchasingDashboard() {
  const [cycles, setCycles] = useState<PurchaseCycle[]>([]);
  const [openLines, setOpenLines] = useState<OpenLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const supabase = createClient();
      const [cyclesRes, linesRes] = await Promise.all([
        fetchCycles(supabase),
        fetchOpenLines(supabase),
      ]);
      if (!active) return;

      setCycles(cyclesRes.data);
      setOpenLines(linesRes.data);
      setLoadError(cyclesRes.error ?? linesRes.error);
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const today = todayIso();
  const soon = addDays(today, 3);

  const buckets = useMemo(() => {
    const pending = openLines.filter((line) => line.status === "to_order");
    return {
      orderNow: pending
        .filter((line) => line.order_by_date !== null && line.order_by_date <= today)
        .sort((a, b) => (a.order_by_date ?? "").localeCompare(b.order_by_date ?? "")),
      comingUp: pending
        .filter(
          (line) =>
            line.order_by_date !== null &&
            line.order_by_date > today &&
            line.order_by_date <= soon
        )
        .sort((a, b) => (a.order_by_date ?? "").localeCompare(b.order_by_date ?? "")),
      lateArrivals: openLines
        .filter(
          (line) =>
            line.status === "ordered" &&
            line.arrival_date !== null &&
            line.arrival_date < today
        )
        .sort((a, b) => (a.arrival_date ?? "").localeCompare(b.arrival_date ?? "")),
      thawSoon: openLines
        .filter(
          (line) =>
            line.material?.is_protein &&
            line.status !== "arrived" &&
            line.cycle !== null &&
            addDays(line.cycle.required_date, -(line.material.thaw_buffer_days ?? 0)) <=
              soon
        )
        .sort((a, b) =>
          (a.cycle?.required_date ?? "").localeCompare(b.cycle?.required_date ?? "")
        ),
    };
  }, [openLines, today, soon]);

  const openCycles = cycles.filter((cycle) => cycle.status === "in_progress");
  const recentCycles = cycles.slice(0, 8);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-none items-center gap-3">
          <Link
            href="/"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-[1px] border border-input bg-background text-foreground transition-colors hover:bg-muted"
            aria-label="Back to home"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[1px] bg-primary/10 text-primary">
            <ShoppingCart className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">Purchasing</h1>
            <p className="text-sm text-muted-foreground">
              Weekly buy lists computed from the master production plan.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href="/purchasing/materials"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Package />
              <span className="hidden sm:inline">Materials</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-none flex-1 flex-col gap-4 px-4 py-6">
        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">
            Could not load purchasing data: {loadError}
          </p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="size-5 text-destructive" />
                    Order today ({buckets.orderNow.length})
                  </CardTitle>
                  <CardDescription>
                    Past or at their order-by date, considering lead time and thaw
                    buffer.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LineList
                    lines={buckets.orderNow}
                    empty="Nothing overdue. All caught up."
                  />
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarRange className="size-5 text-amber-500" />
                    Coming up in 3 days ({buckets.comingUp.length})
                  </CardTitle>
                  <CardDescription>Order-by dates approaching.</CardDescription>
                </CardHeader>
                <CardContent>
                  <LineList lines={buckets.comingUp} empty="Nothing due soon." />
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Snowflake className="size-5 text-sky-500" />
                    Thaw reminders ({buckets.thawSoon.length})
                  </CardTitle>
                  <CardDescription>
                    Proteins whose thaw window starts within 3 days and haven&apos;t
                    arrived yet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LineList lines={buckets.thawSoon} empty="No proteins need thawing soon." />
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="size-5 text-amber-500" />
                    Past ETA ({buckets.lateArrivals.length})
                  </CardTitle>
                  <CardDescription>
                    Ordered items past their expected arrival (ETA).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LineList lines={buckets.lateArrivals} empty="No late deliveries." />
                </CardContent>
              </Card>
            </div>

            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Purchase cycles</CardTitle>
                <CardDescription>
                  {openCycles.length} open ·{" "}
                  {cycles.length - openCycles.length} closed
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recentCycles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No cycles yet. Import the master plan and generate the first buy
                    list.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {recentCycles.map((cycle) => (
                      <li key={cycle.id} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            PO #{cycle.po_number ?? "—"} · required{" "}
                            {formatDate(cycle.required_date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {cycle.week_label
                              ? `Covers ${cycle.week_label}`
                              : "No production window"}{" "}
                            ·{" "}
                            {cycle.status === "in_progress"
                              ? "In progress"
                              : cycle.status === "done"
                                ? "Done"
                                : cycle.status}
                          </p>
                        </div>
                        <Link
                          href={`/purchasing/cycles/${cycle.id}`}
                          className="shrink-0 text-sm font-medium text-primary hover:underline"
                        >
                          Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
