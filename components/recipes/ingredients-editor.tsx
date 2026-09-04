"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { beginDrag, dataOf, moveItem } from "@/lib/drag";
import {
  saveRecipeBatch,
  saveRecipeLines,
  type LineInput,
} from "@/lib/recipes/line-actions";
import {
  batchTotal,
  describeYield,
  toPounds,
  displayQuantity,
  lineMath,
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
  editing: externalEditing,
  setEditing: setExternalEditing,
  footer,
  railPanel,
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
  /** Page-wide edit mode, owned by RecipeDetail. */
  editing: boolean;
  setEditing: (next: boolean) => void;
  /** Rendered under the list - the allergens it inherits. */
  footer?: React.ReactNode;
  /**
   * Where the batch numbers go.
   *
   * They belong in the rail but are saved by this form alongside the lines,
   * so they are portalled there rather than lifted into separate state. The
   * node arrives as a prop rather than being looked up from the document: a
   * getElementById during render finds nothing on the server and something on
   * the client, which is precisely a hydration mismatch.
   */
  railPanel?: HTMLElement | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /**
   * Changing how a recipe is called out is not a small edit.
   *
   * Batches scale every quantity to a desired batch; each and cases do not.
   * Switching between them changes what every number in the table means, so
   * it asks first rather than quietly re-reading the whole recipe.
   */
  const [pendingBasis, setPendingBasis] = useState<CallBasis | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * A saved recipe is locked. Editing is a deliberate act, because a formula
   * everybody can nudge in passing is a formula nobody can trust - and a
   * quantity changed by accident is not visible until a batch comes out wrong.
   */
  /**
   * Edit mode belongs to the whole recipe, not this tab.
   *
   * The name, the item number, the department and the quantities are all
   * things you change in the same sitting, so one switch unlocks all of them.
   * A pencil per field means finding four of them to make one correction.
   */
  const [editing, setEditing] = [externalEditing, setExternalEditing];
  const live = canEdit && editing;

  /**
   * Locked fields must not look like fields. A white box with a border reads
   * as "type here" whether or not it accepts input, so when the recipe is
   * locked the chrome comes off entirely and the value reads as text.
   */
  const fieldClass = live
    ? "rounded-sm bg-card ring-1 ring-foreground/10"
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

  /** Ingredient order is the recipe's method order - saved as sort_order. */
  function moveLine(index: number, direction: -1 | 1) {
    setLines((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /* Drag a line by its grip, same as arranging departments on the HR board. */
  const [dropOn, setDropOn] = useState<number | null>(null);

  function dragIngredient(event: React.PointerEvent<HTMLElement>, index: number) {
    const row = (event.currentTarget as HTMLElement).closest("tr");
    beginDrag(event, {
      hit: "[data-ing-row]",
      ghost: row as HTMLElement | null,
      onMove: (target) => {
        const value = dataOf(target, "ingRow");
        setDropOn(value === null ? null : Number(value));
      },
      onDrop: (target) => {
        const value = dataOf(target, "ingRow");
        if (value === null) return;
        const to = Number(value);
        if (to === index) return;
        setLines((prev) => moveItem(prev, index, to));
      },
      onEnd: () => setDropOn(null),
    });
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
    // Everything downstream divides by the yield, so a batch recipe cannot be
    // saved without one. It may equal the desired batch - it just has to be said.
    if (usesBatch && !(produced !== null && produced > 0)) {
      setError(
        "Batch yield is required — what actually comes out. Enter the desired batch size again if nothing is lost."
      );
      return;
    }
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

  const basisNote: Record<CallBasis, string> = {
    batch:
      "Every quantity becomes a share of the desired batch, so the amounts shown scale with the batch you ask for.",
    unit: "Each quantity is what one unit takes, and nothing scales.",
    case: "Each quantity is what one case takes, and nothing scales.",
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
      {pendingBasis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-sm rounded-sm bg-card p-4 shadow-lg ring-2 ring-warning-foreground">
            <h2 className="text-sm font-bold">
              Call this recipe in{" "}
              {CALL_OPTIONS.find((o) => o.value === pendingBasis)?.label.toLowerCase()}
              ?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {basisNote[pendingBasis]}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Every amount in the table below is read a different way
              afterwards. Nothing is lost — you can switch back.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingBasis(null)}
                className="h-8 flex-1 rounded-sm border border-border text-sm text-muted-foreground hover:bg-muted"
              >
                Leave it as it is
              </button>
              <button
                type="button"
                onClick={() => {
                  setCallBasis(pendingBasis);
                  setPendingBasis(null);
                }}
                className="h-8 flex-1 rounded-sm bg-primary text-sm font-medium text-primary-foreground"
              >
                Change it
              </button>
            </div>
          </div>
        </div>
      )}
      {railPanel &&
        createPortal(
          <div className="flex flex-col gap-1.5">
            <label className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Called in</span>
              <select
                value={callBasis}
                disabled={!live}
                onChange={(event) =>
                  setPendingBasis(event.target.value as CallBasis)
                }
                className={cn(
                  "h-6 max-w-28 px-1 text-right text-xs font-semibold",
                  fieldClass
                )}
              >
                {CALL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {usesBatch && (
              <>
                <RailNumber
                  label="Desired batch"
                  hint="what you set out to make"
                  value={batchSize}
                  readOnly={!live}
                  onChange={setBatchSize}
                  unit={recipeUom ?? "LB"}
                />
                <RailNumber
                  label="Batch yield"
                  hint={
                    live && !(produced !== null && produced > 0)
                      ? "required — what actually comes out"
                      : "what actually comes out"
                  }
                  value={batchYield}
                  readOnly={!live}
                  onChange={setBatchYield}
                  unit={recipeUom ?? "LB"}
                />
                <div className="flex items-baseline justify-between gap-2 border-t border-border pt-1.5 text-xs">
                  <span className="text-muted-foreground">Ingredients total</span>
                  <span className="font-semibold tabular-nums">
                    {total > 0 ? total.toFixed(2) : "—"}{" "}
                    <span className="text-[0.625rem] font-normal text-muted-foreground uppercase">
                      {(recipeUom ?? "LB").toLowerCase()}
                    </span>
                  </span>
                </div>
                <div
                  className={cn(
                    "flex items-baseline justify-between gap-2 rounded-sm px-1.5 py-1",
                    pct === null
                      ? "bg-muted"
                      : pct > 0.05
                        ? "bg-success/15"
                        : pct < -0.05
                          ? "bg-warning-muted"
                          : "bg-muted"
                  )}
                >
                  <span className="text-xs text-muted-foreground">Yield</span>
                  <span className="text-right">
                    <span className="block text-sm font-bold tabular-nums">
                      {pct === null
                        ? "—"
                        : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
                    </span>
                    <span className="block text-[0.5625rem] leading-tight text-muted-foreground">
                      {describeYield(pct)}
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>,
          railPanel
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
            {/*
              The name gets the room it needs and the numbers sit together.

              "For 100" was floating out at the far right, a screen away from
              the ingredient it belongs to, with acres of nothing between. It
              is the number people read off this table, so it sits next to the
              name; the reference figures follow it.
            */}
            {/*
              Fixed widths, and the same ones locked or editing.

              The name took whatever was left, so switching to edit mode - one
              more column, and inputs instead of text - re-dealt every column
              and the table appeared to jump. Everything but the name is now
              the width it needs and the name absorbs the rest, so the two
              modes line up.
            */}
            <tr className="bg-brand-muted">
              <Th className="w-[34%]">Ingredient</Th>
              {/* The number people read off this table, so it sits beside the
                  name it belongs to rather than a screen away from it. */}
              <Th numeric className="w-28">
                {usesBatch
                  ? `For ${desired ? desired.toLocaleString() : "batch"}`
                  : `Per ${perLabel}`}
              </Th>
              {/* Slack lives here, between what you read and what you edit. */}
              <Th />
              <Th numeric className="w-24">
                Recipe qty
              </Th>
              <Th className="w-20">U/M</Th>
              <Th numeric className="w-20">
                % of batch
              </Th>
              <Th numeric className="w-20">
                {showLoss ? "Loss %" : ""}
              </Th>
              <Th className="w-16" />
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-border/50">
            {lines.map((line, index) => {
              const math = lineMath(line, total, desired);
              return (
                <tr
                  key={index}
                  data-ing-row={index}
                  className={cn(
                    "border-t border-border",
                    dropOn === index && "bg-brand-muted"
                  )}
                >
                  <Td>
                    <span className="flex items-center gap-1.5">
                      {live && (
                        <span
                          onPointerDown={(event) => dragIngredient(event, index)}
                          role="button"
                          tabIndex={-1}
                          aria-label="Drag to reorder"
                          title="Drag to reorder"
                          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" />
                        </span>
                      )}
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
                    </span>
                  </Td>
                  <Td className="text-right">
                    {(() => {
                      /*
                        A batch recipe scales: 5.5 of a 100 lb batch becomes
                        whatever 5.5 is of the batch you asked for.

                        A recipe called in each or cases does not. The written
                        quantity IS the per-each amount - one bowl takes 5.5 oz
                        of rice mix whether you make one or a thousand - so the
                        column repeats it rather than working anything out. It
                        was being read as pounds and converted back to ounces,
                        which is where 5.5 oz became 92.4.
                      */
                      const pounds = usesBatch
                        ? desired && total > 0
                          ? math.scaledWithLoss
                          : null
                        : toPounds(line.quantity, line.uom);

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
                                ? "rounded-sm bg-card ring-1 ring-foreground/10"
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
                  {/* Slack, so Per each stays next to the name. */}
                  <Td />
                  <Td>
                    <DecimalInput
                      value={line.quantity}
                      readOnly={!live}
                      onChange={(next) => update(index, { quantity: next })}
                      label="Quantity"
                      className={cn(
                        "w-full px-2 py-0.5 text-right text-sm tabular-nums",
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
                  <Td>
                    {showLoss && (
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
                          "w-full px-2 py-0.5 text-right text-sm tabular-nums",
                          fieldClass
                        )}
                      />
                    )}
                  </Td>
                  <Td>
                    {live && (
                      <span className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveLine(index, -1)}
                          disabled={index === 0}
                          aria-label="Move up"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveLine(index, 1)}
                          disabled={index === lines.length - 1}
                          aria-label="Move down"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronDown className="size-3.5" />
                        </button>
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
                      </span>
                    )}
                  </Td>
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
                  // Same fix at the foot: the column sums what the lines
                  // actually say, in pounds, so it agrees with Recipe qty
                  // instead of inflating every ounce sixteen-fold.
                  const pounds = usesBatch
                    ? desired ?? 0
                    : lines.reduce(
                        (sum, l) => sum + toPounds(l.quantity, l.uom),
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
              <Td />
              <Td className="text-right text-sm font-bold tabular-nums">
                {total.toFixed(2)}
              </Td>
              <Td className="text-xs">{recipeUom ?? "LB"}</Td>
              <Td className="text-right text-xs tabular-nums">
                {total > 0 ? "100%" : "—"}
              </Td>
              <Td />
              <Td />
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
                className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-card ring-1 ring-foreground/10 px-2.5 text-sm text-muted-foreground hover:bg-muted"
              >
                <Plus className="size-3.5" />
                Add ingredient
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="ml-auto h-8 rounded-sm bg-card ring-1 ring-foreground/10 px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
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
                Locked. Edit recipe is at the top of the page.
              </span>
              <button
                type="button"
                hidden
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

      {footer}
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
        "border-b border-border px-3 py-1.5 text-[0.625rem] font-semibold tracking-wider text-primary uppercase",
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
  return <td className={cn("px-3 py-1 align-middle", className)}>{children}</td>;
}

/**
 * A quantity that reads as 40.00, not 40.
 *
 * Recipe numbers are weights, and a weight written to two places says it was
 * measured. The formatting only applies when the field is at rest - while it
 * has focus the raw text is kept exactly as typed, so "0.4" does not fight
 * the person entering it and become "0" halfway through.
 */
function DecimalInput({
  value,
  readOnly,
  onChange,
  label,
  className,
}: {
  value: number;
  readOnly: boolean;
  onChange: (next: number) => void;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    draft ?? (Number.isFinite(value) ? Number(value).toFixed(2) : "");

  return (
    <input
      type="number"
      min={0}
      step="any"
      value={shown}
      readOnly={readOnly}
      onFocus={() => setDraft(String(value))}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = Number(event.target.value);
        onChange(Number.isFinite(next) ? next : 0);
      }}
      aria-label={label}
      className={className}
    />
  );
}



/** A number in the rail: label on the left, the field on the right. */
function RailNumber({
  label,
  hint,
  value,
  readOnly,
  onChange,
  unit,
}: {
  label: string;
  hint: string;
  value: string;
  readOnly: boolean;
  onChange: (next: string) => void;
  unit: string;
}) {
  // Same two-place treatment as the recipe quantities: formatted at rest,
  // untouched while it has focus.
  const [focused, setFocused] = useState(false);
  const shown =
    focused || value === "" || !Number.isFinite(Number(value))
      ? value
      : Number(value).toFixed(2);

  return (
    <label className="flex items-baseline justify-between gap-2 text-xs">
      <span className="min-w-0">
        <span className="block text-muted-foreground">{label}</span>
        <span className="block text-[0.5625rem] leading-tight text-muted-foreground/70">
          {hint}
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1">
        <input
          type="number"
          min={0}
          step="any"
          value={shown}
          readOnly={readOnly}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value)}
          placeholder="—"
          aria-label={label}
          className={cn(
            "h-6 w-20 rounded-sm px-1 text-right text-xs font-semibold tabular-nums",
            readOnly
              ? "border border-transparent bg-transparent"
              : "border border-primary/50 bg-card focus:ring-1 focus:ring-primary focus:outline-none"
          )}
        />
        <span className="text-[0.625rem] text-muted-foreground uppercase">
          {unit.toLowerCase()}
        </span>
      </span>
    </label>
  );
}
