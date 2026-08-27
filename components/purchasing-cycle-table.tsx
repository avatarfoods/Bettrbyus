"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Plus,
  ShoppingCart,
  Snowflake,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchCycleWithLines,
  lineItemCode,
  lineItemName,
  type LineStatus,
  type PurchaseCycle,
  type PurchaseLine,
} from "@/lib/purchasing/fetch-cycles";
import {
  addEmergencyLine,
  updateCycleStatus,
  updatePurchaseLine,
} from "@/lib/purchasing/update-line";
import type { Material } from "@/lib/purchasing/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<LineStatus, string> = {
  to_order: "To order",
  ordered: "Ordered",
  arrived: "Arrived",
  skipped: "Skipped",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d");
  } catch {
    return value;
  }
}

function formatArrivedAt(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy h:mm a");
  } catch {
    return value;
  }
}

function orderByTone(line: PurchaseLine): string {
  if (line.status !== "to_order" || !line.order_by_date) return "";
  const today = todayIso();
  if (line.order_by_date < today) return "text-destructive font-semibold";
  if (line.order_by_date === today) return "text-amber-600 dark:text-amber-400 font-semibold";
  return "";
}

type EmergencyDialogProps = {
  cycleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
};

function EmergencyDialog({ cycleId, open, onOpenChange, onAdded }: EmergencyDialogProps) {
  const [materials, setMaterials] = useState<Pick<Material, "id" | "item_code" | "name">[]>([]);
  const [search, setSearch] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [cases, setCases] = useState("");
  const [requiredTime, setRequiredTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("purchasing_materials")
        .select("id, item_code, name")
        .eq("active", true)
        .order("item_code");
      if (active) {
        setMaterials((data ?? []) as Pick<Material, "id" | "item_code" | "name">[]);
      }
    })();
    return () => {
      active = false;
    };
  }, [open]);

  const options = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return materials.slice(0, 50);
    return materials
      .filter(
        (material) =>
          material.item_code.toLowerCase().includes(query) ||
          material.name.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [materials, search]);

  async function handleAdd() {
    setError(null);
    const parsedCases = Number(cases);
    if (!materialId) {
      setError("Pick a material.");
      return;
    }
    if (!Number.isFinite(parsedCases) || parsedCases <= 0) {
      setError("Enter how many cases are needed.");
      return;
    }

    setIsSaving(true);
    const supabase = createClient();
    const result = await addEmergencyLine(supabase, {
      cycleId,
      materialId,
      casesRequired: parsedCases,
      requiredTime: requiredTime.trim() || null,
      notes: notes.trim() || null,
    });
    setIsSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Could not add the item.");
      return;
    }

    setSearch("");
    setMaterialId("");
    setCases("");
    setRequiredTime("");
    setNotes("");
    onAdded();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add emergency item</DialogTitle>
          <DialogDescription>
            Urgent buys outside the computed plan, like the old Emergency Item sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emergency-search">Material</Label>
            <Input
              id="emergency-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by code or name…"
              className="h-10"
            />
            <select
              value={materialId}
              onChange={(event) => setMaterialId(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
            >
              <option value="">Select material…</option>
              {options.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.item_code} · {material.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="emergency-cases">Cases needed</Label>
              <Input
                id="emergency-cases"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={cases}
                onChange={(event) => setCases(event.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="emergency-time">Required time</Label>
              <Input
                id="emergency-time"
                value={requiredTime}
                onChange={(event) => setRequiredTime(event.target.value)}
                placeholder="e.g. 8:00 AM"
                className="h-10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emergency-notes">Notes</Label>
            <Input
              id="emergency-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional"
              className="h-10"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleAdd()} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" />
                Adding…
              </>
            ) : (
              "Add item"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type LineRowProps = {
  line: PurchaseLine;
  onChanged: (line: PurchaseLine) => void;
};

function LineRow({ line, onChanged }: LineRowProps) {
  const [notes, setNotes] = useState(line.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function save(values: Parameters<typeof updatePurchaseLine>[2]) {
    setIsSaving(true);
    const supabase = createClient();
    const result = await updatePurchaseLine(supabase, line.id, values);
    setIsSaving(false);
    if (result.success) {
      onChanged({
        ...line,
        ...values,
        arrived_at:
          result.data?.arrived_at !== undefined
            ? result.data.arrived_at
            : values.arrived_at !== undefined
              ? values.arrived_at
              : line.arrived_at,
      } as PurchaseLine);
    }
  }

  const material = line.material;
  const isArrived = line.status === "arrived";

  return (
    <TableRow className={cn(line.is_emergency && "bg-destructive/5")}>
      <TableCell className="font-mono text-sm">{lineItemCode(line)}</TableCell>
      <TableCell className="text-sm">
        <span className="flex items-center gap-1.5">
          {line.is_emergency && (
            <AlertTriangle
              className="size-3.5 shrink-0 text-destructive"
              aria-label="Emergency item"
            />
          )}
          {lineItemName(line)}
          {material?.is_protein && (
            <Snowflake
              className="size-3.5 shrink-0 text-sky-500"
              aria-label="Protein (thaw buffer applies)"
            />
          )}
        </span>
        {line.required_time && (
          <span className="block text-xs text-muted-foreground">
            Needed by {line.required_time}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right text-sm">
        {line.cases_required.toLocaleString()}
      </TableCell>
      <TableCell className="text-right text-sm text-muted-foreground">
        {line.on_hand_cases != null ? line.on_hand_cases.toLocaleString() : "—"}
      </TableCell>
      <TableCell className="text-right text-sm font-semibold">
        {line.required_to_order.toLocaleString()}
      </TableCell>
      <TableCell className="text-right text-sm text-muted-foreground">
        {line.lbs_required != null ? Math.round(line.lbs_required).toLocaleString() : "—"}
      </TableCell>
      <TableCell className={cn("text-sm", orderByTone(line))}>
        {formatDate(line.order_by_date)}
      </TableCell>
      <TableCell>
        <select
          value={line.status}
          onChange={(event) => void save({ status: event.target.value as LineStatus })}
          disabled={isSaving}
          className="h-8 w-full min-w-24 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
        >
          {(Object.keys(STATUS_LABELS) as LineStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        {isArrived ? (
          <span className="text-sm font-medium text-green-700 dark:text-green-400">
            {formatArrivedAt(line.arrived_at)}
          </span>
        ) : (
          <Input
            type="date"
            value={line.arrival_date ?? ""}
            onChange={(event) =>
              void save({ arrival_date: event.target.value || null })
            }
            disabled={isSaving}
            className="h-8 w-36"
            title="Expected arrival (ETA)"
          />
        )}
      </TableCell>
      <TableCell>
        <Input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            const value = notes.trim() || null;
            if (value !== (line.notes ?? null)) void save({ notes: value });
          }}
          placeholder="—"
          disabled={isSaving}
          className="h-8 min-w-40"
        />
      </TableCell>
    </TableRow>
  );
}

export function PurchasingCyclePage({ cycleId }: { cycleId: string }) {
  const [cycle, setCycle] = useState<PurchaseCycle | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyToOrder, setOnlyToOrder] = useState(true);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    (async () => {
      const supabase = createClient();
      const result = await fetchCycleWithLines(supabase, cycleId);
      if (!active) return;

      if (result.error) {
        setLoadError(result.error);
      } else {
        setCycle(result.cycle);
        setLines(result.lines);
        setLoadError(null);
      }
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [cycleId, reloadKey]);

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    return lines.filter((line) => {
      if (onlyToOrder && !line.is_emergency && line.required_to_order <= 0) {
        return false;
      }
      if (!query) return true;
      return (
        lineItemCode(line).toLowerCase().includes(query) ||
        lineItemName(line).toLowerCase().includes(query)
      );
    });
  }, [lines, search, onlyToOrder]);

  const summary = useMemo(() => {
    const toOrder = lines.filter(
      (line) => line.required_to_order > 0 || line.is_emergency
    );
    const ordered = toOrder.filter((line) => line.status === "ordered").length;
    const arrived = toOrder.filter((line) => line.status === "arrived").length;
    const overdue = toOrder.filter(
      (line) =>
        line.status === "to_order" &&
        line.order_by_date !== null &&
        line.order_by_date <= todayIso()
    ).length;
    return { total: toOrder.length, ordered, arrived, overdue };
  }, [lines]);

  async function handleCycleStatus(status: "in_progress" | "done") {
    if (!cycle) return;
    const supabase = createClient();
    const result = await updateCycleStatus(supabase, cycle.id, status);
    if (result.success) setCycle({ ...cycle, status });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
          <Link
            href="/purchasing"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground transition-colors hover:bg-muted"
            aria-label="Back to purchasing"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShoppingCart className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {cycle
                ? `PO #${cycle.po_number ?? "—"} · required ${formatDate(cycle.required_date)}`
                : "Buy list"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {cycle?.week_label
                ? `Covers production ${cycle.week_label}`
                : "Weekly purchase cycle"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEmergencyOpen(true)}
            >
              <Plus />
              <span className="hidden sm:inline">Emergency item</span>
            </Button>
            {cycle && cycle.status === "in_progress" ? (
              <Button type="button" onClick={() => void handleCycleStatus("done")}>
                Mark done
              </Button>
            ) : cycle ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCycleStatus("in_progress")}
              >
                Reopen
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6">
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Buy list</CardTitle>
            <CardDescription>
              {summary.total} items to buy · {summary.ordered} ordered ·{" "}
              {summary.arrived} arrived
              {summary.overdue > 0 && (
                <span className="text-destructive">
                  {" "}
                  · {summary.overdue} past their order-by date
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="cycle-search">Search</Label>
                <Input
                  id="cycle-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Item code or name…"
                  className="h-10"
                />
              </div>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyToOrder}
                  onChange={(event) => setOnlyToOrder(event.target.checked)}
                  className="size-4 accent-primary"
                />
                Only items that need ordering
              </label>
            </div>

            {isLoading ? (
              <div className="flex min-h-32 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <p className="text-sm text-destructive">
                Could not load the cycle: {loadError}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Code</TableHead>
                      <TableHead className="min-w-56">Item</TableHead>
                      <TableHead className="w-24 text-right">Cases req.</TableHead>
                      <TableHead className="w-24 text-right">On hand</TableHead>
                      <TableHead className="w-24 text-right">To order</TableHead>
                      <TableHead className="w-24 text-right">Total lbs</TableHead>
                      <TableHead className="w-24">Order by</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-40">ETA / Arrived</TableHead>
                      <TableHead className="min-w-44">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLines.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="h-24 text-center text-muted-foreground"
                        >
                          {lines.length === 0
                            ? "No lines in this cycle yet. Generate it from the import page."
                            : "No lines match the current filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLines.map((line) => (
                        <LineRow
                          key={line.id}
                          line={line}
                          onChanged={(changed) =>
                            setLines((current) =>
                              current.map((item) =>
                                item.id === changed.id ? changed : item
                              )
                            )
                          }
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <EmergencyDialog
        cycleId={cycleId}
        open={emergencyOpen}
        onOpenChange={setEmergencyOpen}
        onAdded={() => setReloadKey((key) => key + 1)}
      />
    </div>
  );
}
