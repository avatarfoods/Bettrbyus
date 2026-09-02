"use client";

import { useEffect, useMemo, useRef, useState, useTransition, Fragment } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarRange,
  Columns3,
  FileUp,
  Loader2,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Send,
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
  buildFinalOrderSnapshot,
  clearFinalOrderLocal,
  groupLinesByItemCategory,
  loadFinalOrder,
  loadGroupTracking,
  saveFinalOrder,
  type FinalOrderSnapshot,
  type GroupTrackingMap,
} from "@/lib/purchasing/finalize-order";
import { printFinalOrder } from "@/lib/purchasing/print-final-order";
import {
  fetchCycles,
  fetchCycleWithLines,
  fetchLatestImport,
  lineItemCode,
  lineItemName,
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
import { PurchasingFinalOrderDialog } from "@/components/purchasing-final-order-dialog";
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

const MATRIX_COLUMN_DEFS = [
  { key: "itemCode", label: "Item #", always: true },
  { key: "description", label: "Description", always: true },
  { key: "casesRequired", label: "Total case req.", always: false },
  { key: "onHand", label: "On hand", always: false },
  { key: "requiredToOrder", label: "Req. to order", always: false },
  { key: "totalLbs", label: "Total lbs", always: false },
] as const;

type MatrixColumnKey = (typeof MATRIX_COLUMN_DEFS)[number]["key"];

type VisibleColumns = Record<MatrixColumnKey, boolean>;

const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
  itemCode: true,
  description: true,
  casesRequired: true,
  onHand: true,
  requiredToOrder: true,
  totalLbs: true,
};

const VISIBLE_COLUMNS_STORAGE_KEY = "purchasing-matrix-visible-columns";

const ONLY_TO_ORDER_STORAGE_KEY = "purchasing-matrix-only-to-order";

const HIDE_PRODUCE_STORAGE_KEY = "purchasing-matrix-hide-produce";

/** Produce is ordered separately, but it still belongs in the full count. */
function loadHideProduce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIDE_PRODUCE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Default shows the full Master PO list; buyers can narrow to shortages. */
function loadOnlyToOrder(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ONLY_TO_ORDER_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function loadVisibleColumns(): VisibleColumns {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
  try {
    const raw = window.localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw) as Partial<VisibleColumns>;
    return {
      ...DEFAULT_VISIBLE_COLUMNS,
      ...parsed,
      itemCode: true,
      description: true,
    };
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

function countVisibleColumns(visible: VisibleColumns) {
  return MATRIX_COLUMN_DEFS.filter((col) => visible[col.key]).length;
}

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

/** Excel Master PO department labels — only used to hide Produce rows. */
function normalizeMasterPoDepartment(value: string | null | undefined): string {
  const raw = (value ?? "").trim().toUpperCase();
  if (!raw) return "OTHER";
  if (raw.startsWith("MAIN KITCHEN")) return "MAIN KITCHEN";
  if (raw === "PREP/MIXING" || raw === "PREP MIXING") return "FRESH MIXING";
  if (raw.startsWith("PRODUCE")) return "PRODUCE";
  return raw;
}

function isProduceBuyLine(line: PurchaseLine): boolean {
  if (line.material?.storage_type === "produce") return true;
  const dept = normalizeMasterPoDepartment(line.material?.department);
  return dept === "PRODUCE";
}

function formatShortDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MM/dd");
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
  visibleColumns: VisibleColumns;
  onChanged: (line: PurchaseLine) => void;
  onOpenDetail: (materialId: string) => void;
};

function MatrixLineRow({
  line,
  visibleColumns,
  onChanged,
  onOpenDetail,
}: LineRowProps) {
  const [casesRequired, setCasesRequired] = useState(String(line.cases_required));
  const [editingCases, setEditingCases] = useState(false);
  const casesInputRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /*
    Follow the saved value while rendering, not after.

    An effect would show the stale figure for a frame every time a save came
    back, which on a grid of numbers looks like the value flickering between
    two answers. Adjusting during render is React's own pattern for state
    that has to track a prop.
  */
  const [lastSaved, setLastSaved] = useState(line.cases_required);
  if (lastSaved !== line.cases_required) {
    setLastSaved(line.cases_required);
    setCasesRequired(String(line.cases_required));
  }

  useEffect(() => {
    if (editingCases) {
      casesInputRef.current?.focus();
      casesInputRef.current?.select();
    }
  }, [editingCases]);

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

  async function saveCases() {
    const next = Math.max(0, Math.ceil(Number(casesRequired)));
    setEditingCases(false);
    if (!Number.isFinite(next) || next === line.cases_required) {
      setCasesRequired(String(line.cases_required));
      return;
    }
    const onHand = line.on_hand_cases ?? 0;
    const requiredToOrder = Math.max(0, next - onHand);
    await save({
      cases_required: next,
      required_to_order: requiredToOrder,
    });
  }

  const material = line.material;

  return (
    <TableRow
      className={cn(
        "h-9",
        line.is_emergency && "bg-destructive/5",
        line.required_to_order > 0 && "bg-amber-50/60 dark:bg-amber-950/20"
      )}
    >
      {visibleColumns.itemCode && (
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
            <span
              className="text-muted-foreground"
              title="Not in Odoo — shown from the Excel MASTER PICKING ORDER"
            >
              {lineItemCode(line)}
            </span>
          )}
        </TableCell>
      )}
      {visibleColumns.description && (
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
              <span
                className="truncate text-muted-foreground"
                title="Not in Odoo — shown from the Excel MASTER PICKING ORDER"
              >
                {lineItemName(line)}
              </span>
            )}
            {material?.is_protein && <Snowflake className="size-3 shrink-0 text-sky-500" />}
          </span>
        </TableCell>
      )}
      {visibleColumns.casesRequired && (
        <TableCell className="px-2 py-1 text-right text-xs tabular-nums">
          {editingCases ? (
            <Input
              ref={casesInputRef}
              type="number"
              min={0}
              step={1}
              value={casesRequired}
              onChange={(event) => setCasesRequired(event.target.value)}
              onBlur={() => void saveCases()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setCasesRequired(String(line.cases_required));
                  setEditingCases(false);
                }
              }}
              disabled={isSaving}
              className="h-7 w-20 ml-auto text-right tabular-nums"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingCases(true)}
              className="ml-auto block min-w-12 rounded px-1.5 py-0.5 text-right hover:bg-muted"
              title="Click to edit total case req."
            >
              {line.cases_required.toLocaleString()}
            </button>
          )}
        </TableCell>
      )}
      {visibleColumns.onHand && (
        <TableCell className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground">
          {line.on_hand_cases != null ? line.on_hand_cases.toLocaleString() : "—"}
        </TableCell>
      )}
      {visibleColumns.requiredToOrder && (
        <TableCell className="px-2 py-1 text-right text-xs font-semibold tabular-nums">
          {line.required_to_order.toLocaleString()}
        </TableCell>
      )}
      {visibleColumns.totalLbs && (
        <TableCell className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground">
          {line.lbs_required != null ? Math.round(line.lbs_required).toLocaleString() : "—"}
        </TableCell>
      )}
    </TableRow>
  );
}

type CategorySectionHeaderProps = {
  label: string;
  lineCount: number;
  colSpan: number;
};

function CategorySectionHeader({
  label,
  lineCount,
  colSpan,
}: CategorySectionHeaderProps) {
  return (
    <TableRow className="bg-muted/70 hover:bg-muted/70">
      <TableCell colSpan={colSpan} className="px-2 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {label} ({lineCount})
        </span>
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
  const [onlyToOrder, setOnlyToOrder] = useState(false);
  const [hideProduce, setHideProduce] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(
    DEFAULT_VISIBLE_COLUMNS
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [requiredDate, setRequiredDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [extraPercent, setExtraPercent] = useState("0");
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
  const [finalOrderOpen, setFinalOrderOpen] = useState(false);
  const [finalOrderSnapshot, setFinalOrderSnapshot] =
    useState<FinalOrderSnapshot | null>(null);
  const [groupTracking, setGroupTracking] = useState<GroupTrackingMap>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [isImporting, startImport] = useTransition();
  const [isGenerating, startGenerate] = useTransition();
  const [isSyncing, startSync] = useTransition();
  const [isFinalizing, startFinalize] = useTransition();
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

  /*
    The saved view, read once on the client rather than in an effect.

    These come from localStorage, which does not exist on the server, so the
    first render has to use the defaults either way - but reading them during
    the first client render means the columns never appear wrong and then
    correct themselves.
  */
  const [readSaved, setReadSaved] = useState(false);
  if (typeof window !== "undefined" && !readSaved) {
    setReadSaved(true);
    setVisibleColumns(loadVisibleColumns());
    setOnlyToOrder(loadOnlyToOrder());
    setHideProduce(loadHideProduce());
  }

  useEffect(() => {
    if (!columnsOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (
        columnsMenuRef.current &&
        !columnsMenuRef.current.contains(event.target as Node)
      ) {
        setColumnsOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [columnsOpen]);

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
        setGroupTracking(loadGroupTracking(result.cycle.id));
        setFinalOrderSnapshot(loadFinalOrder(result.cycle.id));
      } else {
        setGroupTracking({});
        setFinalOrderSnapshot(null);
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

  const visibleColumnCount = useMemo(
    () => countVisibleColumns(visibleColumns),
    [visibleColumns]
  );

  function handleOnlyToOrderChange(next: boolean) {
    setOnlyToOrder(next);
    try {
      window.localStorage.setItem(ONLY_TO_ORDER_STORAGE_KEY, String(next));
    } catch {
      // ignore storage failures
    }
  }

  function handleHideProduceChange(next: boolean) {
    setHideProduce(next);
    try {
      window.localStorage.setItem(HIDE_PRODUCE_STORAGE_KEY, String(next));
    } catch {
      // ignore storage failures
    }
  }

  function toggleColumn(key: MatrixColumnKey) {
    const def = MATRIX_COLUMN_DEFS.find((col) => col.key === key);
    if (def?.always) return;
    setVisibleColumns((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        window.localStorage.setItem(
          VISIBLE_COLUMNS_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeLines.filter((line) => {
      if (hideProduce && isProduceBuyLine(line)) return false;
      if (onlyToOrder && !line.is_emergency && line.required_to_order <= 0) {
        return false;
      }
      if (!query) return true;
      return (
        lineItemCode(line).toLowerCase().includes(query) ||
        lineItemName(line).toLowerCase().includes(query)
      );
    });
  }, [activeLines, search, onlyToOrder, hideProduce]);

  const categorySections = useMemo(
    () => groupLinesByItemCategory(filteredLines),
    [filteredLines]
  );

  const totals = useMemo(() => {
    return filteredLines.reduce(
      (acc, line) => {
        acc.items += 1;
        acc.casesRequired += line.cases_required;
        acc.onHand += line.on_hand_cases ?? 0;
        acc.requiredToOrder += line.required_to_order;
        acc.lbsRequired += line.lbs_required ?? 0;
        if (line.required_to_order > 0) acc.itemsToOrder += 1;
        return acc;
      },
      {
        items: 0,
        itemsToOrder: 0,
        casesRequired: 0,
        onHand: 0,
        requiredToOrder: 0,
        lbsRequired: 0,
      }
    );
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

  const localOrderByCycle = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of cycles) {
      const saved = loadFinalOrder(row.id);
      if (saved) map[row.id] = saved.orderNumber;
    }
    if (finalOrderSnapshot) {
      map[finalOrderSnapshot.cycleId] = finalOrderSnapshot.orderNumber;
    }
    return map;
  }, [cycles, finalOrderSnapshot]);

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
        extraPercent: Number(extraPercent) || 0,
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

  function handleApplyExtra() {
    const importId = activeCycle?.import_id ?? latestImport?.id;
    if (!activeCycle || !importId) {
      setActionError("Select a Master PO that was generated from an import.");
      return;
    }
    const label = activeCycle.week_label ?? "";
    const match = label.match(
      /(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i
    );
    const applyFrom = match?.[1] ?? fromDate;
    const applyTo = match?.[2] ?? toDate;
    if (!applyFrom || !applyTo) {
      setActionError("Set production dates, then apply EXTRA %.");
      return;
    }
    setActionMessage(null);
    setActionError(null);
    setGenerateResult(null);
    startGenerate(async () => {
      const result = await generateCycle({
        importId,
        requiredDate: activeCycle.required_date,
        fromDate: applyFrom,
        toDate: applyTo,
        extraPercent: Number(extraPercent) || 0,
      });
      setGenerateResult(result);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setActionMessage(
        `Applied EXTRA ${Number(extraPercent) || 0}% — ${result.message}`
      );
      setReloadKey((key) => key + 1);
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

  function handleCreateFinalOrder() {
    if (!activeCycle) return;
    setActionError(null);
    setActionMessage(null);
    startFinalize(() => {
      const result = buildFinalOrderSnapshot({
        cycle: activeCycle,
        lines: activeLines,
        tracking: groupTracking,
      });
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      saveFinalOrder(result.snapshot);
      setFinalOrderSnapshot(result.snapshot);
      setFinalOrderOpen(true);
      setActionMessage(
        `Final order ${result.snapshot.orderNumber} created (${result.snapshot.totals.lineCount} lines).`
      );
    });
  }

  function handleReopenFinalOrder() {
    if (!activeCycle) return;
    clearFinalOrderLocal(activeCycle.id);
    setFinalOrderSnapshot(null);
    setActionMessage("Final order cleared — you can edit and recreate it.");
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
      `Deleted Master PO ${formatTabDate(activeCycle.required_date)}${
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
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[1px] bg-primary/10 text-primary">
              <ShoppingCart className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                Total Orders
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
                  {activeCycle ? "Regenerate Master PO" : "New Master PO"}
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
                  {localOrderByCycle[tab.id] ? (
                    <span className="ml-1 text-[10px] opacity-70">
                      {localOrderByCycle[tab.id]}
                    </span>
                  ) : tab.po_number != null ? (
                    <span className="ml-1 text-[10px] opacity-70">#{tab.po_number}</span>
                  ) : null}
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
        {generateResult?.warnings && generateResult.warnings.length > 0 && (
          <p className="rounded-md border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {generateResult.warnings.join(" ")}
          </p>
        )}

        {showGenerate && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-1 text-sm font-medium">
              {activeCycle
                ? "Regenerate Master PO for this week"
                : "Generate Master PO"}
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Quantities come from Excel MASTER PICKING ORDER (column QTY
              ORDER), then netted against on-hand. Rows with QTY ORDER 0 still
              list. Set EXTRA % if you want a buffer, and you can edit Total
              case req. on any row after generating.
            </p>
            <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
              <div className="flex flex-col gap-1">
                <Label htmlFor="matrix-required" className="text-xs">
                  PO / required date
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
                  Production dates from
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
                  Production dates to
                </Label>
                <Input
                  id="matrix-to"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="matrix-extra" className="text-xs">
                  EXTRA %
                </Label>
                <Input
                  id="matrix-extra"
                  type="number"
                  min={0}
                  step={1}
                  value={extraPercent}
                  onChange={(event) => setExtraPercent(event.target.value)}
                  className="h-9"
                  placeholder="0"
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
                Generate Master PO
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Production dates = schedule days to cover (Excel Production Need).
              PO / required date = when materials must be on site. Master PO
              explodes Kitchen AM/PM, Fresh Mixing, and Garde Manger only —
              Assembly / Finished / Produce schedule rows are skipped so
              ingredients are not double-counted. Packaging and min/max from
              Excel Master PO# are not included yet.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {activeCycle ? (
              <>
                Master PO #{activeCycle.po_number ?? "—"}
                {finalOrderSnapshot
                  ? ` · Final ${finalOrderSnapshot.orderNumber}`
                  : ""}{" "}
                · required{" "}
                {formatTabDate(activeCycle.required_date)}
                {activeCycle.week_label ? ` · production ${activeCycle.week_label}` : ""} ·{" "}
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
              "Pick a Master PO tab, or generate one from production dates."
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {activeCycle && (
              <div className="flex items-center gap-1.5">
                <Label htmlFor="matrix-extra-live" className="text-xs whitespace-nowrap">
                  EXTRA %
                </Label>
                <Input
                  id="matrix-extra-live"
                  type="number"
                  min={0}
                  step={1}
                  value={extraPercent}
                  onChange={(event) => setExtraPercent(event.target.value)}
                  className="h-8 w-16 text-xs"
                  placeholder="0"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleApplyExtra}
                  disabled={isGenerating}
                  title="Recalculate cases/lbs from the production schedule with this EXTRA %"
                >
                  {isGenerating ? <Loader2 className="animate-spin" /> : "Apply"}
                </Button>
              </div>
            )}
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter item…"
              className="h-8 w-44 text-xs"
            />
            <div className="relative" ref={columnsMenuRef}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setColumnsOpen((open) => !open)}
                aria-expanded={columnsOpen}
                aria-haspopup="menu"
              >
                <Columns3 />
                Columns
              </Button>
              {columnsOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-56 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
                >
                  <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Show columns
                  </p>
                  <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
                    {MATRIX_COLUMN_DEFS.map((col) => (
                      <label
                        key={col.key}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted",
                          col.always && "cursor-default opacity-70"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns[col.key]}
                          disabled={col.always}
                          onChange={() => toggleColumn(col.key)}
                          className="size-3.5 accent-primary"
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-1.5 w-full rounded px-1.5 py-1 text-left text-[11px] text-primary hover:bg-muted"
                    onClick={() => {
                      setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
                      try {
                        window.localStorage.setItem(
                          VISIBLE_COLUMNS_STORAGE_KEY,
                          JSON.stringify(DEFAULT_VISIBLE_COLUMNS)
                        );
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Show all
                  </button>
                </div>
              )}
            </div>
            <label
              className="flex items-center gap-1.5 text-xs"
              title="Hide rows already covered by on hand (Req. to order = 0)"
            >
              <input
                type="checkbox"
                checked={onlyToOrder}
                onChange={(event) => handleOnlyToOrderChange(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              Need to order only
            </label>
            <label
              className="flex items-center gap-1.5 text-xs"
              title="Produce is ordered separately from the Produce Schedule"
            >
              <input
                type="checkbox"
                checked={hideProduce}
                onChange={(event) => handleHideProduceChange(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              Hide produce
            </label>
            {activeCycle && !finalOrderSnapshot && (
              <Button
                type="button"
                size="sm"
                onClick={() => handleCreateFinalOrder()}
                disabled={isFinalizing || activeLines.length === 0}
              >
                {isFinalizing ? <Loader2 className="animate-spin" /> : <Send />}
                Create Final Order PO
              </Button>
            )}
            {activeCycle && finalOrderSnapshot && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFinalOrderOpen(true)}
                >
                  <Printer />
                  Print {finalOrderSnapshot.orderNumber}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleReopenFinalOrder()}
                  disabled={isFinalizing}
                >
                  Reopen order
                </Button>
              </>
            )}
            {activeCycle && activeCycle.status === "in_progress" && !finalOrderSnapshot ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleCycleStatus("done")}
              >
                Mark done
              </Button>
            ) : activeCycle && !finalOrderSnapshot ? (
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
                <span className="hidden sm:inline">Delete Master PO</span>
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
            No Master PO selected. Import the master plan, set production dates,
            then generate from the schedule.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {visibleColumns.itemCode && (
                    <TableHead className="h-8 px-2 text-[11px] font-semibold uppercase tracking-wide">
                      Item #
                    </TableHead>
                  )}
                  {visibleColumns.description && (
                    <TableHead className="h-8 min-w-48 px-2 text-[11px] font-semibold uppercase tracking-wide">
                      Description
                    </TableHead>
                  )}
                  {visibleColumns.casesRequired && (
                    <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                      Total case req.
                    </TableHead>
                  )}
                  {visibleColumns.onHand && (
                    <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                      On hand
                    </TableHead>
                  )}
                  {visibleColumns.requiredToOrder && (
                    <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                      Req. to order
                    </TableHead>
                  )}
                  {visibleColumns.totalLbs && (
                    <TableHead className="h-8 px-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                      Total lbs
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLines.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumnCount}
                      className="h-20 text-center text-sm text-muted-foreground"
                    >
                      {activeLines.length === 0
                        ? "Empty week — hit Regenerate after importing the master plan."
                        : "No rows match the filter."}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {categorySections.map((section) => (
                      <Fragment key={section.key}>
                        <CategorySectionHeader
                          label={section.label}
                          lineCount={section.lines.length}
                          colSpan={visibleColumnCount}
                        />
                        {section.lines.map((line) => (
                          <MatrixLineRow
                            key={line.id}
                            line={line}
                            visibleColumns={visibleColumns}
                            onChanged={handleLineChanged}
                            onOpenDetail={setDetailMaterialId}
                          />
                        ))}
                      </Fragment>
                    ))}
                    <TableRow className="border-t-2 bg-muted/60 hover:bg-muted/60">
                      {visibleColumns.itemCode && (
                        <TableCell className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
                          Total
                        </TableCell>
                      )}
                      {visibleColumns.description && (
                        <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">
                          {totals.items.toLocaleString()} items ·{" "}
                          {totals.itemsToOrder.toLocaleString()} to order
                        </TableCell>
                      )}
                      {visibleColumns.casesRequired && (
                        <TableCell className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums">
                          {totals.casesRequired.toLocaleString()}
                        </TableCell>
                      )}
                      {visibleColumns.onHand && (
                        <TableCell className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                          {totals.onHand.toLocaleString()}
                        </TableCell>
                      )}
                      {visibleColumns.requiredToOrder && (
                        <TableCell className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums">
                          {totals.requiredToOrder.toLocaleString()}
                        </TableCell>
                      )}
                      {visibleColumns.totalLbs && (
                        <TableCell className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                          {Math.round(totals.lbsRequired).toLocaleString()}
                        </TableCell>
                      )}
                    </TableRow>
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

      <PurchasingFinalOrderDialog
        open={finalOrderOpen}
        onOpenChange={setFinalOrderOpen}
        snapshot={finalOrderSnapshot}
        isLoading={isFinalizing}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this Master PO?</DialogTitle>
            <DialogDescription>
              {activeCycle
                ? `This removes the ${formatTabDate(activeCycle.required_date)} Master PO${
                    activeCycle.po_number != null
                      ? ` (PO #${activeCycle.po_number})`
                      : ""
                  } and all of its buy lines, statuses, ETAs, and notes. The master plan import is kept.`
                : "This removes the selected Master PO tab and all of its buy lines."}
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
              Delete Master PO
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
