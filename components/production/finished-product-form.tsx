"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  deleteFinishedProduct,
  saveFinishedProduct,
} from "@/lib/finished-products/actions";
import {
  expirationFor,
  lotFor,
  palletMath,
  specWarnings,
  type FinishedProduct,
} from "@/lib/finished-products/model";
import { inputClass } from "@/components/production/settings/shared";
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
  recipeId,
  recipeName,
  section = "spec",
  onSectionChange,
}: {
  product: FinishedProduct | null;
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
  /** Switching between the two halves, when they share one tab. */
  onSectionChange?: (next: "spec" | "pallet") => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      ingredientStatement: null,
      handlingInstructions: null,
      heatingInstructions: null,
      guaranteedShelfLifeDays: null,
      palletWeightLb: null,
      caseWeightLb: null,
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
    <form onSubmit={submit} className="flex flex-col gap-4 px-3 py-3 sm:px-4">
      {/* Two halves of one document, read in one sitting. */}
      {onSectionChange && (
        <div className="flex items-center gap-1">
          {(
            [
              ["spec", "Specification"],
              ["pallet", "Pallet & case"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onSectionChange(id)}
              aria-pressed={section === id}
              className={cn(
                "h-7 rounded-sm px-2.5 text-xs transition-colors",
                section === id
                  ? "bg-primary font-medium text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {/*
        One line, and the detail behind a "?".

        Four sentences of "no X - Y cannot be worked out" is a paragraph
        somebody reads once. What is worth the space is the count; what is
        missing is worth a hover, and the fields themselves are right below.
      */}
      {warnings.length > 0 && (
        <p
          title={warnings.join(" · ")}
          className="flex w-fit cursor-help items-center gap-1.5 rounded-sm bg-warning-muted px-2 py-1 text-xs text-warning-foreground"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <strong>{warnings.length}</strong> still to fill in
          <span className="inline-flex size-3.5 items-center justify-center rounded-sm bg-warning-foreground/20 text-[0.5625rem] font-bold">
            ?
          </span>
        </p>
      )}

      {/*
        Nothing here is read from Odoo.

        Odoo has no home for a pallet build or a shelf-life rule, and the few
        fields it does carry were arriving half-filled and stale - which is
        worse than blank, because a wrong number looks like an answer. These
        are typed once, here, and this is the only place they live.
      */}
      <>
          {/*
            Derived numbers next to the fields they come from.

            They used to live in a column of their own down the right, which
            put "cases per pallet" a screen away from the layer and tie it is
            computed from - and repeated the whole column on both halves of
            the form. Each one now sits under its own fieldset, so it is read
            where it is caused.
          */}
          <div className="grid gap-3 lg:grid-cols-2">
              {showPallet && (
              <Fieldset title="Case">
                  <Field label="Bowls per case" hint="How many units are in one case. 10/9 oz is 10.">
                    <input
                      inputMode="decimal"
                      value={form.bowlsPerCase ?? ""}
                      onChange={(e) => numeric("bowlsPerCase")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field
                    label="Products per case"
                    hint="How many DIFFERENT products are packed together. An Aldi 20/2CT holds two flavours, so 2."
                  >
                    <input
                      inputMode="numeric"
                      value={form.productsPerCase}
                      onChange={(e) =>
                        set("productsPerCase", Number(e.target.value) || 1)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Net weight per case" hint="Net contents, not the gross weight of the packed case.">
                    <input
                      inputMode="decimal"
                      value={form.netWeightPerCase ?? ""}
                      onChange={(e) =>
                        numeric("netWeightPerCase")(e.target.value)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
              </Fieldset>
              )}


              {showPallet && (
              <>
              <Fieldset title="Weights">
                  <Field label="Case weight (lb)">
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={form.caseWeightLb ?? ""}
                      onChange={(e) =>
                        set("caseWeightLb", e.target.value === "" ? null : Number(e.target.value))
                      }
                      placeholder="6.8"
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
              </Fieldset>

              <Fieldset title="Pallet">
                  <Field label="Cases per layer" hint="Ti - how many cases fit on one layer of the pallet.">
                    <input
                      inputMode="numeric"
                      value={form.casesPerLayer ?? ""}
                      onChange={(e) => numeric("casesPerLayer")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Layers high" hint="Hi - how many layers are stacked. Ti x Hi is cases per pallet.">
                    <input
                      inputMode="numeric"
                      value={form.layersHigh ?? ""}
                      onChange={(e) => numeric("layersHigh")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field
                    label="Pallets per stack"
                    hint="How many finished pallets are stacked in one warehouse slot. 1 unless they double or triple up - the 10/9oz bowls go 3 high."
                  >
                    <input
                      inputMode="numeric"
                      value={form.palletsPerStack}
                      onChange={(e) =>
                        set("palletsPerStack", Number(e.target.value) || 1)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Case width (in)">
                    <input
                      inputMode="decimal"
                      value={form.caseWidthIn ?? ""}
                      onChange={(e) => numeric("caseWidthIn")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Case length (in)">
                    <input
                      inputMode="decimal"
                      value={form.caseLengthIn ?? ""}
                      onChange={(e) => numeric("caseLengthIn")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Case height (in)">
                    <input
                      inputMode="decimal"
                      value={form.caseHeightIn ?? ""}
                      onChange={(e) => numeric("caseHeightIn")(e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Pallet base height (in)">
                    <input
                      inputMode="decimal"
                      value={form.palletBaseHeightIn ?? ""}
                      onChange={(e) =>
                        numeric("palletBaseHeightIn")(e.target.value)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Max pallet height (in)">
                    <input
                      inputMode="decimal"
                      value={form.maxPalletHeightIn ?? ""}
                      onChange={(e) =>
                        numeric("maxPalletHeightIn")(e.target.value)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Partial pallet">
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
                  </Field>

                <dl className="mt-2 flex flex-col gap-1 border-t-2 border-t-brand/40 pt-2 text-sm">
                  <Derived label="Cases per pallet" value={math.casesPerPallet} hint="layer × high" />
                  <Derived
                    label="Pallet weight"
                    value={
                      math.casesPerPallet && form.caseWeightLb
                        ? math.casesPerPallet * form.caseWeightLb
                        : null
                    }
                    unit="lb"
                    hint="cases × case weight, pallet itself not included"
                  />
                  <Derived label="Pallet height" value={math.palletHeightIn} unit="in" hint="base + (high × case)" />
                  <Derived label="Cases per pallet space" value={math.casesPerPalletSpace} hint={`× ${form.palletsPerStack} stacked`} />
                  <Derived label="Stacked height" value={math.stackedHeightIn} unit="in" />
                </dl>
              </Fieldset>
              </>
              )}


              {showSpec && (
              <Fieldset title="What the carton says">
                <Field label="Ingredient statement" hint="Typed, not built from the recipe tree. A label statement is a legal declaration with its own order and wording, and generating one from the BOM would put a guess on a carton.">
                  <textarea
                    rows={4}
                    value={form.ingredientStatement ?? ""}
                    onChange={(e) => set("ingredientStatement", e.target.value || null)}
                    placeholder="WHITE CHICKEN MEAT, WATER, JASMINE RICE, ONION…"
                    className={cn(inputClass, "h-auto py-1.5 leading-snug uppercase")}
                  />
                </Field>
                  <Field label="Handling instructions">
                    <input
                      value={form.handlingInstructions ?? ""}
                      onChange={(e) => set("handlingInstructions", e.target.value || null)}
                      placeholder="DISPLAY & SELL"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Guaranteed shelf life on delivery (days)">
                    <input
                      type="number"
                      min={0}
                      value={form.guaranteedShelfLifeDays ?? ""}
                      onChange={(e) =>
                        set(
                          "guaranteedShelfLifeDays",
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                      placeholder="300"
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                <Field label="Heating instructions">
                  <textarea
                    rows={3}
                    value={form.heatingInstructions ?? ""}
                    onChange={(e) => set("heatingInstructions", e.target.value || null)}
                    placeholder="1. Microwave on high for 2 minutes."
                    className={cn(inputClass, "h-auto py-1.5 leading-snug")}
                  />
                </Field>
              </Fieldset>
              )}

              {showSpec && (
              <Fieldset title="Dating">
                {/*
                  The rule on one line, and its answer underneath in full.

                  Four fields stacked made the reader assemble the rule in
                  their head; the thing they came to check is what today's lot
                  would say and when it would expire, so that is the part
                  printed large. A wrong offset shows up here rather than on a
                  carton.
                */}
                <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pb-2">
                  <Inline label="Shelf life">
                    <input
                      inputMode="numeric"
                      value={form.shelfLifeValue ?? ""}
                      onChange={(e) => numeric("shelfLifeValue")(e.target.value)}
                      className={cn(inputClass, "w-16 tabular-nums")}
                    />
                    <select
                      value={form.shelfLifeUnit}
                      onChange={(e) =>
                        set(
                          "shelfLifeUnit",
                          e.target.value as FinishedProduct["shelfLifeUnit"]
                        )
                      }
                      className={cn(inputClass, "w-24")}
                    >
                      <option value="months">months</option>
                      <option value="days">days</option>
                    </select>
                  </Inline>

                  <Inline
                    label="Expiry offset"
                    hint="Added to the shelf life. The workbook used -1, so a 365 day life expires the day before the anniversary."
                  >
                    <input
                      inputMode="numeric"
                      value={form.expirationOffsetDays}
                      onChange={(e) =>
                        set("expirationOffsetDays", Number(e.target.value) || 0)
                      }
                      className={cn(inputClass, "w-16 tabular-nums")}
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </Inline>

                  <Inline
                    label="Lot format"
                    hint="MMDDYYYY is the production date, which is what tells the app which day a bucket came from."
                  >
                    <input
                      value={form.lotFormat}
                      onChange={(e) => set("lotFormat", e.target.value)}
                      className={cn(inputClass, "w-32 font-mono")}
                    />
                  </Inline>
                </div>

                <div className="grid gap-2 border-t-2 border-t-brand/50 pt-2 sm:grid-cols-2">
                  <Answer label="Lot if produced today" value={sampleLot || "—"} />
                  <Answer
                    label="It would expire"
                    value={sampleExpiry ?? "set a shelf life"}
                    muted={!sampleExpiry}
                  />
                </div>
              </Fieldset>
              )}


              {showSpec && (
              <Fieldset title="Label & codes">
                  <Field label="Case GTIN" hint="The barcode on the shipping case.">
                    <input
                      value={form.caseGtin ?? ""}
                      onChange={(e) => set("caseGtin", e.target.value || null)}
                      className={cn(inputClass, "font-mono")}
                    />
                  </Field>
                  <Field label="Unit UPC" hint="The barcode on the bowl or sleeve the customer picks up.">
                    <input
                      value={form.unitUpc ?? ""}
                      onChange={(e) => set("unitUpc", e.target.value || null)}
                      className={cn(inputClass, "font-mono")}
                    />
                  </Field>
                  <Field label="Label artwork (URL)">
                    <input
                      value={form.labelUrl ?? ""}
                      onChange={(e) => set("labelUrl", e.target.value || null)}
                      placeholder="/labels/600099.pdf"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Artwork owned by" hint="Brand-owned artwork cannot be sold on without the brand owner's approval, so it is excluded from the surplus sell list.">
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
                  </Field>
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
                  <Field label="Customer group">
                    <input
                      value={form.customerGroup ?? ""}
                      onChange={(e) =>
                        set("customerGroup", e.target.value || null)
                      }
                      placeholder="Every Day"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Storage">
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
                  </Field>
                  <Field label="Valid from" hint="Change a carton and set a new date - records made under the old spec keep explaining themselves.">
                    <input
                      type="date"
                      value={form.validFrom}
                      onChange={(e) => set("validFrom", e.target.value)}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
              </Fieldset>
              )}
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
    </form>
  );
}

/**
 * A group of fields, headed by a rule.
 *
 * Odoo's form, and for the reason Odoo does it: a specification is read down
 * a column looking for one label, so every label starts at the same x and the
 * values line up beside them. Boxing each group in a card put a border
 * between every four fields and made the page look like scattered panels
 * rather than one document.
 */
function Fieldset({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1.5 border-b-2 border-b-brand/60 pb-1 text-[0.625rem] font-semibold tracking-wider text-primary uppercase">
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/**
 * One field: label on the left, control on the right.
 *
 * The explanation lives behind a "?" rather than under the field. A paragraph
 * of prose beneath every input is read once and skipped forever after, and in
 * the meantime it doubles the height of the form.
 */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 border-b border-border/50 py-1 last:border-b-0">
      <span className="flex w-44 shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <span className="min-w-0">{label}</span>
        {hint && (
          <span
            title={hint}
            aria-label={hint}
            className="inline-flex size-3.5 shrink-0 cursor-help items-center justify-center rounded-sm bg-muted text-[0.5625rem] font-bold text-muted-foreground"
          >
            ?
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

/** A field on one line with the others, for a rule read left to right. */
function Inline({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
        {hint && (
          <span
            title={hint}
            aria-label={hint}
            className="inline-flex size-3.5 cursor-help items-center justify-center rounded-sm bg-muted text-[0.5625rem] font-bold normal-case"
          >
            ?
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5">{children}</span>
    </label>
  );
}

/** What the rule above works out to. The thing people came to check. */
function Answer({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-sm bg-brand-muted px-2.5 py-1.5">
      <span className="block text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
        {label}
      </span>
      <span
        className={cn(
          "block text-lg font-bold tabular-nums",
          muted && "text-sm font-normal text-muted-foreground"
        )}
      >
        {value}
      </span>
    </div>
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
