"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowLeft, ClipboardList, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildEntryMap,
  fetchInventoryCheckDetailForDate,
  fetchInventoryCheckHistoryDates,
  getCheckerNamesForDate,
} from "@/lib/inventory-checks/fetch-history";
import {
  computeVariance,
  formatDepartmentName,
  formatQuantity,
} from "@/lib/inventory-checks/format-department";
import {
  getInventoryCheckItemDepartment,
  type InventoryCheckHistoryDate,
  type InventoryCheckItem,
} from "@/lib/inventory-checks/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function formatCheckDate(value: string) {
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value;
  }
}

function formatVariance(value: number | null) {
  if (value == null) return "—";
  if (value > 0) return `+${formatQuantity(value)}`;
  return formatQuantity(value);
}

export function InventoryCheckHistoryPage() {
  const [historyDates, setHistoryDates] = useState<InventoryCheckHistoryDate[]>(
    []
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<InventoryCheckItem[]>([]);
  const [entryMap, setEntryMap] = useState(
    () =>
      new Map<
        string,
        { actualQuantity: number | null; notes: string | null }
      >()
  );
  const [checkerNames, setCheckerNames] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      setIsLoading(true);
      setLoadError(null);
      const supabase = createClient();
      const result = await fetchInventoryCheckHistoryDates(supabase, {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });

      if (!active) return;

      if (result.error) {
        setLoadError(result.error);
        setHistoryDates([]);
      } else {
        setHistoryDates(result.data);
        setSelectedDate((current) => current ?? result.data[0]?.checkDate ?? null);
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [fromDate, toDate]);

  useEffect(() => {
    if (!selectedDate) return;

    let active = true;

    (async () => {
      setIsDetailLoading(true);
      setDetailError(null);
      const supabase = createClient();
      const result = await fetchInventoryCheckDetailForDate(
        supabase,
        selectedDate
      );

      if (!active) return;

      if (result.error) {
        setDetailError(result.error);
        setDetailItems([]);
        setEntryMap(new Map());
        setCheckerNames([]);
      } else {
        setDetailItems(result.items);
        setEntryMap(buildEntryMap(result.checks));
        setCheckerNames(getCheckerNamesForDate(result.checks));
      }

      setIsDetailLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [selectedDate]);

  const filledCount = useMemo(() => {
    let count = 0;
    for (const item of detailItems) {
      const entry = entryMap.get(item.id);
      if (entry?.actualQuantity != null || entry?.notes) count += 1;
    }
    return count;
  }, [detailItems, entryMap]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
          <Link
            href="/inventory-checks/new"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground transition-colors hover:bg-muted"
            aria-label="Back to daily inventory check"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ClipboardList className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              Inventory check history
            </h1>
            <p className="text-sm text-muted-foreground">
              Review past daily checks across all departments.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6">
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Past checks</CardTitle>
            <CardDescription>
              Select a date to view the full inventory list for that day.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="history-from-date">From</Label>
                <Input
                  id="history-from-date"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="history-to-date">To</Label>
                <Input
                  id="history-to-date"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex min-h-24 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <p className="text-sm text-destructive">
                Could not load history: {loadError}
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Departments</TableHead>
                      <TableHead>Checked by</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyDates.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No inventory checks found for this date range.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historyDates.map((row) => (
                        <TableRow key={row.checkDate}>
                          <TableCell>{formatCheckDate(row.checkDate)}</TableCell>
                          <TableCell>{row.departmentsCompleted}</TableCell>
                          <TableCell>{row.checkerNames.join(", ")}</TableCell>
                          <TableCell className="text-right">
                            {row.entryCount}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant={selectedDate === row.checkDate ? "default" : "outline"}
                              size="sm"
                              onClick={() => setSelectedDate(row.checkDate)}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedDate && (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">
                {formatCheckDate(selectedDate)}
              </CardTitle>
              <CardDescription>
                {checkerNames.length > 0
                  ? `Checked by ${checkerNames.join(", ")} · ${filledCount} items recorded`
                  : "No saved entries for this date yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isDetailLoading ? (
                <div className="flex min-h-48 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : detailError ? (
                <p className="p-6 text-sm text-destructive">
                  Could not load check detail: {detailError}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-36">Department</TableHead>
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead className="min-w-56">Item</TableHead>
                        <TableHead className="w-16 text-right">Par</TableHead>
                        <TableHead className="w-16">Unit</TableHead>
                        <TableHead className="w-24 text-right">Actual</TableHead>
                        <TableHead className="w-24 text-right">Variance</TableHead>
                        <TableHead className="min-w-40">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailItems.map((item, index) => {
                        const department = getInventoryCheckItemDepartment(item);
                        const previousDepartment =
                          index > 0
                            ? getInventoryCheckItemDepartment(detailItems[index - 1])
                            : null;
                        const showDivider =
                          index === 0 ||
                          department?.id !== previousDepartment?.id;
                        const entry = entryMap.get(item.id);
                        const variance = computeVariance(
                          entry?.actualQuantity,
                          item.par_quantity
                        );

                        return (
                          <Fragment key={item.id}>
                            {showDivider && (
                              <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableCell
                                  colSpan={8}
                                  className="py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                                >
                                  {formatDepartmentName(department?.name ?? "")}
                                </TableCell>
                              </TableRow>
                            )}
                            <TableRow>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDepartmentName(department?.name ?? "")}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {item.item_code}
                              </TableCell>
                              <TableCell className="text-sm">{item.item_name}</TableCell>
                              <TableCell className="text-right text-sm">
                                {formatQuantity(item.par_quantity)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {item.unit ?? "—"}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {formatQuantity(entry?.actualQuantity)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-right text-sm font-medium",
                                  variance != null &&
                                    variance !== 0 &&
                                    (variance > 0
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-destructive")
                                )}
                              >
                                {formatVariance(variance)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {entry?.notes ?? "—"}
                              </TableCell>
                            </TableRow>
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
