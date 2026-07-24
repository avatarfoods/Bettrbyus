"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarRange,
  FileUp,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  ShoppingCart,
  Snowflake,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { syncFromOdoo } from "@/lib/purchasing/actions";
import {
  generateCycle,
  importMasterFile,
  removeMasterImport,
  type GenerateResult,
} from "@/lib/purchasing/import-actions";
import {
  fetchCycles,
  fetchCycleWithLines,
  fetchLatestImport,
  type LineStatus,
  type PurchaseCycle,
  type PurchaseLine,
} from "@/lib/purchasing/fetch-cycles";
import {
  addEmergencyLine,
  deleteCycle,
  updateCycleStatus,
  updatePurchaseLine,
} from "@/lib/purchasing/update-line";
import type { Material } from "@/lib/purchasing/types";
import { PurchasingPlanDialog } from "@/components/purchasing-plan-dialog";
import { PurchasingProductDetailDialog } from "@/components/purchasing-product-detail";
import { Button, buttonVariants } from "@/components/ui/button";
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

function formatTabDate(value: string) {
  try {
    return format(parseISO(value), "MM/dd/yyyy");
  } catch {
    return value;
  }
}

function formatShortDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MM/dd");
  } catch {
    return value;
  }
}

function formatArrivedAt(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MM/dd/yyyy h:mm a");
  } catch {
    return value;
  }
}

function formatSyncedAt(value: string | null) {
  if (!value) return null;
  try {
    return format(parseISO(value), "MMM d, h:mm a");
  } catch {
    return null;
  }
}

function orderByTone(line: PurchaseLine): string {
  if (line.status !== "to_order" || !line.order_by_date) return "";
  const today = todayIso();
  if (line.order_by_date < today) return "text-destructive font-semibold";
  if (line.order_by_date === today) {
    return "text-amber-700 dark:text-amber-400 font-semibold";
  }
  return "";
}

type ImportInfo = {
  id: string;
  fileName: string;
  scheduleFrom: string | null;
  scheduleTo: string | null;
};

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
          <DialogTitle>Emergency item</DialogTitle>
          <DialogDescription>
            Urgent buy outside the computed plan.
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
              className="h-9"
            />
            <select
              value={materialId}
              onChange={(event) => setMaterialId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
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
              <Label htmlFor="emergency-cases">Cases</Label>
              <Input
                id="emergency-cases"
                type="number"
                value={cases}
                onChange={(event) => setCases(event.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="emergency-time">Required time</Label>
              <Input
                id="emergency-time"
                value={requiredTime}
                onChange={(event) => setRequiredTime(event.target.value)}
                placeholder="8:00 AM"
                className="h-9"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emergency-notes">Notes</Label>
            <Input
              id="emergency-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-9"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleAdd()} disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin" /> : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type LineRowProps = {
  line: PurchaseLine;
  onChanged: (line: PurchaseLine) => void;
  onOpenDetail: (materialId: string) => void;
};

function MatrixLineRow({ line, onChanged, onOpenDetail }: LineRowProps) {
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
    <TableRow
      className={cn(
        "h-9",
        line.is_emergency && "bg-destructive/5",
        line.required_to_order > 0 && line.status === "to_order" && "bg-amber-50/60 dark:bg-amber-950/20"
      )}
    >
      <TableCell className="px-2 py-1 font-mono text-xs">
        {material ? (
          <button
            type="button"
            onClick={() => onOpenDetail(material.id)}
            className="text-left text-primary underline-offset-2 hover:underline"
          >
            {material.item_code}
          </button>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="px-2 py-1 text-xs">
        <span className="flex items-center gap-1">
          {line.is_emergency && (
            <AlertTriangle className="size-3 shrink-0 text-destructive" />
          )}
          {material ? (
            <button
              type="button"
              onClick={() => onOpenDetail(material.id)}
              className="truncate text-left hover:underline"
              title="View product details from Odoo"
            >
              {material.name}
            </button>
          ) : (
            <span className="truncate">Unknown</span>
          )}
          {material?.is_protein && <Snowflake className="size-3 shrink-0 text-sky-500" />}
        </span>
      </TableCell>
      <TableCell className="px-2 py-1 text-right text-xs tabular-nums">
        {line.cases_required.toLocaleString()}
      </TableCell>
      <TableCell className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground">
        {line.on_hand_cases != null ? line.on_hand_cases.toLocaleString() : "—"}
      </TableCell>
      <TableCell className="px-2 py-1 text-right text-xs font-semibold tabular-nums">
        {line.required_to_order.toLocaleString()}
      </TableCell>
      <TableCell className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground">
        {line.lbs_required != null ? Math.round(line.lbs_required).toLocaleString() : "—"}
      </TableCell>
      <TableCell className={cn("px-2 py-1 text-xs tabular-nums", orderByTone(line))}>
        {formatShortDate(line.order_by_date)}
      </TableCell>
      <TableCell className="px-1 py-1">
        <select
          value={line.status}
          onChange={(event) => void save({ status: event.target.value as LineStatus })}
          disabled={isSaving}
          className="h-7 w-full min-w-24 rounded border border-input bg-background px-1 text-xs"
        >
          {(Object.keys(STATUS_LABELS) as LineStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="px-1 py-1">
        {isArrived ? (
          <span
            className="block min-w-36 px-1 text-xs font-medium text-green-700 dark:text-green-400"
            title="Actual arrival"
          >
            {formatArrivedAt(line.arrived_at)}
          </span>
        ) : (
          <Input
            type="date"
            value={line.arrival_date ?? ""}
            onChange={(event) => void save({ arrival_date: event.target.value || null })}
            disabled={isSaving}
            className="h-7 w-32 px-1 text-xs"
            title="Expected arrival (ETA)"
          />
        )}
      </TableCell>
      <TableCell className="px-1 py-1">
        <Input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            const value = notes.trim() || null;
            if (value !== (line.notes ?? null)) void save({ notes: value });
          }}
          placeholder=""
          disabled={isSaving}
          className="h-7 min-w-36 px-1 text-xs"
        />
      </TableCell>
    </TableRow>
  );
}

type PurchasingMatrixProps = {
  initialCycleId?: string;
};

export function PurchasingMatrix({ initialCycleId }: PurchasingMatrixProps) {
  const [cycles, setCycles] = useState<PurchaseCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(
    initialCycleId ?? null
  );
  const [cycle, setCycle] = useState<PurchaseCycle | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [latestImport, setLatestImport] = useState<ImportInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyToOrder, setOnlyToOrder] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [requiredDate, setRequiredDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [lastSyncLabel, setLastSyncLabel] = useState<string | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteImportOpen, setDeleteImportOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingImport, setIsDeletingImport] = useState(false);
  const [detailMaterialId, setDetailMaterialId] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isImporting, startImport] = useTransition();
  const [isGenerating, startGenerate] = useTransition();
  const [isSyncing, startSync] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const supabase = createClient();
      const [cyclesRes, importRes, materialsRes] = await Promise.all([
        fetchCycles(supabase),
        fetchLatestImport(supabase),
        supabase
          .from("purchasing_materials")
          .select("last_synced_at")
          .not("last_synced_at", "is", null)
          .order("last_synced_at", { ascending: false })
          .limit(1),
      ]);
      if (!active) return;

      setCycles(cyclesRes.data);
      if (cyclesRes.error) setLoadError(cyclesRes.error);

      if (importRes.data) {
        const stats = (importRes.data.stats ?? {}) as Record<string, unknown>;
        const info: ImportInfo = {
          id: importRes.data.id,
          fileName: importRes.data.file_name,
          scheduleFrom: (stats.schedule_from as string) ?? null,
          scheduleTo: (stats.schedule_to as string) ?? null,
        };
        setLatestImport(info);
        setFromDate((current) => current || info.scheduleFrom || "");
        setToDate((current) => current || info.scheduleTo || "");
      } else {
        setLatestImport(null);
      }

      const syncAt = materialsRes.data?.[0]?.last_synced_at ?? null;
      setLastSyncLabel(formatSyncedAt(syncAt));

      const preferred =
        initialCycleId && cyclesRes.data.some((row) => row.id === initialCycleId)
          ? initialCycleId
          : cyclesRes.data.find((row) => row.status === "in_progress")?.id ??
            cyclesRes.data[0]?.id ??
            null;
      setSelectedCycleId((current) => current ?? preferred);
      setIsLoading(false);
      if (cyclesRes.data.length === 0) setShowGenerate(true);
    })();

    return () => {
      active = false;
    };
  }, [initialCycleId, reloadKey]);

  useEffect(() => {
    if (!selectedCycleId) return;

    let active = true;
    (async () => {
      const supabase = createClient();
      const result = await fetchCycleWithLines(supabase, selectedCycleId);
      if (!active) return;
      if (result.error) {
        setLoadError(result.error);
        return;
      }
      setCycle(result.cycle);
      setLines(result.lines);
      if (result.cycle) {
        setRequiredDate(result.cycle.required_date);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedCycleId, reloadKey]);

  const activeCycle = selectedCycleId ? cycle : null;
  const activeLines = useMemo(
    () => (selectedCycleId ? lines : []),
    [selectedCycleId, lines]
  );

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeLines.filter((line) => {
      if (onlyToOrder && !line.is_emergency && line.required_to_order <= 0) {
        return false;
      }
      if (!query) return true;
      return (
        (line.material?.item_code ?? "").toLowerCase().includes(query) ||
        (line.material?.name ?? "").toLowerCase().includes(query)
      );
    });
  }, [activeLines, search, onlyToOrder]);

  const { proteinLines, otherLines } = useMemo(() => {
    const proteins: PurchaseLine[] = [];
    const others: PurchaseLine[] = [];
    for (const line of filteredLines) {
      if (line.material?.is_protein) proteins.push(line);
      else others.push(line);
    }
    return { proteinLines: proteins, otherLines: others };
  }, [filteredLines]);

  const summary = useMemo(() => {
    const actionable = activeLines.filter(
      (line) => line.required_to_order > 0 || line.is_emergency
    );
    const proteins = actionable.filter((line) => line.material?.is_protein);
    return {
      total: actionable.length,
      proteins: proteins.length,
      toOrder: actionable.filter((line) => line.status === "to_order").length,
      ordered: actionable.filter((line) => line.status === "ordered").length,
      overdue: actionable.filter(
        (line) =>
          line.status === "to_order" &&
          line.order_by_date !== null &&
          line.order_by_date <= todayIso()
      ).length,
    };
  }, [activeLines]);

  function handleLineChanged(changed: PurchaseLine) {
    setLines((current) =>
      current.map((item) => (item.id === changed.id ? changed : item))
    );
  }

  const sortedTabs = useMemo(
    () =>
      [...cycles].sort((a, b) => a.required_date.localeCompare(b.required_date)),
    [cycles]
  );

  function handleImportFile(file: File | null) {
    if (!file) return;
    setActionMessage(null);
    setActionError(null);
    setGenerateResult(null);
    startImport(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await importMasterFile(formData);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setActionMessage(result.message);
      if (result.importId && result.stats) {
        setLatestImport({
          id: result.importId,
          fileName: file.name,
          scheduleFrom: result.stats.scheduleFrom,
          scheduleTo: result.stats.scheduleTo,
        });
        setFromDate(result.stats.scheduleFrom ?? "");
        setToDate(result.stats.scheduleTo ?? "");
      }
      setShowGenerate(true);
    });
  }

  function handleGenerate() {
    if (!latestImport || !requiredDate || !fromDate || !toDate) return;
    setActionMessage(null);
    setActionError(null);
    setGenerateResult(null);
    startGenerate(async () => {
      const result = await generateCycle({
        importId: latestImport.id,
        requiredDate,
        fromDate,
        toDate,
      });
      setGenerateResult(result);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setActionMessage(result.message);
      setShowGenerate(false);
      setReloadKey((key) => key + 1);
      if (result.cycleId) setSelectedCycleId(result.cycleId);
    });
  }

  function handleSync() {
    setActionMessage(null);
    setActionError(null);
    startSync(async () => {
      const result = await syncFromOdoo();
      if (result.ok) {
        setActionMessage(result.message);
        setLastSyncLabel(formatSyncedAt(new Date().toISOString()));
        setReloadKey((key) => key + 1);
      } else {
        setActionError(result.message);
      }
    });
  }

  async function handleCycleStatus(status: "in_progress" | "done") {
    if (!cycle) return;
    const supabase = createClient();
    const result = await updateCycleStatus(supabase, cycle.id, status);
    if (result.success) {
      setCycle({ ...cycle, status });
      setCycles((current) =>
        current.map((row) => (row.id === cycle.id ? { ...row, status } : row))
      );
    }
  }

  async function handleDeleteCycle() {
    if (!activeCycle) return;
    setIsDeleting(true);
    setActionError(null);
    const supabase = createClient();
    const result = await deleteCycle(supabase, activeCycle.id);
    setIsDeleting(false);

    if (!result.success) {
      setActionError(result.errorMessage ?? "Could not delete this week.");
      return;
    }

    const remaining = cycles.filter((row) => row.id !== activeCycle.id);
    setCycles(remaining);
    setCycle(null);
    setLines([]);
    setSelectedCycleId(remaining[remaining.length - 1]?.id ?? null);
    setDeleteOpen(false);
    setActionMessage(
      `Deleted week ${formatTabDate(activeCycle.required_date)}${
        activeCycle.po_number != null ? ` (PO #${activeCycle.po_number})` : ""
      }.`
    );
  }

  async function handleDeleteImport() {
    if (!latestImport) return;
    const previous = latestImport;
    setIsDeletingImport(true);
    setActionError(null);
    // Clear header immediately — DB may already be empty while UI is stale.
    setLatestImport(null);
    setPlanOpen(false);

    const result = await removeMasterImport(previous.id);
    setIsDeletingImport(false);
    setDeleteImportOpen(false);

    if (!result.ok) {
      setLatestImport(previous);
      setActionError(result.message || "Could not remove this plan.");
      return;
    }

    setLatestImport(result.nextImport ?? null);
    if (result.nextImport) {
      setFromDate(result.nextImport.scheduleFrom || "");
      setToDate(result.nextImport.scheduleTo || "");
    } else {
      setFromDate("");
      setToDate("");
    }
    setActionMessage(result.message || `Removed plan ${previous.fileName}.`);
    setReloadKey((key) => key + 1);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShoppingCart className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                Component Matrix
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {latestImport ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setPlanOpen(true)}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {latestImport.fileName}
                    </button>
                    {` · schedule ${formatShortDate(latestImport.scheduleFrom)}–${formatShortDate(latestImport.scheduleTo)}`}
                  </>
                ) : (
                  "Import the master plan to start"
                )}
                {lastSyncLabel ? ` · Odoo last sync ${lastSyncLabel}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsm,.xlsx"
                className="hidden"
                onChange={(event) => {
                  handleImportFile(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
              <Link
                href="/purchasing/materials"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                <Package />
                <span className="hidden md:inline">Materials</span>
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPlanOpen(true)}
                disabled={!latestImport}
                title={
                  latestImport
                    ? `View schedule from ${latestImport.fileName}`
                    : "Import a master plan first"
                }
              >
                <CalendarRange />
                <span className="hidden sm:inline">View plan</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteImportOpen(true)}
                disabled={!latestImport || isDeletingImport}
                title={
                  latestImport
                    ? `Remove imported plan ${latestImport.fileName}`
                    : "No plan imported"
                }
              >
                {isDeletingImport ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                <span className="hidden sm:inline">Remove plan</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? <Loader2 className="animate-spin" /> : <FileUp />}
                <span className="hidden sm:inline">Import plan</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing}
              >
                {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                <span className="hidden sm:inline">Sync Odoo</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showGenerate ? "secondary" : "default"}
                onClick={() => setShowGenerate((open) => !open)}
              >
                <Wand2 />
                <span className="hidden sm:inline">
                  {activeCycle ? "Regenerate" : "New week"}
                </span>
              </Button>
              {activeCycle && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEmergencyOpen(true)}
                >
                  <Plus />
                  <span className="hidden lg:inline">Emergency</span>
                </Button>
              )}
            </div>
          </div>

          {/* Sheet-style date tabs */}
          <div className="-mx-1 flex items-end gap-0.5 overflow-x-auto px-1 pb-0">
            {sortedTabs.map((tab) => {
              const active = tab.id === selectedCycleId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSelectedCycleId(tab.id);
                    setShowGenerate(false);
                  }}
                  className={cn(
                    "shrink-0 rounded-t-md border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-border bg-background text-foreground shadow-[0_-1px_0_0_hsl(var(--background))]"
                      : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    tab.status === "done" && !active && "opacity-60"
                  )}
                >
                  {formatTabDate(tab.required_date)}
                  {tab.po_number != null && (
                    <span className="ml-1 text-[10px] opacity-70">#{tab.po_number}</span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setShowGenerate(true);
                setRequiredDate("");
                setSelectedCycleId(null);
              }}
              className="shrink-0 rounded-t-md border border-b-0 border-dashed border-border/70 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              + New
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3 px-3 py-4 sm:px-4">
        {(actionMessage || actionError) && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              actionError
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400"
            )}
          >
            <p className="min-w-0 flex-1">{actionError ?? actionMessage}</p>
            <button
              type="button"
              onClick={() => {
                setActionMessage(null);
                setActionError(null);
              }}
              className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
              aria-label="Dismiss message"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {generateResult?.unresolved && generateResult.unresolved.length > 0 && (
          <p className="rounded-md border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {generateResult.unresolved.length} ingredient names still unmatched.
            Re-import the master plan after syncing the catalog so matrix mappings
            can be saved, or map them on Materials.
          </p>
        )}

        {showGenerate && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 text-sm font-medium">
              {activeCycle ? "Regenerate this week" : "Generate a new week"}
            </div>
            <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
              <div className="flex flex-col gap-1">
                <Label htmlFor="matrix-required" className="text-xs">
                  Required date (PO)
                </Label>
                <Input
                  id="matrix-required"
                  type="date"
                  value={requiredDate}
                  onChange={(event) => setRequiredDate(event.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="matrix-from" className="text-xs">
                  Production from
                </Label>
                <Input
                  id="matrix-from"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="matrix-to" className="text-xs">
                  Production to
                </Label>
                <Input
                  id="matrix-to"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="h-9"
                />
              </div>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={
                  !latestImport ||
                  !requiredDate ||
                  !fromDate ||
                  !toDate ||
                  isGenerating
                }
              >
                {isGenerating ? <Loader2 className="animate-spin" /> : <Wand2 />}
                Generate buy list
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Required date = when materials must be on site. Production window =
              which schedule days to cover (use dates inside the imported master
              file range).
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {activeCycle ? (
              <>
                PO #{activeCycle.po_number ?? "—"} · required{" "}
                {formatTabDate(activeCycle.required_date)}
                {activeCycle.week_label ? ` · covers ${activeCycle.week_label}` : ""} ·{" "}
                {summary.total} to buy
                {summary.proteins > 0 ? ` · ${summary.proteins} protein` : ""} ·{" "}
                {summary.toOrder} open
                {summary.overdue > 0 && (
                  <span className="text-destructive">
                    {" "}
                    · {summary.overdue} past order-by
                  </span>
                )}
              </>
            ) : (
              "Pick a week tab or generate a new one."
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter item…"
              className="h-8 w-44 text-xs"
            />
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={onlyToOrder}
                onChange={(event) => setOnlyToOrder(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              Need to order only
            </label>
            {activeCycle && activeCycle.status === "in_progress" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleCycleStatus("done")}
              >
                Mark done
              </Button>
            ) : activeCycle ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleCycleStatus("in_progress")}
              >
                Reopen
              </Button>
            ) : null}
            {activeCycle && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 />
                <span className="hidden sm:inline">Delete week</span>
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !activeCycle ? (
          <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No week selected. Import the master plan, then generate a buy list.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="h-8 px-2 text-[11px] font-semibold uppercase tracking-wide">
                    Item #
                  </TableHead>
                  <TableHead className="h-8 min-w-48 px-2 text-[11px] font-semibold uppercase tracking-wide">
                    Description
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                    Total case req.
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                    On hand
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                    Req. to order
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                    Total lbs
                  </TableHead>
                  <TableHead className="h-8 px-2 text-[11px] font-semibold uppercase tracking-wide">
                    Order by
                  </TableHead>
                  <TableHead className="h-8 w-28 px-2 text-[11px] font-semibold uppercase tracking-wide">
                    Status
                  </TableHead>
                  <TableHead className="h-8 w-36 px-2 text-[11px] font-semibold uppercase tracking-wide">
                    ETA / Arrived
                  </TableHead>
                  <TableHead className="h-8 min-w-40 px-2 text-[11px] font-semibold uppercase tracking-wide">
                    Notes
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLines.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="h-20 text-center text-sm text-muted-foreground"
                    >
                      {activeLines.length === 0
                        ? "Empty week — hit Regenerate after importing the master plan."
                        : "No rows match the filter."}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {proteinLines.length > 0 && (
                      <>
                        <TableRow className="bg-sky-50 hover:bg-sky-50 dark:bg-sky-950/40 dark:hover:bg-sky-950/40">
                          <TableCell
                            colSpan={10}
                            className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Snowflake className="size-3.5" />
                              Protein ({proteinLines.length}) — thaw buffer applies
                            </span>
                          </TableCell>
                        </TableRow>
                        {proteinLines.map((line) => (
                          <MatrixLineRow
                            key={line.id}
                            line={line}
                            onChanged={handleLineChanged}
                            onOpenDetail={setDetailMaterialId}
                          />
                        ))}
                      </>
                    )}
                    {otherLines.length > 0 && (
                      <>
                        <TableRow className="bg-muted/60 hover:bg-muted/60">
                          <TableCell
                            colSpan={10}
                            className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            Materials ({otherLines.length})
                          </TableCell>
                        </TableRow>
                        {otherLines.map((line) => (
                          <MatrixLineRow
                            key={line.id}
                            line={line}
                            onChanged={handleLineChanged}
                            onOpenDetail={setDetailMaterialId}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {activeCycle && (
        <EmergencyDialog
          cycleId={activeCycle.id}
          open={emergencyOpen}
          onOpenChange={setEmergencyOpen}
          onAdded={() => setReloadKey((key) => key + 1)}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this week?</DialogTitle>
            <DialogDescription>
              {activeCycle
                ? `This removes the ${formatTabDate(activeCycle.required_date)} tab${
                    activeCycle.po_number != null
                      ? ` (PO #${activeCycle.po_number})`
                      : ""
                  } and all of its buy lines, statuses, ETAs, and notes. The master plan import is kept.`
                : "This removes the selected week tab and all of its buy lines."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteCycle()}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteImportOpen} onOpenChange={setDeleteImportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove imported plan?</DialogTitle>
            <DialogDescription>
              {latestImport
                ? `This clears all imported master plans (including ${latestImport.fileName}). Existing weeks and buy lists stay. Materials and recipes stay. You can import a new plan afterward.`
                : "This clears all imported master plans."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteImportOpen(false)}
              disabled={isDeletingImport}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteImport()}
              disabled={isDeletingImport || !latestImport}
            >
              {isDeletingImport ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              Remove plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PurchasingProductDetailDialog
        materialId={detailMaterialId}
        open={detailMaterialId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailMaterialId(null);
        }}
      />

      <PurchasingPlanDialog
        importId={latestImport?.id ?? null}
        open={planOpen}
        onOpenChange={setPlanOpen}
      />
    </div>
  );
}
