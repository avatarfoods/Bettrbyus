"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowLeft, CalendarRange, FileUp, Loader2, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  generateCycle,
  importMasterFile,
  type GenerateResult,
  type ImportResult,
} from "@/lib/purchasing/import-actions";
import { fetchLatestImport } from "@/lib/purchasing/fetch-cycles";
import { saveMaterialAlias } from "@/lib/purchasing/update-line";
import type { Material } from "@/lib/purchasing/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ImportStats = {
  id: string;
  fileName: string;
  createdAt: string;
  scheduleFrom: string | null;
  scheduleTo: string | null;
  recipes: number | null;
  scheduleEntries: number | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value;
  }
}

type AliasRowProps = {
  ingredientName: string;
  detail: string;
  materials: Pick<Material, "id" | "item_code" | "name">[];
  onSaved: () => void;
};

function AliasRow({ ingredientName, detail, materials, onSaved }: AliasRowProps) {
  const [search, setSearch] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

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

  async function handleSave() {
    if (!materialId) return;
    setIsSaving(true);
    setError(false);
    const supabase = createClient();
    const result = await saveMaterialAlias(supabase, ingredientName, materialId);
    setIsSaving(false);
    if (result.success) {
      setSaved(true);
      onSaved();
    } else {
      setError(true);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{ingredientName}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {saved ? (
        <p className="text-sm text-green-700 dark:text-green-400">
          Mapped. Regenerate the cycle to apply.
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search materials…"
            className="h-9 sm:max-w-52"
          />
          <select
            value={materialId}
            onChange={(event) => setMaterialId(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
          >
            <option value="">Select material…</option>
            {options.map((material) => (
              <option key={material.id} value={material.id}>
                {material.item_code} · {material.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={() => void handleSave()}
            disabled={!materialId || isSaving}
          >
            {isSaving ? <Loader2 className="animate-spin" /> : "Save mapping"}
          </Button>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive">Could not save the mapping.</p>
      )}
    </div>
  );
}

export function PurchasingImportPage() {
  const [latestImport, setLatestImport] = useState<ImportStats | null>(null);
  const [materials, setMaterials] = useState<Pick<Material, "id" | "item_code" | "name">[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [requiredDate, setRequiredDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isImporting, startImport] = useTransition();
  const [isGenerating, startGenerate] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function applyImportStats(stats: ImportStats) {
    setLatestImport(stats);
    setFromDate((current) => current || stats.scheduleFrom || "");
    setToDate((current) => current || stats.scheduleTo || "");
  }

  useEffect(() => {
    let active = true;

    (async () => {
      const supabase = createClient();
      const [importRes, materialsRes] = await Promise.all([
        fetchLatestImport(supabase),
        supabase
          .from("purchasing_materials")
          .select("id, item_code, name")
          .eq("active", true)
          .order("item_code"),
      ]);
      if (!active) return;

      if (importRes.data) {
        const stats = (importRes.data.stats ?? {}) as Record<string, unknown>;
        applyImportStats({
          id: importRes.data.id,
          fileName: importRes.data.file_name,
          createdAt: importRes.data.created_at,
          scheduleFrom: (stats.schedule_from as string) ?? null,
          scheduleTo: (stats.schedule_to as string) ?? null,
          recipes: (stats.recipes as number) ?? null,
          scheduleEntries: (stats.schedule_entries as number) ?? null,
        });
      }
      setMaterials(
        (materialsRes.data ?? []) as Pick<Material, "id" | "item_code" | "name">[]
      );
    })();

    return () => {
      active = false;
    };
  }, []);

  function handleFileSelected(file: File | null) {
    if (!file) return;
    setImportResult(null);
    setGenerateResult(null);
    startImport(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await importMasterFile(formData);
      setImportResult(result);
      if (result.ok && result.importId && result.stats) {
        applyImportStats({
          id: result.importId,
          fileName: file.name,
          createdAt: new Date().toISOString(),
          scheduleFrom: result.stats.scheduleFrom,
          scheduleTo: result.stats.scheduleTo,
          recipes: result.stats.recipes,
          scheduleEntries: result.stats.scheduleEntries,
        });
        setFromDate(result.stats.scheduleFrom ?? "");
        setToDate(result.stats.scheduleTo ?? "");
      }
    });
  }

  function handleGenerate() {
    if (!latestImport || !requiredDate || !fromDate || !toDate) return;
    setGenerateResult(null);
    startGenerate(async () => {
      const result = await generateCycle({
        importId: latestImport.id,
        requiredDate,
        fromDate,
        toDate,
      });
      setGenerateResult(result);
    });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
          <Link
            href="/purchasing"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground transition-colors hover:bg-muted"
            aria-label="Back to purchasing"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileUp className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              Import master plan
            </h1>
            <p className="text-sm text-muted-foreground">
              Upload the MASTER FRESH planning file and generate the weekly buy list.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">1. Upload the master file</CardTitle>
            <CardDescription>
              {latestImport
                ? `Last import: ${latestImport.fileName} on ${formatDate(latestImport.createdAt)} · ${latestImport.recipes ?? "?"} recipes · schedule ${formatDate(latestImport.scheduleFrom)} to ${formatDate(latestImport.scheduleTo)}`
                : "No imports yet. Upload the .xlsm planning file to load recipes and the production schedule."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsm,.xlsx"
              className="hidden"
              onChange={(event) => {
                handleFileSelected(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <div>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? <Loader2 className="animate-spin" /> : <FileUp />}
                {isImporting ? "Importing…" : "Choose .xlsm file"}
              </Button>
            </div>
            {importResult && (
              <p
                className={
                  importResult.ok
                    ? "rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-2 text-sm text-green-700 dark:text-green-400"
                    : "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
                }
              >
                {importResult.message}
              </p>
            )}
            {importResult?.warnings && importResult.warnings.length > 0 && (
              <ul className="list-inside list-disc text-sm text-amber-600 dark:text-amber-400">
                {importResult.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">2. Generate the buy list</CardTitle>
            <CardDescription>
              Pick the PO required date and the production window it must cover.
              Requirements are computed from the schedule and netted against
              on-hand inventory.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="cycle-required-date">Required date</Label>
                <Input
                  id="cycle-required-date"
                  type="date"
                  value={requiredDate}
                  onChange={(event) => setRequiredDate(event.target.value)}
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cycle-from-date">Production from</Label>
                <Input
                  id="cycle-from-date"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cycle-to-date">Production to</Label>
                <Input
                  id="cycle-to-date"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            <div>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={
                  !latestImport || !requiredDate || !fromDate || !toDate || isGenerating
                }
              >
                {isGenerating ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {isGenerating ? "Computing…" : "Generate buy list"}
              </Button>
            </div>

            {generateResult && (
              <div className="flex flex-col gap-3">
                <p
                  className={
                    generateResult.ok
                      ? "rounded-lg border border-green-600/30 bg-green-600/10 px-4 py-2 text-sm text-green-700 dark:text-green-400"
                      : "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
                  }
                >
                  {generateResult.message}
                </p>

                {generateResult.ok && generateResult.cycleId && (
                  <div>
                    <Link
                      href={`/purchasing/cycles/${generateResult.cycleId}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <CalendarRange className="size-4" />
                      Open the buy list for {formatDate(requiredDate)}
                    </Link>
                  </div>
                )}

                {generateResult.warnings && generateResult.warnings.length > 0 && (
                  <ul className="list-inside list-disc text-sm text-amber-600 dark:text-amber-400">
                    {generateResult.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}

                {generateResult.linesWithoutSpec &&
                  generateResult.linesWithoutSpec.length > 0 && (
                    <div className="rounded-lg border border-amber-600/30 bg-amber-600/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
                      <p className="font-medium">
                        Missing lbs/case spec (quantities kept as raw lbs/units):
                      </p>
                      <p>{generateResult.linesWithoutSpec.join(", ")}</p>
                      <p>
                        Set the spec on the{" "}
                        <Link href="/purchasing/materials" className="underline">
                          materials page
                        </Link>{" "}
                        and regenerate.
                      </p>
                    </div>
                  )}

                {generateResult.unresolved && generateResult.unresolved.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">
                      Unmatched ingredient names — map them to materials, then
                      regenerate:
                    </p>
                    {generateResult.unresolved.map((entry) => (
                      <AliasRow
                        key={entry.ingredientName}
                        ingredientName={entry.ingredientName}
                        detail={`${
                          entry.totalLbs > 0
                            ? `${entry.totalLbs.toFixed(1)} lbs needed`
                            : `${entry.totalUnits.toFixed(0)} units needed`
                        } · used in: ${entry.recipes.slice(0, 3).join(", ")}`}
                        materials={materials}
                        onSaved={() => undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
