"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Pencil, RefreshCw, Snowflake } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { syncFromOdoo } from "@/lib/purchasing/actions";
import { fetchMaterialsWithOnHand } from "@/lib/purchasing/fetch-materials";
import { usePurchasingConfig } from "@/components/purchasing/config-context";
import { saveManualOnHand } from "@/lib/purchasing/save-snapshot";
import {
  MATERIAL_SAVE_ERROR_MESSAGE,
  updatePurchasingMaterial,
} from "@/lib/purchasing/update-material";
import type {
  MaterialWithOnHand,
  PurchasingCategory,
  StorageType,
} from "@/lib/purchasing/types";
import {
  parseOptionalNumberInput,
  purchasingMaterialSchema,
  PURCHASING_CATEGORIES,
  PURCHASING_CATEGORY_LABELS,
  STORAGE_TYPES,
} from "@/lib/validations/purchasing-material";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  TBody,
  TD,
  THead,
  TR,
  TableEmpty,
} from "@/components/ui/data-table";
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
import { SearchPanel } from "@/components/ui/search-panel";
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
  const [purchasingCategory, setPurchasingCategory] = useState<string>(
    material.purchasing_category ?? ""
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
      purchasingCategory: purchasingCategory
        ? (purchasingCategory as PurchasingCategory)
        : null,
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
              <Label htmlFor="material-category">Buy category</Label>
              <select
                id="material-category"
                value={purchasingCategory}
                onChange={(event) => setPurchasingCategory(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Not set</option>
                {PURCHASING_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {PURCHASING_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
  const { places, companyIds } = usePurchasingConfig();
  const [materials, setMaterials] = useState<MaterialWithOnHand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<string[]>([]);
  const [companyTab, setCompanyTab] = useState("all");
  const [editingMaterial, setEditingMaterial] =
    useState<MaterialWithOnHand | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, startSync] = useTransition();

  async function loadMaterials() {
    setLoadError(null);
    const supabase = createClient();
    const result = await fetchMaterialsWithOnHand(supabase, { companyIds });
    if (result.error) {
      setLoadError(result.error);
      setMaterials([]);
    } else {
      setMaterials(result.data);
    }
    setIsLoading(false);
  }

  const placeKey = companyIds?.join(",") ?? "";

  useEffect(() => {
    let active = true;

    (async () => {
      const supabase = createClient();
      const ids = placeKey
        ? placeKey.split(",").map((value) => Number(value))
        : null;
      const result = await fetchMaterialsWithOnHand(supabase, {
        companyIds: ids,
      });
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
  }, [placeKey]);

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

  const placePills = useMemo(() => {
    if (!places.usingFallback && places.places.length > 0) {
      return places.places.map((place) => place.name);
    }
    const names = new Set<string>();
    for (const material of materials) {
      if (material.odoo_company_name) names.add(material.odoo_company_name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [places, materials]);

  const storageFilter = filters
    .find((id) => id.startsWith("storage:"))
    ?.slice(8) as StorageType | undefined;
  const categoryFilterRaw = filters
    .find((id) => id.startsWith("category:"))
    ?.slice(9);
  const categoryFilter =
    categoryFilterRaw === "uncategorized"
      ? null
      : (categoryFilterRaw as PurchasingCategory | undefined);
  const showInactive = filters.includes("archived");

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
      if (categoryFilterRaw === "uncategorized") {
        if (material.purchasing_category) return false;
      } else if (categoryFilter && material.purchasing_category !== categoryFilter) {
        return false;
      }
      if (!query) return true;
      return (
        material.item_code.toLowerCase().includes(query) ||
        material.name.toLowerCase().includes(query)
      );
    });
  }, [
    materials,
    search,
    storageFilter,
    categoryFilter,
    categoryFilterRaw,
    showInactive,
    companyTab,
  ]);

  const lastSyncLabel = useMemo(() => {
    const timestamps = materials
      .flatMap((material) => [material.last_synced_at, material.on_hand_fetched_at])
      .filter((value): value is string => value !== null)
      .sort();
    return formatSyncedAt(timestamps[timestamps.length - 1] ?? null);
  }, [materials]);

  return (
    <div className="flex min-h-full flex-1 flex-col gap-2 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        {placePills.length > 0 && (
          <span className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
            <button
              type="button"
              onClick={() => setCompanyTab("all")}
              aria-pressed={companyTab === "all"}
              className={cn(
                "h-7 px-2 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
                companyTab === "all"
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              All
            </button>
            {placePills.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setCompanyTab(name)}
                aria-pressed={companyTab === name}
                className={cn(
                  "h-7 px-2 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
                  companyTab === name
                    ? "bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {name}
              </button>
            ))}
          </span>
        )}

        <SearchPanel
          query={search}
          onQueryChange={setSearch}
          placeholder="Find a material…"
          aria-label="Search materials"
          filters={filters}
          onFiltersChange={setFilters}
          filterGroups={[
            {
              exclusive: true,
              items: STORAGE_TYPES.map((type) => ({
                id: `storage:${type}`,
                label: STORAGE_LABELS[type],
              })),
            },
            {
              exclusive: true,
              items: [
                ...PURCHASING_CATEGORIES.map((category) => ({
                  id: `category:${category}`,
                  label: PURCHASING_CATEGORY_LABELS[category],
                })),
                { id: "category:uncategorized", label: "Uncategorized" },
              ],
            },
            { items: [{ id: "archived", label: "Archived" }] },
          ]}
          className="sm:max-w-xl"
        />

        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {filteredMaterials.length} / {materials.length}
          {lastSyncLabel ? ` · ${lastSyncLabel}` : ""}
        </span>

        <Button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          <span className="hidden sm:inline">Sync from Odoo</span>
        </Button>
      </div>

      {syncMessage && (
        <p className="rounded-md bg-success-muted px-3 py-2 text-sm text-success">
          {syncMessage}
        </p>
      )}
      {syncError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {syncError}
        </p>
      )}

      {isLoading ? (
        <div className="flex min-h-32 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <p className="text-sm text-destructive">
          Could not load materials: {loadError}
        </p>
      ) : (
        <DataTable>
          <THead
            columns={[
              { label: "Item", className: "w-28" },
              { label: "Material" },
              { label: "Place" },
              { label: "Storage" },
              { label: "Category" },
              { label: "Lbs/case", numeric: true },
              { label: "Lead", numeric: true },
              { label: "Thaw", numeric: true },
              { label: "On hand", numeric: true },
              { label: "", className: "w-10" },
            ]}
          />
          <TBody>
            {filteredMaterials.length === 0 ? (
              <TableEmpty colSpan={10}>
                {materials.length === 0
                  ? "No materials yet. Run Sync from Odoo, or pick places under Configuration."
                  : "No materials match the current filters."}
              </TableEmpty>
            ) : (
              filteredMaterials.map((material) => (
                <TR
                  key={material.id}
                  className={cn(!material.active && "opacity-50")}
                  onClick={() => setEditingMaterial(material)}
                >
                  <TD mono>{material.item_code}</TD>
                  <TD strong>
                    <span className="flex items-center gap-1.5">
                      {material.name}
                      {material.is_protein && (
                        <Snowflake
                          className="size-3.5 shrink-0 text-sky-500"
                          aria-label="Protein (thaw buffer applies)"
                        />
                      )}
                    </span>
                  </TD>
                  <TD muted>{material.odoo_company_name ?? "—"}</TD>
                  <TD muted>
                    {material.storage_type
                      ? STORAGE_LABELS[material.storage_type]
                      : "—"}
                  </TD>
                  <TD muted>
                    {material.purchasing_category
                      ? PURCHASING_CATEGORY_LABELS[material.purchasing_category]
                      : "—"}
                  </TD>
                  <TD numeric>{material.lbs_per_case?.toLocaleString() ?? "—"}</TD>
                  <TD numeric>{material.lead_time_days}d</TD>
                  <TD numeric>
                    {material.is_protein ? `${material.thaw_buffer_days}d` : "—"}
                  </TD>
                  <TD numeric>{formatOnHand(material)}</TD>
                  <TD>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingMaterial(material);
                      }}
                      aria-label={`Edit ${material.item_code}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </DataTable>
      )}

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
