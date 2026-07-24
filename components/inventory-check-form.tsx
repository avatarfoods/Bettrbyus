"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ClipboardList, History, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  attachDepartmentsToItems,
  resolveItemDepartmentName,
} from "@/lib/inventory-checks/resolve-department";
import { fetchDepartments } from "@/lib/inventory-checks/fetch-departments";
import { fetchInventoryCheckItems } from "@/lib/inventory-checks/fetch-items";
import {
  buildActualQuantityMap,
  buildEntryValuesMap,
  fetchInventoryChecksForDate,
  getPreviousCheckDate,
} from "@/lib/inventory-checks/fetch-check";
import {
  INVENTORY_CHECK_SUBMIT_ERROR_MESSAGE,
  INVENTORY_CHECK_SUBMIT_SUCCESS_MESSAGE,
  submitInventoryCheck,
} from "@/lib/inventory-checks/submit-check";
import {
  formatQuantity,
} from "@/lib/inventory-checks/format-department";
import {
  type DepartmentSummary,
  type InventoryCheckItem,
} from "@/lib/inventory-checks/types";
import { InventoryCheckItemDialog } from "@/components/inventory-check-item-dialog";
import { InventoryCheckItemHistoryDialog } from "@/components/inventory-check-item-history-dialog";
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

type RowValues = {
  actualQuantity: string;
  notes: string;
};

function todayDateInputValue() {
  return format(new Date(), "yyyy-MM-dd");
}

function parseActualQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatYesterdayQuantity(value: number | null | undefined) {
  if (value == null) return "";
  return formatQuantity(value);
}

type InventoryItemRowProps = {
  item: InventoryCheckItem;
  values: RowValues;
  yesterdayQuantity: number | null | undefined;
  departmentName: string;
  onUpdate: (patch: Partial<RowValues>) => void;
  onEditTemplate: () => void;
  onViewHistory: () => void;
};

function ItemActionButtons({
  itemName,
  onViewHistory,
  onEditTemplate,
}: {
  itemName: string;
  onViewHistory: () => void;
  onEditTemplate: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onViewHistory}
        aria-label={`View history for ${itemName}`}
      >
        <History className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onEditTemplate}
        aria-label={`Edit ${itemName}`}
      >
        <Pencil className="size-3.5" />
      </Button>
    </div>
  );
}

function InventoryItemFields({
  item,
  values,
  yesterdayQuantity,
  onUpdate,
}: Pick<
  InventoryItemRowProps,
  "item" | "values" | "yesterdayQuantity" | "onUpdate"
>) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Actual</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={values.actualQuantity}
            onChange={(event) =>
              onUpdate({ actualQuantity: event.target.value })
            }
            className="h-10"
            aria-label={`Actual quantity for ${item.item_name}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Yesterday</Label>
          <div className="flex h-10 items-center rounded-lg border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
            {formatYesterdayQuantity(yesterdayQuantity)}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Input
          value={values.notes}
          onChange={(event) => onUpdate({ notes: event.target.value })}
          placeholder="Optional"
          className="h-10"
          aria-label={`Notes for ${item.item_name}`}
        />
      </div>
    </>
  );
}

function MobileInventoryItemCard({
  item,
  values,
  yesterdayQuantity,
  departmentName,
  onUpdate,
  onEditTemplate,
  onViewHistory,
}: InventoryItemRowProps) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-3 shadow-xs">
      <div className="space-y-1">
        {departmentName ? (
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {departmentName}
          </p>
        ) : null}
        <div className="flex items-start gap-2">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {item.item_code}
          </span>
          <p className="min-w-0 flex-1 text-sm leading-snug font-medium">{item.item_name}</p>
          <ItemActionButtons
            itemName={item.item_name}
            onViewHistory={onViewHistory}
            onEditTemplate={onEditTemplate}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Par {formatQuantity(item.par_quantity)} · {item.unit ?? "—"}
        </p>
      </div>
      <InventoryItemFields
        item={item}
        values={values}
        yesterdayQuantity={yesterdayQuantity}
        onUpdate={onUpdate}
      />
    </div>
  );
}

export function InventoryCheckForm() {
  const [items, setItems] = useState<InventoryCheckItem[]>([]);
  const [rowValues, setRowValues] = useState<Record<string, RowValues>>({});
  const [checkDate, setCheckDate] = useState(todayDateInputValue);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [yesterdayQuantities, setYesterdayQuantities] = useState<
    Record<string, number | null>
  >({});
  const [templateDialog, setTemplateDialog] = useState<{
    mode: "add" | "edit";
    item: InventoryCheckItem | null;
  } | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryCheckItem | null>(null);

  const itemDepartmentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      map.set(item.id, item.department_id);
    }
    return map;
  }, [items]);

  const getDepartmentNameForItem = (item: InventoryCheckItem) =>
    resolveItemDepartmentName(item, departments);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) => {
      const code = item.item_code.toLowerCase();
      const name = item.item_name.toLowerCase();
      return code.includes(query) || name.includes(query);
    });
  }, [items, search]);

  useEffect(() => {
    let active = true;

    (async () => {
      setIsLoading(true);
      setLoadError(null);
      const supabase = createClient();

      const [itemsResult, checksResult, yesterdayResult, departmentsResult] =
        await Promise.all([
          fetchInventoryCheckItems(supabase),
          fetchInventoryChecksForDate(supabase, checkDate),
          fetchInventoryChecksForDate(
            supabase,
            getPreviousCheckDate(checkDate)
          ),
          fetchDepartments(supabase),
        ]);

      if (!active) return;

      if (
        itemsResult.error ||
        checksResult.error ||
        yesterdayResult.error ||
        departmentsResult.error
      ) {
        setLoadError(
          itemsResult.error ??
            checksResult.error ??
            yesterdayResult.error ??
            departmentsResult.error
        );
        setItems([]);
        setRowValues({});
        setYesterdayQuantities({});
        setDepartments([]);
        setIsLoading(false);
        return;
      }

      const departmentsData = departmentsResult.data;
      setDepartments(departmentsData);

      const enrichedItems = attachDepartmentsToItems(
        itemsResult.data,
        departmentsData
      );

      const saved = buildEntryValuesMap(checksResult.data);

      const nextValues: Record<string, RowValues> = {};
      for (const item of enrichedItems) {
        const existing = saved.get(item.id);
        nextValues[item.id] = {
          actualQuantity:
            existing?.actualQuantity != null
              ? String(existing.actualQuantity)
              : "",
          notes: existing?.notes ?? "",
        };
      }

      setItems(enrichedItems);
      setRowValues(nextValues);
      setYesterdayQuantities(buildActualQuantityMap(yesterdayResult.data));
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [checkDate]);

  function handleTemplateSaved(savedItem: InventoryCheckItem) {
    const enrichedItem = attachDepartmentsToItems([savedItem], departments)[0];

    setItems((current) => {
      const existingIndex = current.findIndex((row) => row.id === enrichedItem.id);
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = enrichedItem;
        return next;
      }
      return [...current, enrichedItem].sort((a, b) => a.sort_order - b.sort_order);
    });
    setRowValues((current) => ({
      ...current,
      [enrichedItem.id]: current[enrichedItem.id] ?? {
        actualQuantity: "",
        notes: "",
      },
    }));
  }

  async function reloadSavedEntries(date: string, templateItems: InventoryCheckItem[]) {
    const supabase = createClient();
    const checksResult = await fetchInventoryChecksForDate(supabase, date);
    if (checksResult.error) return;

    const saved = buildEntryValuesMap(checksResult.data);

    const nextValues: Record<string, RowValues> = {};
    for (const item of templateItems) {
      const existing = saved.get(item.id);
      nextValues[item.id] = {
        actualQuantity:
          existing?.actualQuantity != null ? String(existing.actualQuantity) : "",
        notes: existing?.notes ?? "",
      };
    }

    setRowValues(nextValues);
  }

  function updateRow(itemId: string, patch: Partial<RowValues>) {
    setRowValues((current) => ({
      ...current,
      [itemId]: {
        actualQuantity: current[itemId]?.actualQuantity ?? "",
        notes: current[itemId]?.notes ?? "",
        ...patch,
      },
    }));
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    const supabase = createClient();
    const entries = items.map((item) => {
      const values = rowValues[item.id];
      return {
        itemId: item.id,
        actualQuantity: parseActualQuantity(values?.actualQuantity ?? ""),
        notes: values?.notes?.trim() ? values.notes.trim() : null,
      };
    });

    const result = await submitInventoryCheck(
      supabase,
      { checkDate, entries },
      itemDepartmentMap
    );

    setIsSaving(false);

    if (!result.success) {
      setSaveError(result.message ?? INVENTORY_CHECK_SUBMIT_ERROR_MESSAGE);
      return;
    }

    setSaveMessage(INVENTORY_CHECK_SUBMIT_SUCCESS_MESSAGE);
    await reloadSavedEntries(checkDate, items);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col pb-24 xl:pb-0">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 sm:py-4">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-10">
              <ClipboardList className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                Daily inventory check
              </h1>
              <p className="hidden text-sm text-muted-foreground sm:block">
                Record actual counts for all departments in list order.
              </p>
            </div>
            <Link
              href="/inventory-checks/history"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground transition-colors hover:bg-muted sm:size-10"
              aria-label="View inventory check history"
              title="Inventory check history"
            >
              <History className="size-5" />
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="inventory-check-date">Check date</Label>
              <Input
                id="inventory-check-date"
                type="date"
                value={checkDate}
                onChange={(event) => setCheckDate(event.target.value)}
                className="h-10 min-h-10 max-h-10 w-full py-0 text-base leading-normal md:text-base"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="inventory-item-search">Search</Label>
              <div className="relative h-10 w-full shrink-0">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="inventory-item-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Item ID or name…"
                  className="h-10 min-h-10 max-h-10 w-full py-0 pr-9 pl-9 text-base leading-normal md:text-base"
                  disabled={isLoading || !!loadError}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          {search.trim() && !isLoading && !loadError && (
            <p className="text-xs text-muted-foreground">
              {filteredItems.length} of {items.length} items
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-3 py-4 sm:gap-4 sm:px-4 sm:py-6">
        <Card className="gap-0 border py-0 shadow-sm">
          <CardHeader className="px-3 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl">Inventory items</CardTitle>
                <CardDescription className="text-sm">
                  Enter actual quantities and optional notes. Yesterday shows the prior day&apos;s count.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={isLoading || !!loadError}
                onClick={() =>
                  setTemplateDialog({ mode: "add", item: null })
                }
              >
                <Plus />
                <span className="hidden sm:inline">Add item</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex min-h-48 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <p className="p-4 text-sm text-destructive sm:p-6">
                Could not load inventory items: {loadError}
              </p>
            ) : filteredItems.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground sm:p-6">
                No items match your search.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2 p-3 xl:hidden">
                  {filteredItems.map((item, index) => {
                    const department = getDepartmentNameForItem(item);
                    const previousDepartmentName =
                      index > 0
                        ? getDepartmentNameForItem(filteredItems[index - 1])
                        : "";
                    const showDivider =
                      index === 0 || department !== previousDepartmentName;
                    const values = rowValues[item.id] ?? {
                      actualQuantity: "",
                      notes: "",
                    };

                    return (
                      <Fragment key={item.id}>
                        {showDivider && index > 0 && (
                          <div className="h-1" aria-hidden />
                        )}
                        <MobileInventoryItemCard
                          item={item}
                          values={values}
                          yesterdayQuantity={yesterdayQuantities[item.id]}
                          departmentName={getDepartmentNameForItem(item)}
                          onUpdate={(patch) => updateRow(item.id, patch)}
                          onEditTemplate={() =>
                            setTemplateDialog({ mode: "edit", item })
                          }
                          onViewHistory={() => setHistoryItem(item)}
                        />
                      </Fragment>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-36">Department</TableHead>
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead className="min-w-56">Item</TableHead>
                        <TableHead className="w-16 text-right">Par</TableHead>
                        <TableHead className="w-16">Unit</TableHead>
                        <TableHead className="w-28">Actual</TableHead>
                        <TableHead className="w-24 text-right">Yesterday</TableHead>
                        <TableHead className="min-w-40">Notes</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item, index) => {
                        const departmentName = getDepartmentNameForItem(item);
                        const previousDepartmentName =
                          index > 0
                            ? getDepartmentNameForItem(filteredItems[index - 1])
                            : "";
                        const showDivider =
                          index === 0 ||
                          departmentName !== previousDepartmentName;
                        const values = rowValues[item.id] ?? {
                          actualQuantity: "",
                          notes: "",
                        };
                        const yesterdayQuantity = yesterdayQuantities[item.id];

                        return (
                          <Fragment key={item.id}>
                            {showDivider && (
                              <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableCell
                                  colSpan={9}
                                  className="py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                                >
                                  {departmentName}
                                </TableCell>
                              </TableRow>
                            )}
                            <TableRow>
                              <TableCell className="text-sm text-muted-foreground">
                                {departmentName}
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
                              <TableCell>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="any"
                                  value={values.actualQuantity}
                                  onChange={(event) =>
                                    updateRow(item.id, {
                                      actualQuantity: event.target.value,
                                    })
                                  }
                                  className="h-9"
                                  aria-label={`Actual quantity for ${item.item_name}`}
                                />
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {formatYesterdayQuantity(yesterdayQuantity)}
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={values.notes}
                                  onChange={(event) =>
                                    updateRow(item.id, { notes: event.target.value })
                                  }
                                  placeholder="Optional"
                                  className="h-9"
                                  aria-label={`Notes for ${item.item_name}`}
                                />
                              </TableCell>
                              <TableCell>
                                <ItemActionButtons
                                  itemName={item.item_name}
                                  onViewHistory={() => setHistoryItem(item)}
                                  onEditTemplate={() =>
                                    setTemplateDialog({ mode: "edit", item })
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {(saveMessage || saveError) && (
          <p
            className={cn(
              "text-sm",
              saveError ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {saveError ?? saveMessage}
          </p>
        )}

        <div className="hidden justify-end pb-6 xl:flex">
          <Button
            type="button"
            size="lg"
            disabled={isLoading || isSaving || !!loadError}
            onClick={() => void handleSave()}
          >
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" />
                Saving…
              </>
            ) : (
              "Save all"
            )}
          </Button>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 xl:hidden pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          size="lg"
          className="h-11 w-full"
          disabled={isLoading || isSaving || !!loadError}
          onClick={() => void handleSave()}
        >
          {isSaving ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save all"
          )}
        </Button>
      </div>

      <InventoryCheckItemDialog
        mode={templateDialog?.mode ?? "add"}
        item={templateDialog?.item ?? null}
        departments={departments}
        open={templateDialog != null}
        onOpenChange={(open) => {
          if (!open) setTemplateDialog(null);
        }}
        onSaved={handleTemplateSaved}
      />

      <InventoryCheckItemHistoryDialog
        item={historyItem}
        open={historyItem != null}
        onOpenChange={(open) => {
          if (!open) setHistoryItem(null);
        }}
      />
    </div>
  );
}
