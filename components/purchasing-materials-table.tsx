"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Pencil, RefreshCw, Snowflake, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { syncFromOdoo, uploadInventoryFile } from "@/lib/purchasing/actions";
import { fetchMaterialsWithOnHand } from "@/lib/purchasing/fetch-materials";
import { saveManualOnHand } from "@/lib/purchasing/save-snapshot";
import {
  MATERIAL_SAVE_ERROR_MESSAGE,
  updatePurchasingMaterial,
} from "@/lib/purchasing/update-material";
import type { MaterialWithOnHand, StorageType } from "@/lib/purchasing/types";
import {
  parseOptionalNumberInput,
  purchasingMaterialSchema,
  STORAGE_TYPES,
} from "@/lib/validations/purchasing-material";
import { Button } from "@/components/ui/button";
import { ButtonTabBar, type TabItem } from "@/components/ui/tab-bar";
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

const STORAGE_LABELS: Record<StorageType, string> = {
  dry: "Dry",
  refrigerated: "Refrigerated",
  frozen: "Frozen",
  produce: "Produce",
};

function formatOnHand(material: MaterialWithOnHand) {
  if (material.on_hand == null) return "—";
  return material.on_hand.toLocaleString();
}

function formatSyncedAt(value: string | null) {
  if (!value) return null;
  try {
    return format(parseISO(value), "MMM d, h:mm a");
  } catch {
    return null;
  }
}

type MaterialEditFormProps = {
  material: MaterialWithOnHand;
  onCancel: () => void;
  onSaved: (material: MaterialWithOnHand) => void;
};

function MaterialEditForm({ material, onCancel, onSaved }: MaterialEditFormProps) {
  const [storageType, setStorageType] = useState<string>(
    material.storage_type ?? ""
  );
  const [lbsPerCase, setLbsPerCase] = useState(
    material.lbs_per_case != null ? String(material.lbs_per_case) : ""
  );
  const [isProtein, setIsProtein] = useState(material.is_protein);
  const [thawBufferDays, setThawBufferDays] = useState(
    String(material.thaw_buffer_days)
  );
  const [leadTimeDays, setLeadTimeDays] = useState(
    String(material.lead_time_days)
  );
  const initialOnHand = material.on_hand != null ? String(material.on_hand) : "";
  const [onHand, setOnHand] = useState(initialOnHand);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setFormError(null);

    const validation = purchasingMaterialSchema.safeParse({
      storageType: storageType ? (storageType as StorageType) : null,
      lbsPerCase: parseOptionalNumberInput(lbsPerCase),
      isProtein,
      thawBufferDays: parseOptionalNumberInput(thawBufferDays) ?? -1,
      leadTimeDays: parseOptionalNumberInput(leadTimeDays) ?? -1,
    });

    if (!validation.success) {
      setFormError(validation.error.issues[0]?.message ?? "Invalid values.");
      return;
    }

    const onHandChanged = onHand.trim() !== initialOnHand.trim();
    const parsedOnHand = parseOptionalNumberInput(onHand);
    if (onHandChanged && onHand.trim() && parsedOnHand === null) {
      setFormError("On hand must be a number or left unchanged.");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const result = await updatePurchasingMaterial(
      supabase,
      material.id,
      validation.data
    );

    let onHandOverride: number | null = null;
    if (result.success && onHandChanged && parsedOnHand !== null) {
      const snapshotResult = await saveManualOnHand(
        supabase,
        material.id,
        parsedOnHand
      );
      if (snapshotResult.success) {
        onHandOverride = parsedOnHand;
      }
    }
    setIsSubmitting(false);

    if (!result.success) {
      setFormError(MATERIAL_SAVE_ERROR_MESSAGE);
      return;
    }

    onSaved({
      ...material,
      ...result.data,
      ...(onHandOverride !== null
        ? {
            on_hand: onHandOverride,
            on_hand_source: "manual_override" as const,
            on_hand_fetched_at: new Date().toISOString(),
          }
        : {}),
    });
  }

  return (
    <>
      <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-storage">Storage</Label>
              <select
                id="material-storage"
                value={storageType}
                onChange={(event) => setStorageType(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Not set</option>
                {STORAGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {STORAGE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-lbs-per-case">Lbs / units per case</Label>
              <Input
                id="material-lbs-per-case"
                type="number"
                inputMode="decimal"
                step="any"
                value={lbsPerCase}
                onChange={(event) => setLbsPerCase(event.target.value)}
                placeholder="Not set"
                className="h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-lead-time">Lead time (days)</Label>
              <Input
                id="material-lead-time"
                type="number"
                inputMode="numeric"
                min={0}
                value={leadTimeDays}
                onChange={(event) => setLeadTimeDays(event.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-thaw-buffer">Thaw buffer (days)</Label>
              <Input
                id="material-thaw-buffer"
                type="number"
                inputMode="numeric"
                min={0}
                value={thawBufferDays}
                onChange={(event) => setThawBufferDays(event.target.value)}
                disabled={!isProtein}
                className="h-10"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isProtein}
              onChange={(event) => {
                setIsProtein(event.target.checked);
                if (!event.target.checked) setThawBufferDays("0");
              }}
              className="size-4 accent-primary"
            />
            Protein (needs thaw time before production)
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material-on-hand">On hand (manual override)</Label>
            <Input
              id="material-on-hand"
              type="number"
              inputMode="decimal"
              step="any"
              value={onHand}
              onChange={(event) => setOnHand(event.target.value)}
              placeholder="No data"
              className="h-10"
            />
            <p className="text-xs text-muted-foreground">
              Changing this saves a manual override until the next Odoo sync.
            </p>
          </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

type MaterialEditDialogProps = {
  material: MaterialWithOnHand | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (material: MaterialWithOnHand) => void;
};

function MaterialEditDialog({
  material,
  onOpenChange,
  onSaved,
}: MaterialEditDialogProps) {
  return (
    <Dialog open={material !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit purchasing settings
            {material && (
              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                {material.item_code} · {material.name}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Lead time and thaw buffer determine the recommended order-by date.
          </DialogDescription>
        </DialogHeader>

        {material && (
          <MaterialEditForm
            key={material.id}
            material={material}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onSaved(saved);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PurchasingMaterialsPage() {
  const [materials, setMaterials] = useState<MaterialWithOnHand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [storageFilter, setStorageFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [companyTab, setCompanyTab] = useState("all");
  const [editingMaterial, setEditingMaterial] =
    useState<MaterialWithOnHand | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, startSync] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadMaterials() {
    setLoadError(null);
    const supabase = createClient();
    const result = await fetchMaterialsWithOnHand(supabase);
    if (result.error) {
      setLoadError(result.error);
      setMaterials([]);
    } else {
      setMaterials(result.data);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    let active = true;

    (async () => {
      const supabase = createClient();
      const result = await fetchMaterialsWithOnHand(supabase);
      if (!active) return;

      if (result.error) {
        setLoadError(result.error);
        setMaterials([]);
      } else {
        setMaterials(result.data);
      }
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  function handleSync() {
    setSyncMessage(null);
    setSyncError(null);
    startSync(async () => {
      const result = await syncFromOdoo();
      if (result.ok) {
        setSyncMessage(result.message);
        await loadMaterials();
      } else {
        setSyncError(result.message);
        await loadMaterials();
      }
    });
  }

  function handleFileSelected(file: File | null) {
    if (!file) return;
    setSyncMessage(null);
    setSyncError(null);
    startUpload(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadInventoryFile(formData);
      if (result.ok) {
        setSyncMessage(result.message);
        await loadMaterials();
      } else {
        setSyncError(result.message);
      }
    });
  }

  /** Which Odoo company (Yaya's, AvatarNaturalFoods, …) each material was
   * bought under - materials are purchased per company, not shared. */
  const companyTabs = useMemo<TabItem[]>(() => {
    const counts = new Map<string, number>();
    for (const material of materials) {
      const key = material.odoo_company_name ?? "Unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    return [
      { id: "all", label: "All places", count: materials.length },
      ...names.map((name) => ({ id: name, label: name, count: counts.get(name) })),
    ];
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return materials.filter((material) => {
      if (
        companyTab !== "all" &&
        (material.odoo_company_name ?? "Unassigned") !== companyTab
      ) {
        return false;
      }
      if (!showInactive && !material.active) return false;
      if (storageFilter && material.storage_type !== storageFilter) return false;
      if (!query) return true;
      return (
        material.item_code.toLowerCase().includes(query) ||
        material.name.toLowerCase().includes(query)
      );
    });
  }, [materials, search, storageFilter, showInactive, companyTab]);

  const lastSyncLabel = useMemo(() => {
    const timestamps = materials
      .flatMap((material) => [material.last_synced_at, material.on_hand_fetched_at])
      .filter((value): value is string => value !== null)
      .sort();
    return formatSyncedAt(timestamps[timestamps.length - 1] ?? null);
  }, [materials]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Title and breadcrumb come from the page shell; the back arrow and
          the icon were both saying what the breadcrumb already says. */}
      <header className="border-b border-border bg-card px-3 py-2 sm:px-4">
        <div className="flex w-full items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            Lead times, thaw buffers, and lbs per case.
            {lastSyncLabel ? ` Last sync ${lastSyncLabel}.` : " Not synced yet."}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                handleFileSelected(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSyncing || isUploading}
              title="Fallback: upload an Odoo inventory export"
            >
              {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
              <span className="hidden lg:inline">Upload file</span>
            </Button>
            <Button
              type="button"
              onClick={handleSync}
              disabled={isSyncing || isUploading}
            >
              {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              <span className="hidden sm:inline">Sync from Odoo</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex items-stretch border-b border-border bg-card">
        <ButtonTabBar
          items={companyTabs}
          activeId={companyTab}
          onSelect={setCompanyTab}
          className="min-w-0 flex-1 border-b-0"
        />
      </div>

      <main className="mx-auto flex w-full max-w-none flex-1 flex-col gap-4 px-4 py-6">
        {syncMessage && (
          <p className="rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-2 text-sm text-green-700 dark:text-green-400">
            {syncMessage}
          </p>
        )}
        {syncError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {syncError}
          </p>
        )}

        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Materials</CardTitle>
            <CardDescription>
              {filteredMaterials.length} of {materials.length} items shown.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="material-search">Search</Label>
                <Input
                  id="material-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Item code or name…"
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-2 sm:w-44">
                <Label htmlFor="material-storage-filter">Storage</Label>
                <select
                  id="material-storage-filter"
                  value={storageFilter}
                  onChange={(event) => setStorageFilter(event.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                >
                  <option value="">All</option>
                  {STORAGE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {STORAGE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                  className="size-4 accent-primary"
                />
                Show archived
              </label>
            </div>

            {isLoading ? (
              <div className="flex min-h-32 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <p className="text-sm text-destructive">
                Could not load materials: {loadError}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Code</TableHead>
                      <TableHead className="min-w-64">Name</TableHead>
                      <TableHead className="w-32">Storage</TableHead>
                      <TableHead className="w-28 text-right">Lbs/case</TableHead>
                      <TableHead className="w-28 text-right">Lead time</TableHead>
                      <TableHead className="w-28 text-right">Thaw buffer</TableHead>
                      <TableHead className="w-28 text-right">On hand</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMaterials.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="h-24 text-center text-muted-foreground"
                        >
                          {materials.length === 0
                            ? "No materials yet. Run the catalog sync or the backfill migration."
                            : "No materials match the current filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMaterials.map((material) => (
                        <TableRow
                          key={material.id}
                          className={cn(!material.active && "opacity-50")}
                        >
                          <TableCell className="font-mono text-sm">
                            {material.item_code}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="flex items-center gap-1.5">
                              {material.name}
                              {material.is_protein && (
                                <Snowflake
                                  className="size-3.5 shrink-0 text-sky-500"
                                  aria-label="Protein (thaw buffer applies)"
                                />
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {material.storage_type
                              ? STORAGE_LABELS[material.storage_type]
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {material.lbs_per_case?.toLocaleString() ?? "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {material.lead_time_days}d
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {material.is_protein
                              ? `${material.thaw_buffer_days}d`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatOnHand(material)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setEditingMaterial(material)}
                              aria-label={`Edit ${material.item_code}`}
                            >
                              <Pencil className="size-4" />
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
      </main>

      <MaterialEditDialog
        material={editingMaterial}
        onOpenChange={(open) => {
          if (!open) setEditingMaterial(null);
        }}
        onSaved={(saved) => {
          setMaterials((current) =>
            current.map((item) => (item.id === saved.id ? saved : item))
          );
        }}
      />
    </div>
  );
}
