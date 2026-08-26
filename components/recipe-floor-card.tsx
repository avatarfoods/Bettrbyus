"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FLOOR_LABELS,
  ROLE_ES,
  translateInstruction,
  type FloorLang,
} from "@/lib/recipes/instruction-config";
import {
  ccpCount,
  clockAt,
  crewOf,
  formatClock,
  labourTotals,
  minsOf,
} from "@/lib/recipes/instruction-math";
import {
  formatNumber,
  scaledIngredientQty,
  type CookingRecipe,
  type RecipeStep,
} from "@/lib/recipes/recipe-graph";
import { cn } from "@/lib/utils";

type Props = {
  recipe: CookingRecipe;
  open: boolean;
  lang: FloorLang;
  multFull: number;
  multFinal: number;
  onClose: () => void;
  onLangChange: (lang: FloorLang) => void;
  onMultFullChange: (value: number) => void;
  onMultFinalChange: (value: number) => void;
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

function addDays(iso: string, days: number): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d.toISOString().slice(0, 10));
}

function sheetStepRow(
  step: RecipeStep,
  index: number,
  recipe: CookingRecipe,
  lang: FloorLang
) {
  const L = FLOOR_LABELS[lang];
  const say = translateInstruction(step.text, lang);
  const lim = translateInstruction(step.criticalLimit, lang);
  const fix = translateInstruction(step.correctiveAction, lang);
  const saf = translateInstruction(step.safety, lang);
  const meta: string[] = [];
  if (step.equipment) {
    meta.push(step.equipment + (step.setting ? ` · ${step.setting}` : ""));
  }
  if (step.mode === "batch" && step.temp !== "") {
    meta.push(`${step.temp} ${step.tempUm}`);
  }
  if (step.mode === "batch" && step.capacityMin !== "") {
    meta.push(
      `${step.capacityMin}${
        step.capacityMax && step.capacityMax !== step.capacityMin
          ? `–${step.capacityMax}`
          : ""
      } ${step.capacityUm}`
    );
  }
  if (step.mode === "mix" && step.mixCycles) {
    meta.push(
      `${step.mixFwdSec}s / ${step.mixBackSec}s × ${step.mixCycles} · ${L.speed.toLowerCase()} ${step.mixSpeed}`
    );
  }
  if (step.mode === "line" && step.unitsPerHour) {
    meta.push(`${Number(step.unitsPerHour).toLocaleString("en-US")}/hr`);
  }
  if (step.mode === "prep" && step.setting) meta.push(step.setting);
  const mins = minsOf(step, recipe);
  if (mins) meta.push(`${Math.round(mins)} min`);
  meta.push(
    crewOf(step, recipe)
      .map(
        (c) =>
          `${c.count} ${lang === "es" ? ROLE_ES[c.role] || c.role : c.role}`
      )
      .join(", ")
  );

  const rec: string[] = [];
  if (step.weigh) rec.push(`${L.weigh} _______`);
  if (step.recordTemp) rec.push(`${L.rtemp} _______ ${step.tempUm || "°F"}`);
  if (step.photo) rec.push(`☐ ${L.photo}`);
  if (step.metalDetect) rec.push(`☐ ${L.metal}`);
  if (step.label) rec.push(`☐ ${L.label}`);
  if (step.signOff) rec.push(`${L.sign} _______`);

  return (
    <tr
      key={step.id}
      className={cn(
        "break-inside-avoid border-b border-zinc-300",
        step.ccp && "bg-red-50"
      )}
    >
      <td
        className={cn(
          "w-8 border border-zinc-300 px-1.5 py-1.5 text-center font-mono text-xs font-semibold",
          step.ccp ? "bg-red-700 text-white" : "bg-zinc-100"
        )}
      >
        {index + 1}
      </td>
      <td className="border border-zinc-300 px-2 py-1.5 align-top">
        <div className="text-[11px] font-semibold leading-snug">{say || "—"}</div>
        <div className="mt-0.5 text-[8.5px] text-zinc-600">
          {meta.filter(Boolean).join(" · ")}
        </div>
        {step.ccp && lim ? (
          <div className="mt-1 border-l-[3px] border-red-700 py-0.5 pl-1.5 text-[9px] text-red-900">
            <span className="mr-1 rounded-sm bg-red-700 px-1 font-mono text-[7.5px] tracking-wide text-white">
              CCP
            </span>
            <b className="font-mono text-[8px] tracking-wide">{L.crit}:</b> {lim}
            {fix ? (
              <div className="mt-0.5 text-red-800/80">
                {L.ifnot} {fix}
              </div>
            ) : null}
          </div>
        ) : null}
        {saf ? (
          <div className="mt-1 border-l-[3px] border-amber-400 py-0.5 pl-1.5 text-[9px] text-amber-900">
            <b className="font-mono text-[8px] tracking-wide">{L.safety}:</b> {saf}
          </div>
        ) : null}
      </td>
      <td className="w-36 border border-zinc-300 px-1.5 py-1.5 align-top font-mono text-[8.5px] leading-relaxed text-zinc-700">
        {rec.length ? (
          rec.map((line) => (
            <div key={line}>{line}</div>
          ))
        ) : (
          <span>&nbsp;</span>
        )}
      </td>
      <td className="w-16 border border-zinc-300 bg-[repeating-linear-gradient(90deg,#fff,#fff_3px,#f6f6f6_3px,#f6f6f6_6px)]" />
    </tr>
  );
}

export function RecipeFloorCard({
  recipe,
  open,
  lang,
  multFull,
  multFinal,
  onClose,
  onLangChange,
  onMultFullChange,
  onMultFinalChange,
}: Props) {
  const L = FLOOR_LABELS[lang];
  const S = L.sheet;
  const totals = labourTotals(recipe);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function Field({
    label,
    value,
    blank,
  }: {
    label: string;
    value?: ReactNode;
    blank?: boolean;
  }) {
    return (
      <>
        <div className="bg-zinc-700 px-1.5 py-0.5 text-right text-[8px] font-semibold tracking-wide text-white">
          {label}
        </div>
        <div
          className={cn(
            "flex min-h-[17px] items-center border-b border-zinc-200 px-1.5 py-0.5 text-[10px]",
            blank &&
              "bg-[repeating-linear-gradient(90deg,#fff,#fff_3px,#f4f4f4_3px,#f4f4f4_6px)]"
          )}
        >
          {value}
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 print:static print:bg-transparent print:p-0">
      <div className="flex max-h-[94vh] w-full max-w-[900px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl print:max-h-none print:w-full print:rounded-none print:shadow-none">
        <div className="flex flex-none flex-wrap items-center gap-2 bg-zinc-900 px-3 py-2.5 text-white print:hidden">
          <b className="text-sm">{recipe.name}</b>
          <span className="font-mono text-[10.5px] text-zinc-400">
            {recipe.code}
          </span>
          <label className="ml-2 inline-flex items-center gap-1 text-[10.5px] text-zinc-300">
            ×
            <input
              type="number"
              step="0.1"
              min="0"
              value={multFull}
              onChange={(e) => onMultFullChange(Number(e.target.value) || 0)}
              className="w-12 rounded border-0 bg-white/15 px-1 py-0.5 text-right font-mono text-[11px] text-white"
            />
            {S.fb.toLowerCase()}
          </label>
          <label className="inline-flex items-center gap-1 text-[10.5px] text-zinc-300">
            ×
            <input
              type="number"
              step="0.1"
              min="0"
              value={multFinal}
              onChange={(e) => onMultFinalChange(Number(e.target.value) || 0)}
              className="w-12 rounded border-0 bg-white/15 px-1 py-0.5 text-right font-mono text-[11px] text-white"
            />
            {S.finb.toLowerCase()}
          </label>
          <div className="ml-auto flex rounded-lg bg-white/15 p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1 text-[11.5px] font-semibold",
                lang === "en" ? "bg-white text-zinc-900" : "text-zinc-300"
              )}
              onClick={() => onLangChange("en")}
            >
              English
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1 text-[11.5px] font-semibold",
                lang === "es" ? "bg-white text-zinc-900" : "text-zinc-300"
              )}
              onClick={() => onLangChange("es")}
            >
              Español
            </button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="bg-white/15 text-white hover:bg-white/25"
            onClick={() => window.print()}
          >
            Print
          </Button>
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-zinc-200 p-4 print:overflow-visible print:bg-white print:p-0">
          <div className="mx-auto w-[8.5in] max-w-full bg-white p-[0.34in] text-[10px] leading-snug text-zinc-900 shadow-lg print:w-full print:p-0 print:shadow-none">
            <div className="mb-2 flex items-baseline gap-2 border-b-2 border-zinc-900 pb-1">
              <span className="text-sm font-bold tracking-tight">
                AVATAR FOODS
              </span>
              <span className="text-[8.5px] tracking-wider text-zinc-500 uppercase">
                PRODUCTION · HENDERSON NV
              </span>
              <span className="ml-auto rounded-sm bg-zinc-900 px-2 py-0.5 font-mono text-[10px] tracking-widest text-white">
                {S.title}
              </span>
            </div>

            <div className="mb-2 grid grid-cols-3 border border-zinc-900">
              <div className="grid grid-cols-[auto_1fr] border-r border-zinc-900">
                <Field label={S.rn} value={<b>{recipe.name}</b>} />
                <Field label={S.al} value={recipe.allergen} />
                <Field label={S.dp} value={recipe.department} />
                <Field label={S.wip} value={recipe.code} />
              </div>
              <div className="grid grid-cols-[auto_1fr] border-r border-zinc-900">
                <Field label={S.pd} value={formatDate(recipe.productionDate)} />
                <Field
                  label={S.ex}
                  value={addDays(recipe.productionDate, recipe.shelfLifeDays)}
                />
                <Field label={S.lot} value={<b>{recipe.lotNumber || "—"}</b>} />
                <Field label={S.tp} blank />
              </div>
              <div className="grid grid-cols-[auto_1fr]">
                <Field
                  label={S.ot}
                  value={
                    recipe.orderTotal != null
                      ? `${formatNumber(recipe.orderTotal)} ${recipe.uom}`
                      : "—"
                  }
                />
                <Field label={S.pg} value={recipe.page || "—"} />
                <Field label={S.us} value={recipe.usda ? "YES" : "NO"} />
                <Field label={S.pb} blank />
              </div>
            </div>

            <table className="mb-2 w-full border-collapse">
              <thead>
                <tr className="bg-zinc-700 text-white">
                  <th className="w-[1.05in] border border-zinc-800 px-1.5 py-0.5 text-left text-[8px] font-semibold tracking-wide">
                    {S.lotn}
                  </th>
                  <th className="border border-zinc-800 px-1.5 py-0.5 text-left text-[8px] font-semibold tracking-wide">
                    {S.ingr}
                  </th>
                  <th
                    colSpan={2}
                    className="border border-zinc-800 px-1.5 py-0.5 text-center text-[8px] font-semibold tracking-wide"
                  >
                    {multFull.toFixed(2)} × {S.fb}
                  </th>
                  <th
                    colSpan={2}
                    className="border border-zinc-800 px-1.5 py-0.5 text-center text-[8px] font-semibold tracking-wide"
                  >
                    {multFinal.toFixed(2)} × {S.finb}
                  </th>
                </tr>
              </thead>
              <tbody>
                {recipe.ingredients.map((ing) => {
                  const qty = scaledIngredientQty(recipe, ing);
                  return (
                    <tr key={ing.id}>
                      <td className="border border-zinc-300 bg-zinc-50 px-1.5 py-0.5" />
                      <td className="border border-zinc-300 px-1.5 py-0.5 font-semibold">
                        {ing.name}
                      </td>
                      <td className="w-[0.72in] border border-zinc-300 px-1.5 py-0.5 text-right font-mono">
                        {(qty * multFull).toFixed(2)}
                      </td>
                      <td className="w-[0.42in] border border-zinc-300 px-1 py-0.5 text-[9px] text-zinc-600">
                        {ing.uom}
                      </td>
                      <td className="w-[0.72in] border border-zinc-300 px-1.5 py-0.5 text-right font-mono">
                        {(qty * multFinal).toFixed(2)}
                      </td>
                      <td className="w-[0.42in] border border-zinc-300 px-1 py-0.5 text-[9px] text-zinc-600">
                        {ing.uom}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {lang === "es" ? (
              <div className="mb-1.5 border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] text-sky-900">
                Traducido automáticamente del inglés.
              </div>
            ) : null}

            <table className="mb-2 w-full border-collapse">
              <thead>
                <tr className="bg-zinc-700 text-white">
                  <th className="w-8 border border-zinc-800 px-1 py-0.5 text-left text-[8px] font-semibold">
                    #
                  </th>
                  <th className="border border-zinc-800 px-1.5 py-0.5 text-left text-[8px] font-semibold tracking-wide">
                    {S.ins}
                  </th>
                  <th className="w-[1.55in] border border-zinc-800 px-1.5 py-0.5 text-left text-[8px] font-semibold tracking-wide">
                    {S.rec}
                  </th>
                  <th className="w-[0.62in] border border-zinc-800 px-1 py-0.5 text-center text-[8px] font-semibold tracking-wide">
                    {S.ini}
                  </th>
                </tr>
              </thead>
              <tbody>
                {recipe.steps.map((step, index) =>
                  sheetStepRow(step, index, recipe, lang)
                )}
              </tbody>
            </table>

            {recipe.generalRules ? (
              <div className="mb-2 border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-[9px]">
                <b className="font-mono text-[8px] tracking-wide">
                  {L.whole}:
                </b>{" "}
                {translateInstruction(recipe.generalRules, lang)}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-4 gap-3.5">
              {[S.prep, S.st, S.qa, S.sup].map((label) => (
                <div
                  key={label}
                  className="border-t border-zinc-900 pt-1 text-[8px] tracking-wide text-zinc-500 uppercase"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-2.5 border-t border-zinc-200 pt-1 font-mono text-[7.5px] tracking-wide text-zinc-500">
              {recipe.code} · {recipe.name} · {S.pg} {recipe.page || "—"} ·{" "}
              {S.run} {formatClock(totals.hi)} · {recipe.steps.length}{" "}
              {lang === "es" ? "pasos" : "steps"} · {ccpCount(recipe)} CCP
              {recipe.steps.length
                ? ` · ${L.start} ${formatClock(clockAt(recipe, 0))}`
                : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
