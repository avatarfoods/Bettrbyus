"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchImportSchedulePlan,
  type SchedulePlan,
} from "@/lib/purchasing/fetch-cycles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PurchasingPlanDialogProps = {
  importId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type DeptStyle = {
  row: string;
  sticky: string;
  label: string;
};

const DEPARTMENT_STYLES: Record<string, DeptStyle> = {
  ASSEMBLY: {
    row: "bg-purple-100/80 dark:bg-purple-950/40",
    sticky: "bg-purple-100 dark:bg-purple-950/70",
    label: "bg-purple-200 text-purple-950 dark:bg-purple-900 dark:text-purple-100",
  },
  "FINISHED PRODUCT": {
    row: "bg-orange-100/80 dark:bg-orange-950/35",
    sticky: "bg-orange-100 dark:bg-orange-950/65",
    label: "bg-orange-200 text-orange-950 dark:bg-orange-900 dark:text-orange-100",
  },
  "FRESH MIXING": {
    row: "bg-sky-100/80 dark:bg-sky-950/40",
    sticky: "bg-sky-100 dark:bg-sky-950/70",
    label: "bg-sky-200 text-sky-950 dark:bg-sky-900 dark:text-sky-100",
  },
  "MAIN KITCHEN AM": {
    row: "bg-red-100/80 dark:bg-red-950/35",
    sticky: "bg-red-100 dark:bg-red-950/65",
    label: "bg-red-200 text-red-950 dark:bg-red-900 dark:text-red-100",
  },
  "MAIN KITCHEN PM": {
    row: "bg-red-300/70 dark:bg-red-900/55",
    sticky: "bg-red-300 dark:bg-red-900/80",
    label: "bg-red-400 text-red-950 dark:bg-red-800 dark:text-red-50",
  },
  "GARDE MANGER": {
    row: "bg-green-100/80 dark:bg-green-950/35",
    sticky: "bg-green-100 dark:bg-green-950/65",
    label: "bg-green-200 text-green-950 dark:bg-green-900 dark:text-green-100",
  },
  PRODUCE: {
    row: "bg-green-300/70 dark:bg-green-900/55",
    sticky: "bg-green-300 dark:bg-green-900/80",
    label: "bg-green-500 text-white dark:bg-green-800 dark:text-green-50",
  },
};

const DEPARTMENT_LEGEND = [
  { key: "ASSEMBLY", name: "Assembly" },
  { key: "FINISHED PRODUCT", name: "Finished" },
  { key: "FRESH MIXING", name: "Fresh mixing" },
  { key: "MAIN KITCHEN AM", name: "Kitchen AM" },
  { key: "MAIN KITCHEN PM", name: "Kitchen PM" },
  { key: "GARDE MANGER", name: "Garde manger" },
  { key: "PRODUCE", name: "Produce" },
] as const;

function normalizeDepartment(value: string) {
  return value.trim().toUpperCase();
}

function getDeptStyle(department: string): DeptStyle {
  return (
    DEPARTMENT_STYLES[normalizeDepartment(department)] ?? {
      row: "bg-background",
      sticky: "bg-background",
      label: "bg-muted text-muted-foreground",
    }
  );
}

function formatShortDate(value: string) {
  try {
    return format(parseISO(value), "M/d");
  } catch {
    return value;
  }
}

function formatWeekday(value: string) {
  try {
    return format(parseISO(value), "EEE");
  } catch {
    return "";
  }
}

function formatPlanQty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return "";
  const rounded =
    Math.abs(value - Math.round(value)) < 1e-9
      ? Math.round(value)
      : Math.round(value * 100) / 100;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function PurchasingPlanDialog({
  importId,
  open,
  onOpenChange,
}: PurchasingPlanDialogProps) {
  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, startLoad] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !importId) return;

    let active = true;
    startLoad(async () => {
      const supabase = createClient();
      const result = await fetchImportSchedulePlan(supabase, importId);
      if (!active) return;
      if (result.error) {
        setError(result.error);
        setPlan(null);
        return;
      }
      setError(null);
      setPlan(result.data);
    });

    return () => {
      active = false;
    };
  }, [open, importId]);

  useEffect(() => {
    if (!open) {
      setIsFullscreen(false);
      setDepartmentFilter(null);
      setSearch("");
    }
  }, [open]);

  const filteredRows = useMemo(() => {
    if (!plan) return [];
    const query = search.trim().toLowerCase();
    return plan.rows.filter((row) => {
      if (
        departmentFilter &&
        normalizeDepartment(row.department) !== departmentFilter
      ) {
        return false;
      }
      if (!query) return true;
      return (
        row.wipCode.toLowerCase().includes(query) ||
        row.recipeName.toLowerCase().includes(query) ||
        row.department.toLowerCase().includes(query)
      );
    });
  }, [plan, search, departmentFilter]);

  function scrollBy(amount: number) {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollLeft += amount;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setIsFullscreen(false);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className={cn(
          "!flex !flex-col gap-0 overflow-hidden p-0",
          isFullscreen
            ? "!top-2 !left-2 !h-[calc(100vh-1rem)] !w-[calc(100vw-1rem)] !max-h-none !max-w-none !translate-x-0 !translate-y-0 rounded-xl"
            : "!top-1/2 !left-1/2 !h-[min(90vh,880px)] !w-[min(96vw,1180px)] !max-h-[90vh] !max-w-[min(96vw,1180px)] !-translate-x-1/2 !-translate-y-1/2"
        )}
        style={
          isFullscreen
            ? {
                width: "calc(100vw - 1rem)",
                maxWidth: "calc(100vw - 1rem)",
                height: "calc(100vh - 1rem)",
              }
            : {
                width: "min(96vw, 1180px)",
                maxWidth: "min(96vw, 1180px)",
                height: "min(90vh, 880px)",
              }
        }
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <div className="shrink-0 space-y-3 border-b px-4 pt-4 pr-14 pb-3">
            <DialogHeader className="gap-1">
              <DialogTitle className="flex items-center gap-2">
                <CalendarRange className="size-5" />
                Uploaded production plan
              </DialogTitle>
              <DialogDescription>
                {plan
                  ? `${plan.fileName} · ${plan.rows.length} recipes · ${plan.entryCount} scheduled productions · ${
                      plan.dates.length > 0
                        ? `${formatShortDate(plan.dates[0])}–${formatShortDate(plan.dates[plan.dates.length - 1])}`
                        : "no dates"
                    }`
                  : "Schedule imported from the master PRODUCTION SCHEDULE sheet."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter department, WIP #, or recipe…"
                  className="h-8 max-w-sm text-xs"
                />
                {plan && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Showing {filteredRows.length} of {plan.rows.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => scrollBy(-360)}
                  aria-label="Scroll schedule left"
                >
                  <ChevronLeft />
                  Left
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => scrollBy(360)}
                  aria-label="Scroll schedule right"
                >
                  Right
                  <ChevronRight />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullscreen((value) => !value)}
                  aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
                >
                  {isFullscreen ? <Minimize2 /> : <Maximize2 />}
                  {isFullscreen ? "Exit full" : "Full screen"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDepartmentFilter(null)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity",
                  departmentFilter === null
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:opacity-80"
                )}
              >
                All
              </button>
              {DEPARTMENT_LEGEND.map((dept) => {
                const active = departmentFilter === dept.key;
                return (
                  <button
                    key={dept.key}
                    type="button"
                    onClick={() =>
                      setDepartmentFilter((current) =>
                        current === dept.key ? null : dept.key
                      )
                    }
                    aria-pressed={active}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium transition-all",
                      DEPARTMENT_STYLES[dept.key].label,
                      active
                        ? "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background"
                        : "opacity-70 hover:opacity-100"
                    )}
                  >
                    {dept.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 p-4 pt-3">
            {isLoading && !plan ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : !plan || plan.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No schedule entries in this import.
              </p>
            ) : (
              <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border">
                <div
                  ref={scrollRef}
                  className="h-full w-full overflow-x-scroll overflow-y-auto overscroll-contain"
                >
                  <table className="border-collapse text-sm" style={{ width: "max-content" }}>
                    <thead>
                      <tr className="border-b bg-muted/80">
                        <th className="sticky top-0 left-0 z-40 h-10 min-w-32 border-r bg-muted px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Dept
                        </th>
                        <th className="sticky top-0 left-32 z-40 h-10 min-w-20 border-r bg-muted px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Item #
                        </th>
                        <th className="sticky top-0 left-52 z-40 h-10 min-w-52 border-r bg-muted px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Recipe
                        </th>
                        <th className="sticky top-0 z-30 h-10 w-14 bg-muted px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          U/M
                        </th>
                        {plan.dates.map((date) => (
                          <th
                            key={date}
                            className="sticky top-0 z-30 h-10 min-w-16 bg-muted px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            <div>{formatWeekday(date)}</div>
                            <div>{formatShortDate(date)}</div>
                          </th>
                        ))}
                        <th className="sticky top-0 z-30 h-10 min-w-16 bg-muted px-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const style = getDeptStyle(row.department);
                        return (
                          <tr
                            key={row.wipCode}
                            className={cn("h-8 border-b", style.row)}
                          >
                            <td
                              className={cn(
                                "sticky left-0 z-20 border-r px-2 py-1 text-xs font-medium",
                                style.sticky
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  style.label
                                )}
                              >
                                {row.department || "—"}
                              </span>
                            </td>
                            <td
                              className={cn(
                                "sticky left-32 z-20 border-r px-2 py-1 font-mono text-xs",
                                style.sticky
                              )}
                            >
                              {row.wipCode}
                            </td>
                            <td
                              className={cn(
                                "sticky left-52 z-20 max-w-52 truncate border-r px-2 py-1 text-xs",
                                style.sticky
                              )}
                            >
                              {row.recipeName}
                            </td>
                            <td className="px-2 py-1 text-xs text-muted-foreground">
                              {row.uom ?? "—"}
                            </td>
                            {plan.dates.map((date) => {
                              const qty = row.quantities[date];
                              return (
                                <td
                                  key={date}
                                  className={cn(
                                    "px-1 py-1 text-right text-xs whitespace-nowrap tabular-nums",
                                    qty ? "font-medium" : "text-muted-foreground/50"
                                  )}
                                >
                                  {formatPlanQty(qty)}
                                </td>
                              );
                            })}
                            <td className="px-2 py-1 text-right text-xs font-semibold whitespace-nowrap tabular-nums">
                              {formatPlanQty(row.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
