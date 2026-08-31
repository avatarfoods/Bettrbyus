"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Search, Trash2 } from "lucide-react";
import {
  deleteFinishedProduct,
  saveFinishedProduct,
} from "@/lib/finished-products/actions";
import type { OdooFinishedOption } from "@/lib/finished-products/fetch";
import {
  expirationFor,
  lotFor,
  palletMath,
  specWarnings,
  type FinishedProduct,
} from "@/lib/finished-products/model";
import { Labelled, inputClass } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * One finished product's specification.
 *
 * The left column is typed; the right column is computed and updates as you
 * type. Cases per pallet is never an input — typing it in two places is how
 * the workbook ended up disagreeing with itself.
 */
export function FinishedProductForm({
  product,
  options,
  odooError,
  recipeId,
  recipeName,
  section = "all",
}: {
  product: FinishedProduct | null;
  options: OdooFinishedOption[];
  odooError: string | null;
  /** Set when the form is a tab on a recipe, which is the normal case. */
  recipeId?: string;
  /** Seeds the name so a new spec is not blank. */
  recipeName?: string;
  /**
   * Which half of the specification to show. Carlos asked for the pallet to be
   * its own tab, so the same form renders twice - once for how it is stacked,
   * once for everything else. Both save the whole record, so switching tabs
   * never drops a field the other tab owns.
   */
  section?: "all" | "pallet" | "spec";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const showPallet = section === "all" || section === "pallet";
  const showSpec = section === "all" || section === "spec";

  const [form, setForm] = useState<FinishedProduct>(
    product ?? {
      id: "",
      odooProductId: 0,
      itemCode: "",
      name: recipeName ?? "",
      customerGroup: null,
      storageType: "freezer",
      bowlsPerCase: null,
      productsPerCase: 1,
      netWeightPerCase: null,
      caseGtin: null,
      unitUpc: null,
      labelUrl: null,
      labelFilename: null,
      artworkOwner: "avatar",
      casesPerLayer: null,
      layersHigh: null,
      caseWidthIn: null,
      caseLengthIn: null,
      caseHeightIn: null,
      palletBaseHeightIn: 6,
      maxPalletHeightIn: null,
      palletsPerStack: 1,
      partialPolicy: "accepted",
      shelfLifeValue: 12,
      shelfLifeUnit: "months",
      expirationOffsetDays: -1,
      lotFormat: "MMDDYYYY",
      validFrom: new Date().toISOString().slice(0, 10),
      active: true,
      notes: null,
    }
  );

  function set<K extends keyof FinishedProduct>(
    key: K,
    value: FinishedProduct[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const numeric =
    <K extends keyof FinishedProduct>(key: K) =>
    (raw: string) =>
      set(key, (raw.trim() === "" ? null : Number(raw)) as FinishedProduct[K]);

  const math = palletMath(form);
  const warnings = specWarnings(form);

  // A worked example beats a description of the rule.
  const sampleDate = new Date().toISOString().slice(0, 10);
  const sampleLot = lotFor(form, sampleDate);
  const sampleExpiry = expirationFor(form, sampleDate);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return options
      .filter((option) =>
        `${option.itemCode} ${option.name}`.toLowerCase().includes(needle)
      )
      .slice(0, 20);
  }, [options, query]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveFinishedProduct({
        ...form,
        id: form.id || undefined,
        recipeId,
      });
      if (result.ok) {
        // As a tab on a recipe there is nowhere to navigate to - the page it
        // belongs to is already open, so it just refreshes in place.
        if (!recipeId) router.push("/production/finished-products");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 px-3 py-4 sm:px-4">
      {/* ---------- which Odoo product ---------- */}
      {form.odooProductId === 0 ? (
        <section className="rounded-lg border border-primary/40 bg-card p-3">
          <h2 className="mb-2 text-[0.6875rem] font-semibold tracking-wider text-primary uppercase">
            Which product?
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            The product itself lives in Odoo. Pick it here and add everything
            Odoo has no room for.
          </p>

          {odooError && (
            <div className="mb-3 flex items-start gap-2 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Could not read products from Odoo: {odooError}
            </div>
          )}

          <div className="relative max-w-lg">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search finished products in Odoo…"
              className={cn(inputClass, "h-9 pl-8")}
            />
          </div>

          {matches.length > 0 && (
            <ul className="mt-2 max-h-72 max-w-lg overflow-y-auto rounded-md border border-border">
              {matches.map((option) => (
                <li key={option.odooProductId}>
                  <button
                    type="button"
                    disabled={option.taken}
                    onClick={() => {
                      set("odooProductId", option.odooProductId);
                      set("itemCode", option.itemCode);
                      set("name", option.name);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm",
                      option.taken
                        ? "cursor-not-allowed opacity-50"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                      {option.itemCode}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    {option.taken && (
                      <span className="shrink-0 text-[0.625rem] text-muted-foreground">
                        already specified
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <span className="font-mono text-xs text-muted-foreground">
            {form.itemCode}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">
            {form.name}
          </span>
          <span className="text-xs text-muted-foreground">
            Odoo id {form.odooProductId}
          </span>
          {!product && (
            <button
              type="button"
              onClick={() => set("odooProductId", 0)}
              className="text-xs text-primary hover:underline"
            >
              change
            </button>
          )}
        </section>
      )}

      {form.odooProductId !== 0 && (
        <>
          <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            {/* ---------- typed ---------- */}
            <div className="flex flex-col gap-5">
              {showPallet && (
              <Fieldset title="Case">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Labelled label="Bowls per case">
                    <input
                      inputMode="decimal"
                      value={form.bowlsPerCase ?? ""}
                      onChange={(e) => numeric("bowlsPerCase")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Products per case">
                    <input
                      inputMode="numeric"
                      value={form.productsPerCase}
                      onChange={(e) =>
                        set("productsPerCase", Number(e.target.value) || 1)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Net weight per case">
                    <input
                      inputMode="decimal"
                      value={form.netWeightPerCase ?? ""}
                      onChange={(e) =>
                        numeric("netWeightPerCase")(e.target.value)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Products per case is how many <em>different</em> products are
                  packed together — an Aldi 20/2CT holds two flavours, so 2.
                </p>
              </Fieldset>
              )}


              {showPallet && (
              <Fieldset title="Pallet">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Labelled label="Cases per layer">
                    <input
                      inputMode="numeric"
                      value={form.casesPerLayer ?? ""}
                      onChange={(e) => numeric("casesPerLayer")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Layers high">
                    <input
                      inputMode="numeric"
                      value={form.layersHigh ?? ""}
                      onChange={(e) => numeric("layersHigh")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Pallets per stack">
                    <input
                      inputMode="numeric"
                      value={form.palletsPerStack}
                      onChange={(e) =>
                        set("palletsPerStack", Number(e.target.value) || 1)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Case width (in)">
                    <input
                      inputMode="decimal"
                      value={form.caseWidthIn ?? ""}
                      onChange={(e) => numeric("caseWidthIn")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Case length (in)">
                    <input
                      inputMode="decimal"
                      value={form.caseLengthIn ?? ""}
                      onChange={(e) => numeric("caseLengthIn")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Case height (in)">
                    <input
                      inputMode="decimal"
                      value={form.caseHeightIn ?? ""}
                      onChange={(e) => numeric("caseHeightIn")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Pallet base height (in)">
                    <input
                      inputMode="decimal"
                      value={form.palletBaseHeightIn ?? ""}
                      onChange={(e) =>
                        numeric("palletBaseHeightIn")(e.target.value)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Max pallet height (in)">
                    <input
                      inputMode="decimal"
                      value={form.maxPalletHeightIn ?? ""}
                      onChange={(e) =>
                        numeric("maxPalletHeightIn")(e.target.value)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Partial pallet">
                    <select
                      value={form.partialPolicy}
                      onChange={(e) =>
                        set(
                          "partialPolicy",
                          e.target.value as FinishedProduct["partialPolicy"]
                        )
                      }
                      className={inputClass}
                    >
                      <option value="accepted">Accepted</option>
                      <option value="conditional">Conditional</option>
                      <option value="not_accepted">Not accepted</option>
                    </select>
                  </Labelled>
                </div>
              </Fieldset>
              )}


              {showSpec && (
              <Fieldset title="Dating">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Labelled label="Shelf life">
                    <input
                      inputMode="numeric"
                      value={form.shelfLifeValue ?? ""}
                      onChange={(e) => numeric("shelfLifeValue")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Unit">
                    <select
                      value={form.shelfLifeUnit}
                      onChange={(e) =>
                        set(
                          "shelfLifeUnit",
                          e.target.value as FinishedProduct["shelfLifeUnit"]
                        )
                      }
                      className={inputClass}
                    >
                      <option value="months">Months</option>
                      <option value="days">Days</option>
                    </select>
                  </Labelled>
                  <Labelled label="Expiry offset (days)">
                    <input
                      inputMode="numeric"
                      value={form.expirationOffsetDays}
                      onChange={(e) =>
                        set(
                          "expirationOffsetDays",
                          Number(e.target.value) || 0
                        )
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                  <Labelled label="Lot format">
                    <input
                      value={form.lotFormat}
                      onChange={(e) => set("lotFormat", e.target.value)}
                      className={cn(inputClass, "font-mono")}
                    />
                  </Labelled>
                </div>
              </Fieldset>
              )}


              {showSpec && (
              <Fieldset title="Label & codes">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Labelled label="Case GTIN">
                    <input
                      value={form.caseGtin ?? ""}
                      onChange={(e) => set("caseGtin", e.target.value || null)}
                      className={cn(inputClass, "font-mono")}
                    />
                  </Labelled>
                  <Labelled label="Unit UPC">
                    <input
                      value={form.unitUpc ?? ""}
                      onChange={(e) => set("unitUpc", e.target.value || null)}
                      className={cn(inputClass, "font-mono")}
                    />
                  </Labelled>
                  <Labelled label="Label artwork (URL)">
                    <input
                      value={form.labelUrl ?? ""}
                      onChange={(e) => set("labelUrl", e.target.value || null)}
                      placeholder="/labels/600099.pdf"
                      className={inputClass}
                    />
                  </Labelled>
                  <Labelled label="Artwork owned by">
                    <select
                      value={form.artworkOwner}
                      onChange={(e) =>
                        set(
                          "artworkOwner",
                          e.target.value as FinishedProduct["artworkOwner"]
                        )
                      }
                      className={inputClass}
                    >
                      <option value="avatar">Avatar Foods</option>
                      <option value="brand">Brand-owned (co-pack)</option>
                    </select>
                  </Labelled>
                </div>
                {form.artworkOwner === "brand" && (
                  <p className="mt-2 text-xs text-warning-foreground">
                    Brand-owned artwork cannot be sold on without the brand
                    owner&apos;s approval — this product is excluded from the
                    surplus sell list.
                  </p>
                )}
              </Fieldset>
              )}


              {showSpec && (
              <Fieldset title="Record">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Labelled label="Customer group">
                    <input
                      value={form.customerGroup ?? ""}
                      onChange={(e) =>
                        set("customerGroup", e.target.value || null)
                      }
                      placeholder="Every Day"
                      className={inputClass}
                    />
                  </Labelled>
                  <Labelled label="Storage">
                    <select
                      value={form.storageType ?? ""}
                      onChange={(e) =>
                        set(
                          "storageType",
                          (e.target.value ||
                            null) as FinishedProduct["storageType"]
                        )
                      }
                      className={inputClass}
                    >
                      <option value="">—</option>
                      <option value="freezer">Freezer</option>
                      <option value="cooler">Cooler</option>
                      <option value="dry">Dry</option>
                    </select>
                  </Labelled>
                  <Labelled label="Valid from">
                    <input
                      type="date"
                      value={form.validFrom}
                      onChange={(e) => set("validFrom", e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Labelled>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Change a carton and set a new <em>valid from</em> — records
                  made under the old spec keep explaining themselves.
                </p>
              </Fieldset>
              )}
            </div>

            {/* ---------- calculated ---------- */}
            <aside className="flex flex-col gap-3 xl:sticky xl:top-32 xl:self-start">
              <div className="rounded-lg border border-border border-t-2 border-t-brand bg-card p-3">
                <h2 className="mb-2 text-[0.6875rem] font-semibold tracking-wider text-primary uppercase">
                  Calculated
                </h2>
                <dl className="flex flex-col gap-1.5 text-sm">
                  <Derived label="Cases per pallet" value={math.casesPerPallet} hint="layer × high" />
                  <Derived label="Pallet height" value={math.palletHeightIn} unit="in" hint="base + (high × case)" />
                  <Derived label="Cases per pallet space" value={math.casesPerPalletSpace} hint={`× ${form.palletsPerStack} stacked`} />
                  <Derived label="Stacked height" value={math.stackedHeightIn} unit="in" />
                </dl>

                <div
                  className={cn(
                    "mt-3 flex items-start gap-2 rounded-md px-2.5 py-2 text-xs",
                    math.fits === false
                      ? "bg-destructive/10 text-destructive"
                      : math.fits === true
                        ? "bg-success-muted text-success"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {math.fits === false ? (
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  ) : math.fits === true ? (
                    <Check className="mt-0.5 size-3.5 shrink-0" />
                  ) : null}
                  <span>
                    {math.fitMessage ??
                      (math.fits === true
                        ? "The stack fits under the height limit."
                        : "Set case height and max pallet height to check the stack fits.")}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-3">
                <h2 className="mb-2 text-[0.6875rem] font-semibold tracking-wider text-primary uppercase">
                  If produced today
                </h2>
                <dl className="flex flex-col gap-1.5 text-sm">
                  <Derived label="Lot number" text={sampleLot || "—"} />
                  <Derived label="Expiration" text={sampleExpiry ?? "set a shelf life"} />
                </dl>
              </div>

              {warnings.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning-muted p-3">
                  <h2 className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-warning-foreground uppercase">
                    <AlertTriangle className="size-3.5" />
                    {warnings.length} to finish
                  </h2>
                  <ul className="flex flex-col gap-1.5 text-xs text-warning-foreground">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save specification
            </button>
            <button
              type="button"
              onClick={() => router.push("/production/finished-products")}
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm hover:bg-muted"
            >
              Cancel
            </button>

            {product && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Delete the specification for ${product.name}?`))
                    return;
                  startTransition(async () => {
                    const result = await deleteFinishedProduct(product.id);
                    if (result.ok) {
                      router.push("/production/finished-products");
                      router.refresh();
                    } else setError(result.message);
                  });
                }}
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" />
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}

function Fieldset({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <h2 className="mb-3 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wider text-primary uppercase">
        <span aria-hidden className="h-3 w-0.5 rounded-full bg-brand" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Derived({
  label,
  value,
  text,
  unit,
  hint,
}: {
  label: string;
  value?: number | null;
  text?: string;
  unit?: string;
  hint?: string;
}) {
  const shown =
    text ??
    (value === null || value === undefined
      ? "—"
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 }));

  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-b-0 last:pb-0">
      <dt className="text-muted-foreground">
        {label}
        {hint && (
          <span className="ml-1.5 text-[0.625rem] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </dt>
      <dd className="font-semibold tabular-nums">
        {shown}
        {unit && shown !== "—" && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </dd>
    </div>
  );
}
