"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
export type SpecSaveStatus = "saved" | "dirty" | "saving" | "error";

/** What a case can be counted in. */
const CASE_UNITS = ["bowl", "burrito", "cup", "bag", "tray", "piece"];

export function FinishedProductForm({
  product,
  recipeId,
  recipeName,
  recipeCode,
  caseUnits,
  section = "spec",
  onSectionChange,
  readOnly = false,
  autosave = false,
  onStatus,
  saveNowRef,
}: {
  product: FinishedProduct | null;
  /** Set when the form is a tab on a recipe, which is the normal case. */
  recipeId?: string;
  /** Seeds the name so a new spec is not blank. */
  recipeName?: string;
  /** Seeds the item code the same way - the recipe's own number. */
  recipeCode?: string;
  /** What a case can be counted in, from Recipes > Settings. */
  caseUnits?: string[];
  /** Read only until the recipe is opened for editing. */
  readOnly?: boolean;
  /**
   * Which half of the specification to show. Carlos asked for the pallet to be
   * its own tab, so the same form renders twice - once for how it is stacked,
   * once for everything else. Both save the whole record, so switching tabs
   * never drops a field the other tab owns.
   */
  section?: "all" | "pallet" | "spec";
  /** Switching between the two halves, when they share one tab. */
  onSectionChange?: (next: "spec" | "pallet") => void;
  /** Write every change a moment after it stops, instead of waiting for Save. */
  autosave?: boolean;
  /** Where the saving stands, for a cloud somewhere up the page. */
  onStatus?: (status: SpecSaveStatus) => void;
  /** Filled with a function that saves right now, for that cloud to call. */
  saveNowRef?: React.MutableRefObject<(() => void) | null>;
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
      itemCode: recipeCode ?? "",
      name: recipeName ?? "",
      customerGroup: null,
      storageType: "freezer",
      bowlsPerCase: null,
      caseUnit: "bowl",
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

  /*
    What is being typed, kept as text until the box is left.

    Storing Number(raw) on every keystroke made "5." collapse back to 5, so a
    decimal could never be typed: 5.625 was impossible. The number the form
    holds still updates as you type; only the box keeps the raw text.
  */
  const [texts, setTexts] = useState<Partial<Record<keyof FinishedProduct, string>>>({});
  const numeric =
    <K extends keyof FinishedProduct>(key: K) =>
    (raw: string) => {
      setTexts((current) => ({ ...current, [key]: raw }));
      const trimmed = raw.trim().replace(",", ".");
      if (trimmed === "") return set(key, null as FinishedProduct[K]);
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) set(key, parsed as FinishedProduct[K]);
    };
  const numField = <K extends keyof FinishedProduct>(key: K) => ({
    value: texts[key] ?? ((form[key] as number | null) ?? ""),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => numeric(key)(event.target.value),
    onBlur: () => setTexts((current) => ({ ...current, [key]: undefined })),
  });

  /*
    Saved as you go.

    Typing a number and moving to another tab used to lose it unless Save was
    clicked, and nothing said so. Now every change is written a moment after
    it stops, and the cloud beside the recipe's name says where things stand.
    The manual Save still works, and the cloud can be clicked to save now.
  */
  const lastSaved = useRef(JSON.stringify(product ?? null));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(
    (current: FinishedProduct) => {
      setError(null);
      onStatus?.("saving");
      startTransition(async () => {
        const result = await saveFinishedProduct({
          ...current,
          id: current.id || undefined,
          recipeId,
        });
        if (result.ok) {
          const settled = { ...current, id: result.id };
          lastSaved.current = JSON.stringify(settled);
          setForm((state) => (state.id === settled.id ? state : { ...state, id: settled.id }));
          onStatus?.("saved");
          if (!recipeId) router.push("/production/finished-products");
          router.refresh();
        } else {
          onStatus?.("error");
          setError(result.message);
        }
      });
    },
    [onStatus, recipeId, router]
  );
  useEffect(() => {
    if (!autosave) return;
    const snapshot = JSON.stringify(form);
    if (snapshot === lastSaved.current) return;
    onStatus?.("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(form), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [form, autosave, save, onStatus]);
  useEffect(() => {
    if (!saveNowRef) return;
    saveNowRef.current = () => {
      if (timer.current) clearTimeout(timer.current);
      if (JSON.stringify(form) !== lastSaved.current) save(form);
    };
    return () => {
      saveNowRef.current = null;
    };
  }, [saveNowRef, form, save]);

  const math = palletMath(form);
  const warnings = specWarnings(form);

  // A worked example beats a description of the rule.
  const sampleDate = new Date().toISOString().slice(0, 10);
  const sampleLot = lotFor(form, sampleDate);
  const sampleExpiry = expirationFor(form, sampleDate);


  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    save(form);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-3 py-3 sm:px-4">
      {/* Two halves of one document, read in one sitting. The switch sits
          outside the read-only fieldset so both halves can be read without
          opening the recipe for editing. */}
      {onSectionChange && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
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
          </span>
          {readOnly && (
            <span className="text-xs text-muted-foreground">
              Reading. Press <span className="font-semibold text-primary">Edit recipe</span> up top to change it.
            </span>
          )}
        </div>
      )}
      <fieldset disabled={readOnly} className="contents">
      {autosave && error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
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
                  <Field
                    label="Units per case"
                    hint="How many pieces are in one case, and what they are. A 10/9 oz bowl case is 10 bowls; a 12-carton family pack of 4 is 48 burritos."
                  >
                    <span className="flex gap-1.5">
                      <input
                        inputMode="decimal"
                        {...numField("bowlsPerCase")}
                        className={cn(inputClass, "min-w-0 flex-1 tabular-nums")}
                      />
                      <select
                        value={form.caseUnit ?? "bowl"}
                        onChange={(e) => set("caseUnit", e.target.value)}
                        aria-label="Unit"
                        className={cn(inputClass, "w-28 shrink-0")}
                      >
                        {[...new Set([...(caseUnits ?? CASE_UNITS), ...(form.caseUnit ? [form.caseUnit] : [])])].map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </span>
                  </Field>
                  <Field
                    label="Products per case"
                    hint="Cartons or packs in the case. A 12-carton case is 12; a two-flavour combo case is 2; a case of loose bowls is 1."
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
              </Fieldset>
              )}


              {showPallet && (
              <>
              <Fieldset title="Weights">
                  <Field
                    label="Net weight per case (lb)"
                    hint="What is inside: the food only. Decimals are fine - 5.625."
                  >
                    <input
                      inputMode="decimal"
                      {...numField("netWeightPerCase")}
                      placeholder="5.625"
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field
                    label="Gross weight per case (lb)"
                    hint="The packed case as it ships: food, cartons, trays and box. The pallet weight is built from this."
                  >
                    <input
                      inputMode="decimal"
                      {...numField("caseWeightLb")}
                      placeholder="6.8"
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <dl className="mt-2 flex flex-col gap-1 border-t-2 border-t-brand/40 pt-2 text-sm">
                    <Derived
                      label="Packaging per case"
                      value={
                        form.caseWeightLb && form.netWeightPerCase
                          ? Math.max(0, form.caseWeightLb - form.netWeightPerCase)
                          : null
                      }
                      unit="lb"
                      hint="gross minus net"
                    />
                  </dl>
              </Fieldset>

              <Fieldset title="Pallet">
                  <Field label="Cases per layer" hint="Ti - how many cases fit on one layer of the pallet.">
                    <input
                      inputMode="numeric"
                      {...numField("casesPerLayer")}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Layers high" hint="Hi - how many layers are stacked. Ti x Hi is cases per pallet.">
                    <input
                      inputMode="numeric"
                      {...numField("layersHigh")}
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
                      {...numField("caseWidthIn")}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Case length (in)">
                    <input
                      inputMode="decimal"
                      {...numField("caseLengthIn")}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Case height (in)">
                    <input
                      inputMode="decimal"
                      {...numField("caseHeightIn")}
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>
                  <Field label="Pallet base height (in)">
                    <input
                      inputMode="decimal"
                      {...numField("palletBaseHeightIn")}
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
                    hint="cases x gross case weight, pallet itself not included"
                  />
                  <Derived label="Pallet height" value={math.palletHeightIn} unit="in" hint="base + (high x case height), worked out, not typed" />
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
                  <Field label="Shelf life" hint="How long the product is good for from its production date.">
                    <span className="flex gap-1.5">
                    <input
                      inputMode="numeric"
                      {...numField("shelfLifeValue")}
                      className={cn(inputClass, "w-20 tabular-nums")}
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
                    </span>
                  </Field>

                  <Field
                    label="Expiry offset (days)"
                    hint="Added to the shelf life. The workbook used -1, so a 365 day life expires the day before the anniversary."
                  >
                    <input
                      inputMode="numeric"
                      value={form.expirationOffsetDays}
                      onChange={(e) =>
                        set("expirationOffsetDays", Number(e.target.value) || 0)
                      }
                      className={cn(inputClass, "tabular-nums")}
                    />
                  </Field>

                  <Field
                    label="Lot format"
                    hint="MMDDYYYY is the production date, which is what tells the app which day a bucket came from."
                  >
                    <input
                      value={form.lotFormat}
                      onChange={(e) => set("lotFormat", e.target.value)}
                      className={cn(inputClass, "font-mono")}
                    />
                  </Field>

                <div className="mt-2 grid gap-2 border-t-2 border-t-brand/40 pt-2 sm:grid-cols-2">
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

          {!autosave && error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {/* With the cloud saving as you go, a Save button is a second
                way to do what already happened. */}
            {!autosave && !readOnly && !recipeId && (
              <>
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
                  className="inline-flex h-9 items-center rounded-sm bg-card ring-1 ring-foreground/10 px-4 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
              </>
            )}

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
      </fieldset>
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
