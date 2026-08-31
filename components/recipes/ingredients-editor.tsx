"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  saveRecipeBatch,
  saveRecipeLines,
  type LineInput,
} from "@/lib/recipes/line-actions";
import {
  batchTotal,
  describeYield,
  displayQuantity,
  lineMath,
  lossFactor,
  yieldPct,
  type DisplayUnit,
} from "@/lib/recipes/yield";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The recipe, editable, with the workbook's arithmetic on screen.
 *
 * The four numbers the sheet keeps, and where they come from:
 *
 *   BATCH TOTAL   the sum of the quantities below - derived
 *   DESIRED BATCH what you set out to make        - typed
 *   BATCH YEILD   what comes out of the kettle    - typed
 *   YEILD         (yield - desired) / desired     - derived
 *
 * Only the two typed numbers are stored. The percentage is worked out every
 * time it is shown, so it can never drift away from them - which is exactly
 * what goes wrong when all three are keyed in by hand.
 */

export type EditableLine = {
  id?: string;
  ingredientName: string;
  materialId: string | null;
  subRecipeId: string | null;
  quantity: number;
  /** The unit the recipe quantity is written in. */
  uom: string | null;
  /** The unit the calculated amount prints in. Null = same as uom. */
  displayUom: string | null;
  lossPct: number | null;
};

export type PickerOption = {
  id: string;
  code: string;
  name: string;
  kind: "material" | "subrecipe";
  uom: string | null;
};

/** Weight and count only. Recipes are never measured by volume here. */
const UOMS = ["LB", "OZ", "G", "KG", "EA", "CS"];

/** Units a calculated amount can be printed in, chosen per line. */
const DISPLAY_UNITS = ["LB", "OZ", "G", "KG", "EA", "CS"];

export type CallBasis = "batch" | "unit" | "case";

/** How the floor is told what to make. */
const CALL_OPTIONS: { value: CallBasis; label: string; hint: string }[] = [
  { value: "batch", label: "Batches", hint: "how many kettles to run" },
  { value: "unit", label: "Each", hint: "how many pieces to make" },
  { value: "case", label: "Cases", hint: "how many cases to make" },
];

export function IngredientsEditor({
  recipeId,
  recipeUom,
  initialLines,
  initialBatchSize,
  initialBatchYield,
  initialCallBasis,
  kind,
  options,
  canEdit,
}: {
  recipeId: string;
  recipeUom: string | null;
  initialLines: EditableLine[];
  initialBatchSize: number | null;
  initialBatchYield: number | null;
  initialCallBasis: CallBasis;
  /**
   * Per-line loss is only meaningful where portions are made up: a bowl loses
   * product at assembly. A kitchen recipe's loss is the yield - what the
   * kettle gives back against what went in - so the column is hidden there
   * rather than offering a second, contradictory place to record it.
   */
  kind: "finished" | "assembly" | "kitchen";
  options: PickerOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * A saved recipe is locked. Editing is a deliberate act, because a formula
   * everybody can nudge in passing is a formula nobody can trust - and a
   * quantity changed by accident is not visible until a batch comes out wrong.
   */
  const [editing, setEditing] = useState(false);
  const live = canEdit && editing;

  /**
   * Locked fields must not look like fields. A white box with a border reads
   * as "type here" whether or not it accepts input, so when the recipe is
   * locked the chrome comes off entirely and the value reads as text.
   */
  const fieldClass = live
    ? "rounded-md border border-border bg-card"
    : "rounded-md border border-transparent bg-transparent";

  const [lines, setLines] = useState<EditableLine[]>(initialLines);
  const [batchSize, setBatchSize] = useState(
    initialBatchSize === null ? "" : String(initialBatchSize)
  );
  const [batchYield, setBatchYield] = useState(
    initialBatchYield === null ? "" : String(initialBatchYield)
  );
  const [callBasis, setCallBasis] = useState(initialCallBasis);
  // null = closed, "add" = appending, a number = replacing that row. Lines are
  // always chosen from the list; nothing is typed, so every line resolves to a
  // real Odoo material or a real subrecipe and the tree stays connected.
  const [picking, setPicking] = useState<null | "add" | number>(null);
  const [query, setQuery] = useState("");


  const showLoss = kind === "finished" || kind === "assembly";

  /**
   * Batch numbers only mean something for things made in a kettle. An assembly
   * or a finished product is built one unit or one case at a time, so its
   * "recipe" is already per-unit and a desired batch and yield would be a
   * second, meaningless pair of numbers to keep.
   */
  const usesBatch = callBasis === "batch";
  const perLabel = callBasis === "case" ? "case" : "each";

  const total = useMemo(() => batchTotal(lines), [lines]);
  const desired = batchSize === "" ? null : Number(batchSize);
  const produced = batchYield === "" ? null : Number(batchYield);
  const pct = yieldPct(desired, produced);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options.slice(0, 40);
    return options
      .filter((option) =>
        `${option.code} ${option.name}`.toLowerCase().includes(needle)
      )
      .slice(0, 40);
  }, [options, query]);

  function update(index: number, patch: Partial<EditableLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }

  function choose(option: PickerOption) {
    const picked = {
      ingredientName: option.name,
      materialId: option.kind === "material" ? option.id : null,
      subRecipeId: option.kind === "subrecipe" ? option.id : null,
      uom: option.uom ?? "LB",
    };

    setLines((prev) =>
      picking === "add"
        ? [...prev, { ...picked, quantity: 0, lossPct: null, displayUom: null }]
        : prev.map((line, i) =>
            i === picking ? { ...line, ...picked } : line
          )
    );
    setPicking(null);
    setQuery("");
  }

  function cancel() {
    setLines(initialLines);
    setBatchSize(initialBatchSize === null ? "" : String(initialBatchSize));
    setBatchYield(initialBatchYield === null ? "" : String(initialBatchYield));
    setCallBasis(initialCallBasis);
    setPicking(null);
    setQuery("");
    setError(null);
    setNotice(null);
    setWarning(null);
    setEditing(false);
  }

  function save() {
    setNotice(null);
    setWarning(null);
    setError(null);
    startTransition(async () => {
      const batchResult = await saveRecipeBatch({
        recipeId,
        // An each/case recipe has no batch, so the two numbers are cleared
        // rather than left behind from whenever it was last a batch recipe.
        batchSize: usesBatch ? desired : null,
        batchYield: usesBatch ? produced : null,
        callBasis,
      });
      if (!batchResult.ok) {
        setError(batchResult.message);
        return;
      }

      // A partial save is neither success nor failure, and saying "Saved"
      // when half of it did not would be the worse of the two lies.
      const warnings: string[] = [];
      if (batchResult.warning) warnings.push(batchResult.warning);

      const payload: LineInput[] = lines.map((line) => ({
        id: line.id,
        ingredientName: line.ingredientName,
        materialId: line.materialId,
        subRecipeId: line.subRecipeId,
        quantity: line.quantity,
        uom: line.uom,
        displayUom: line.displayUom,
        lossPct: line.lossPct,
      }));

      const result = await saveRecipeLines({ recipeId, lines: payload });
      if (!result.ok) {
        setError(result.message);
        return;
      }

      if (result.warning) warnings.push(result.warning);

      setNotice(`Saved ${result.saved} ingredient lines.`);
      setWarning(warnings.length > 0 ? warnings.join(" ") : null);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          Called in
          <select
            value={callBasis}
            disabled={!live}
            onChange={(event) => setCallBasis(event.target.value as CallBasis)}
            className={cn("h-8 px-2 text-sm", fieldClass)}
          >
            {CALL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[0.6875rem] text-muted-foreground">
          The floor is told{" "}
          {CALL_OPTIONS.find((option) => option.value === callBasis)?.hint}.
        </span>

      </div>

      {usesBatch && (
        <>
      {/* The four numbers, together, because they only mean anything as a set */}
      <section className="grid gap-2 sm:grid-cols-4">
        <Stat
          label="Batch total"
          hint="sum of the quantities below"
          value={total > 0 ? total.toFixed(2) : "—"}
          unit={recipeUom ?? "LB"}
          derived
        />
        <Field label="Desired batch" hint="what you set out to make">
          <input
            type="number"
            min={0}
            step="any"
            value={batchSize}
            readOnly={!live}
            onChange={(event) => setBatchSize(event.target.value)}
            placeholder="—"
            className={cn("h-8 w-full px-2 text-right text-sm tabular-nums", fieldClass)}
          />
        </Field>
        <Field label="Batch yield" hint="what actually comes out">
          <input
            type="number"
            min={0}
            step="any"
            value={batchYield}
            readOnly={!live}
            onChange={(event) => setBatchYield(event.target.value)}
            placeholder="—"
            className={cn("h-8 w-full px-2 text-right text-sm tabular-nums", fieldClass)}
          />
        </Field>
        <div
          className={cn(
            "rounded-md px-2.5 py-1.5 ring-1",
            pct === null
              ? "bg-muted ring-foreground/10"
              : pct > 0.05
                ? "bg-success/10 ring-success/30"
                : pct < -0.05
                  ? "bg-warning-muted ring-warning-foreground/30"
                  : "bg-muted ring-foreground/10"
          )}
        >
          <span className="block text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Yield
          </span>
          <span className="block text-lg font-bold tabular-nums">
            {pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
          </span>
          <span className="block text-[0.625rem] leading-tight text-muted-foreground">
            {describeYield(pct)}
          </span>
        </div>
      </section>
        </>
      )}

      {notice && (
        <p className="rounded-md bg-success/10 px-3 py-1.5 text-xs">{notice}</p>
      )}
      {warning && (
        <p className="rounded-md bg-warning-muted px-3 py-1.5 text-xs text-warning-foreground">
          {warning}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-md ring-1 ring-foreground/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-brand-muted">
              <Th>Ingredient</Th>
              <Th numeric className="w-32">
                {usesBatch
                  ? `For ${desired ? desired.toLocaleString() : "batch"}`
                  : `Per ${perLabel}`}
              </Th>
              <Th numeric className="w-24">
                Recipe qty
              </Th>
              <Th className="w-20">U/M</Th>
              <Th numeric className="w-20">
                % of batch
              </Th>
              {showLoss && (
                <Th numeric className="w-20">
                  Loss %
                </Th>
              )}
              {live && <Th className="w-10" />}
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-muted/40">
            {lines.map((line, index) => {
              const math = lineMath(line, total, desired);
              return (
                <tr key={index} className="border-t border-border">
                  <Td>
                    <button
                      type="button"
                      disabled={!live}
                      onClick={() => {
                        setPicking(index);
                        setQuery("");
                      }}
                      className={cn(
                        "flex w-full min-w-48 items-baseline gap-1.5 rounded-md px-2 py-1 text-left text-sm",
                        live
                          ? "border border-border bg-card hover:bg-muted"
                          : "cursor-default"
                      )}
                    >
                      <span className="truncate">
                        {line.ingredientName || "Choose an ingredient…"}
                      </span>
                      {line.subRecipeId && (
                        <span className="shrink-0 text-[0.5625rem] uppercase text-primary">
                          subrecipe
                        </span>
                      )}
                      {!line.subRecipeId && !line.materialId && (
                        <span
                          title="This line is not linked to an Odoo material or a subrecipe, so it cannot roll up. Choose it from the list to reconnect it."
                          className="shrink-0 cursor-help text-[0.5625rem] uppercase text-warning-foreground"
                        >
                          unlinked
                        </span>
                      )}
                    </button>
                  </Td>
                  <Td className="text-right">
                    {(() => {
                      const pounds = usesBatch
                        ? desired && total > 0
                          ? math.scaledWithLoss
                          : null
                        : line.quantity * lossFactor(line.lossPct);

                      const unit = (line.displayUom ??
                        line.uom ??
                        "LB") as DisplayUnit;

                      return (
                        <span className="inline-flex items-center justify-end gap-1">
                          <span className="whitespace-nowrap text-base font-bold tabular-nums text-primary">
                            {pounds === null
                              ? "—"
                              : (() => {
                                  const shown = displayQuantity(pounds, unit);
                                  const places =
                                    Math.abs(shown.value) >= 100
                                      ? 0
                                      : Math.abs(shown.value) >= 10
                                        ? 1
                                        : 2;
                                  return shown.value.toFixed(places);
                                })()}
                          </span>
                          <select
                            value={line.displayUom ?? line.uom ?? "LB"}
                            disabled={!live}
                            onChange={(event) =>
                              update(index, { displayUom: event.target.value })
                            }
                            aria-label="Print this amount in"
                            className={cn(
                              "px-0.5 py-0 text-[0.6875rem] font-semibold text-primary",
                              live
                                ? "rounded-md border border-border bg-card"
                                : "appearance-none border-none bg-transparent"
                            )}
                          >
                            {DISPLAY_UNITS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </span>
                      );
                    })()}
                  </Td>
                  <Td>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={line.quantity}
                      readOnly={!live}
                      onChange={(event) =>
                        update(index, { quantity: Number(event.target.value) })
                      }
                      aria-label="Quantity"
                      className={cn(
                        "w-full px-2 py-1 text-right text-sm tabular-nums",
                        fieldClass
                      )}
                    />
                  </Td>
                  <Td>
                    <select
                      value={line.uom ?? "LB"}
                      disabled={!live}
                      onChange={(event) =>
                        update(index, { uom: event.target.value })
                      }
                      aria-label="Unit"
                      className={cn("w-full px-1 py-1 text-sm", fieldClass)}
                    >
                      {UOMS.map((uom) => (
                        <option key={uom} value={uom}>
                          {uom}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td className="text-right text-xs tabular-nums text-muted-foreground">
                    {total > 0 ? `${math.percent.toFixed(2)}%` : "—"}
                  </Td>
                  {showLoss && (
                    <Td>
                      <input
                        type="number"
                        step="any"
                        value={line.lossPct ?? ""}
                        readOnly={!live}
                        onChange={(event) =>
                          update(index, {
                            lossPct:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          })
                        }
                        placeholder="—"
                        aria-label="Loss percent"
                        className={cn(
                        "w-full px-2 py-1 text-right text-sm tabular-nums",
                        fieldClass
                      )}
                      />
                    </Td>
                  )}
                  {live && (
                    <Td>
                      <button
                        type="button"
                        onClick={() =>
                          setLines((prev) => prev.filter((_, i) => i !== index))
                        }
                        aria-label="Remove line"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </Td>
                  )}
                </tr>
              );
            })}

            {lines.length === 0 && (
              <tr>
                <td
                  colSpan={(live ? 5 : 4) + (showLoss ? 1 : 0) + 1}
                  className="px-3 py-4 text-center text-sm text-muted-foreground"
                >
                  No ingredients yet.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-t-brand/30 bg-brand-muted/60">
              {live && <td />}
              <Td className="text-[0.625rem] font-semibold uppercase">Total</Td>
              <Td className="text-right">
                {(() => {
                  const pounds = usesBatch
                    ? desired ?? 0
                    : lines.reduce(
                        (sum, l) => sum + l.quantity * lossFactor(l.lossPct),
                        0
                      );
                  const shown = displayQuantity(
                    pounds,
                    (recipeUom ?? "LB") as DisplayUnit
                  );
                  const places = Math.abs(shown.value) >= 100 ? 0 : 1;
                  return (
                    <span className="whitespace-nowrap text-base font-bold tabular-nums text-primary">
                      {shown.value.toFixed(places)}
                      <span className="ml-1 text-[0.6875rem] font-semibold">
                        {shown.unit}
                      </span>
                    </span>
                  );
                })()}
              </Td>
              <Td className="text-right text-sm font-bold tabular-nums">
                {total.toFixed(2)}
              </Td>
              <Td className="text-xs">{recipeUom ?? "LB"}</Td>
              <Td className="text-right text-xs tabular-nums">
                {total > 0 ? "100%" : "—"}
              </Td>
              {showLoss && <Td />}
              {live && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setPicking(picking === "add" ? null : "add");
                  setQuery("");
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground hover:bg-muted"
              >
                <Plus className="size-3.5" />
                Add ingredient
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="ml-auto h-8 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                Save recipe
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" />
                Locked. Click Edit to change quantities or the batch.
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setNotice(null);
                  setWarning(null);
                  setError(null);
                }}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Pencil className="size-3.5" />
                Edit recipe
              </button>
            </>
          )}
        </div>
      )}

      <Dialog
        open={picking !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPicking(null);
            setQuery("");
          }
        }}
      >
        <DialogContent className="max-w-xl gap-0 p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle>
              {picking === "add"
                ? "Add an ingredient"
                : `Replace ${lines[picking as number]?.ingredientName || "this line"}`}
            </DialogTitle>
            <DialogDescription>
              Materials come from Odoo and subrecipes from Bettrbyus. Choosing
              from the list is what keeps every recipe connected to the tree.
            </DialogDescription>
          </DialogHeader>

          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search materials and subrecipes…"
              aria-label="Search ingredients"
              autoFocus
              className="h-11 w-full bg-transparent pr-4 pl-10 text-sm focus:outline-none"
            />
          </div>

          <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto">
            {matches.map((option) => (
              <li key={`${option.kind}-${option.id}`}>
                <button
                  type="button"
                  onClick={() => choose(option)}
                  className="flex w-full items-baseline gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="w-24 shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                    {option.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  {option.kind === "subrecipe" ? (
                    <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase text-primary">
                      subrecipe
                    </span>
                  ) : (
                    <span className="shrink-0 text-[0.5625rem] uppercase text-muted-foreground">
                      {option.uom ?? "—"}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing matches &ldquo;{query}&rdquo;.
              </li>
            )}
          </ul>

          <p className="border-t border-border px-4 py-2 text-[0.6875rem] text-muted-foreground">
            {matches.length} of {options.length} shown. Press Esc or the X to
            close without choosing.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({
  children,
  numeric,
  className,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b border-border px-2 py-1.5 text-[0.625rem] font-semibold tracking-wider text-primary uppercase",
        numeric ? "text-right" : "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-2 py-1 align-top", className)}>{children}</td>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="rounded-md bg-card px-2.5 py-1.5 ring-1 ring-foreground/10">
      <span className="block text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
      <span className="mt-0.5 block text-[0.625rem] leading-tight text-muted-foreground">
        {hint}
      </span>
    </label>
  );
}

function Stat({
  label,
  hint,
  value,
  unit,
  derived,
}: {
  label: string;
  hint: string;
  value: string;
  unit: string;
  derived?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md px-2.5 py-1.5 ring-1 ring-foreground/10",
        derived ? "bg-muted" : "bg-card"
      )}
    >
      <span className="block text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span className="block text-lg font-bold tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {unit}
        </span>
      </span>
      <span className="block text-[0.625rem] leading-tight text-muted-foreground">
        {hint}
      </span>
    </div>
  );
}
