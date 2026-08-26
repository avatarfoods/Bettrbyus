"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { RecipeFloorCard } from "@/components/recipe-floor-card";
import { Button } from "@/components/ui/button";
import {
  CREW_ROLES,
  DURATION_UNITS,
  EQUIPMENT_BY_MODE,
  MODE_COLORS,
  QTY_UNITS,
  STAGE_TYPES,
  STEP_MODES,
  TEMP_UNITS,
  WEIGHT_UNITS,
  tipParts,
  type FloorLang,
  type StepMode,
} from "@/lib/recipes/instruction-config";
import {
  allIssueCount,
  ccpCount,
  clockAt,
  crewOf,
  formatClock,
  headcount,
  labourTotals,
  minsOf,
  mixCycleMinutes,
  stepIssues,
} from "@/lib/recipes/instruction-math";
import {
  createBlankStep,
  formatNumber,
  newId,
  type CookingRecipe,
  type RecipeCrewMember,
  type RecipeStep,
} from "@/lib/recipes/recipe-graph";
import { cn } from "@/lib/utils";

type Props = {
  recipe: CookingRecipe;
  onChange: (patch: Partial<CookingRecipe>) => void;
};

type TabId = "build" | "cost";

function TipLabel({ tipKey, children }: { tipKey: string; children: ReactNode }) {
  const { title, body } = tipParts(tipKey);
  return (
    <span className="inline-flex items-center gap-1" title={`${title}: ${body}`}>
      {children}
      <span className="inline-grid size-[11px] place-items-center rounded-full border border-zinc-300 text-[8px] font-bold leading-none text-zinc-400">
        ?
      </span>
    </span>
  );
}

function FieldChip({
  tipKey,
  label,
  hot,
  calc,
  children,
}: {
  tipKey: string;
  label: string;
  hot?: boolean;
  calc?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border bg-white px-1.5 py-0.5",
        hot && "border-amber-300 bg-amber-50",
        calc && "border-zinc-200 bg-zinc-50"
      )}
    >
      <span
        className={cn(
          "text-[9px] font-semibold tracking-wide text-zinc-400 uppercase",
          hot && "text-amber-800"
        )}
      >
        <TipLabel tipKey={tipKey}>{label}</TipLabel>
      </span>
      {children}
    </span>
  );
}

function numInputClass(sm?: boolean) {
  return cn(
    "border-0 border-b border-dotted border-zinc-300 bg-transparent text-right font-mono text-xs tabular-nums outline-none focus:border-sky-500",
    sm ? "w-9" : "w-14"
  );
}

function CrewEditor({
  crew,
  onChange,
}: {
  crew: RecipeCrewMember[];
  onChange: (crew: RecipeCrewMember[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {crew.map((member, index) => (
        <span
          key={`${member.role}-${index}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border bg-white py-0.5 pr-1 pl-2 text-[11.5px]",
            member.role === "Supervisor" && "border-sky-300"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full bg-zinc-300",
              member.role === "Supervisor" && "bg-sky-600"
            )}
          />
          <span className="inline-flex overflow-hidden rounded border">
            <button
              type="button"
              className="h-[19px] w-[18px] text-xs hover:bg-sky-50"
              onClick={() =>
                onChange(
                  crew.map((c, i) =>
                    i === index
                      ? { ...c, count: Math.max(0, (Number(c.count) || 0) - 1) }
                      : c
                  )
                )
              }
            >
              −
            </button>
            <input
              type="number"
              value={member.count}
              onChange={(e) =>
                onChange(
                  crew.map((c, i) =>
                    i === index ? { ...c, count: Number(e.target.value) || 0 } : c
                  )
                )
              }
              className="h-[19px] w-6 border-x text-center font-mono text-[11.5px]"
            />
            <button
              type="button"
              className="h-[19px] w-[18px] text-xs hover:bg-sky-50"
              onClick={() =>
                onChange(
                  crew.map((c, i) =>
                    i === index
                      ? { ...c, count: (Number(c.count) || 0) + 1 }
                      : c
                  )
                )
              }
            >
              +
            </button>
          </span>
          <select
            value={member.role}
            onChange={(e) =>
              onChange(
                crew.map((c, i) =>
                  i === index ? { ...c, role: e.target.value } : c
                )
              )
            }
            className="max-w-[130px] border-0 bg-transparent text-[11.5px]"
          >
            {CREW_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="px-1 text-[11px] text-zinc-300 hover:text-red-600"
            onClick={() => onChange(crew.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </span>
      ))}
      <button
        type="button"
        className="rounded-full border border-dashed border-sky-300 px-2.5 py-0.5 text-[11px] text-sky-800 hover:border-solid hover:bg-white"
        onClick={() => {
          const next =
            CREW_ROLES.find((role) => !crew.some((c) => c.role === role)) ??
            CREW_ROLES[0];
          onChange([...crew, { role: next, count: 1 }]);
        }}
      >
        + role
      </button>
    </div>
  );
}

function ToggleChip({
  tipKey,
  pressed,
  danger,
  crew,
  onClick,
  children,
}: {
  tipKey: string;
  pressed: boolean;
  danger?: boolean;
  crew?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { title, body } = tipParts(tipKey);
  return (
    <button
      type="button"
      title={`${title}: ${body}`}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-white px-2.5 py-0.5 text-[11px] text-zinc-600 hover:border-sky-500 hover:text-sky-800",
        pressed && !danger && !crew && "border-sky-300 bg-sky-50 font-medium text-sky-950",
        pressed && danger && "border-red-300 bg-red-50 font-medium text-red-700",
        pressed && crew && "border-zinc-800 bg-zinc-800 font-medium text-white"
      )}
    >
      <span
        className={cn(
          "inline-grid size-[11px] place-items-center rounded-[3px] border-[1.5px] border-zinc-300 text-[8px] text-white",
          pressed && !danger && !crew && "border-sky-600 bg-sky-600",
          pressed && danger && "border-red-600 bg-red-600",
          pressed && crew && "border-white bg-white text-zinc-800"
        )}
      >
        {pressed ? "✓" : ""}
      </span>
      {children}
    </button>
  );
}

function StepSummary({ step, recipe }: { step: RecipeStep; recipe: CookingRecipe }) {
  const parts: ReactNode[] = [];
  if (step.equipment) parts.push(step.equipment);
  if (step.mode === "batch") {
    if (step.temp !== "")
      parts.push(
        <b key="t" className="font-mono font-medium text-zinc-700">
          {step.temp} {step.tempUm}
        </b>
      );
    if (step.capacityMin !== "")
      parts.push(
        <b key="c" className="font-mono font-medium text-zinc-700">
          {Number(step.capacityMin).toLocaleString("en-US")}
          {step.capacityMax && step.capacityMax !== step.capacityMin
            ? `–${Number(step.capacityMax).toLocaleString("en-US")}`
            : ""}{" "}
          {step.capacityUm}
        </b>
      );
  }
  if (step.mode === "mix") {
    const mix = mixCycleMinutes(step);
    if (mix)
      parts.push(
        <b key="m" className="font-mono font-medium text-zinc-700">
          {mix.toFixed(1)} min mixing
        </b>
      );
    if (step.mixSpeed) parts.push(`speed ${step.mixSpeed}`);
  }
  if (step.mode === "line" && step.unitsPerHour) {
    parts.push(
      <b key="u" className="font-mono font-medium text-zinc-700">
        {Number(step.unitsPerHour).toLocaleString("en-US")}/hr
      </b>
    );
  }
  if (step.mode === "prep") {
    if (step.setting) parts.push(step.setting);
    if (step.lbPerHour)
      parts.push(
        <b key="l" className="font-mono font-medium text-zinc-700">
          {Number(step.lbPerHour).toLocaleString("en-US")} LB/hr
        </b>
      );
  }
  const mins = minsOf(step, recipe);
  if (mins)
    parts.push(
      <b key="min" className="font-mono font-medium text-zinc-700">
        {Math.round(mins)} min
      </b>
    );
  parts.push(`${headcount(crewOf(step, recipe))} crew`);
  const checks = (
    [
      ["weigh", "Weigh"],
      ["recordTemp", "Temp"],
      ["photo", "Photo"],
      ["signOff", "Sign-off"],
      ["metalDetect", "Metal"],
      ["label", "Label"],
    ] as const
  ).filter(([k]) => step[k]);
  if (checks.length) parts.push(checks.map(([, l]) => l).join(", "));
  const issues = stepIssues(step, recipe).length;

  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-zinc-400">
      <span
        className="rounded-full border px-1.5 font-mono text-[9px] tracking-wide"
        style={{ color: MODE_COLORS[step.mode], borderColor: "currentColor" }}
      >
        {step.type}
      </span>
      {step.ccp ? (
        <>
          <span className="font-semibold text-red-600">◆ CCP</span>
          <span className="text-zinc-300">·</span>
        </>
      ) : null}
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 ? <span className="text-zinc-300">·</span> : null}
          {part}
        </span>
      ))}
      {issues ? (
        <>
          <span className="text-zinc-300">·</span>
          <span className="font-semibold text-amber-600">{issues} to fix</span>
        </>
      ) : null}
    </span>
  );
}

export function RecipeInstructions({ recipe, onChange }: Props) {
  const [tab, setTab] = useState<TabId>("build");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openCrewId, setOpenCrewId] = useState<string | null>(null);
  const [floorOpen, setFloorOpen] = useState(false);
  const [lang, setLang] = useState<FloorLang>("en");
  const [multFull, setMultFull] = useState(1);
  const [multFinal, setMultFinal] = useState(0.1);
  const [dragId, setDragId] = useState<string | null>(null);

  const totals = labourTotals(recipe);
  const issues = allIssueCount(recipe);
  const ccps = ccpCount(recipe);

  function patchStep(stepId: string, patch: Partial<RecipeStep>) {
    onChange({
      steps: recipe.steps.map((step) =>
        step.id === stepId ? { ...step, ...patch } : step
      ),
    });
  }

  function addStep() {
    const next = createBlankStep(recipe.recipeType === "per_unit" ? "line" : "batch");
    onChange({ steps: [...recipe.steps, next] });
    setOpenId(next.id);
  }

  function duplicateStep(stepId: string) {
    const index = recipe.steps.findIndex((s) => s.id === stepId);
    if (index < 0) return;
    const source = recipe.steps[index];
    const copy: RecipeStep = {
      ...source,
      id: newId("step"),
      crew: source.crew.map((c) => ({ ...c })),
      media: [...source.media],
    };
    const steps = [...recipe.steps];
    steps.splice(index + 1, 0, copy);
    onChange({ steps });
  }

  function removeStep(stepId: string) {
    if (!confirm("Delete this step?")) return;
    onChange({ steps: recipe.steps.filter((s) => s.id !== stepId) });
    if (openId === stepId) setOpenId(null);
  }

  function reorder(fromId: string, toId: string) {
    const from = recipe.steps.findIndex((s) => s.id === fromId);
    const to = recipe.steps.findIndex((s) => s.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const steps = [...recipe.steps];
    const [item] = steps.splice(from, 1);
    steps.splice(to, 0, item);
    onChange({ steps });
  }

  function modeFields(step: RecipeStep) {
    if (step.mode === "batch") {
      return (
        <>
          <FieldChip tipKey="cap" label="Batch size">
            <input
              className={numInputClass()}
              type="number"
              value={step.capacityMin}
              onChange={(e) => patchStep(step.id, { capacityMin: e.target.value })}
              placeholder="—"
            />
            <span className="text-[10px] text-zinc-300">→</span>
            <input
              className={numInputClass()}
              type="number"
              value={step.capacityMax}
              onChange={(e) => patchStep(step.id, { capacityMax: e.target.value })}
              placeholder="—"
            />
            <select
              className="rounded bg-sky-50 px-1 font-mono text-[9.5px] text-sky-800"
              value={step.capacityUm}
              onChange={(e) => patchStep(step.id, { capacityUm: e.target.value })}
            >
              {QTY_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </FieldChip>
          <FieldChip tipKey="temp" label="Temp" hot>
            <input
              className={cn(numInputClass(), "font-medium text-amber-700")}
              type="number"
              value={step.temp}
              onChange={(e) => patchStep(step.id, { temp: e.target.value })}
              placeholder="—"
            />
            <select
              className="rounded bg-amber-100 px-1 font-mono text-[9.5px] text-amber-800"
              value={step.tempUm}
              onChange={(e) => patchStep(step.id, { tempUm: e.target.value })}
            >
              {TEMP_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </FieldChip>
          <FieldChip tipKey="time" label="Time">
            <input
              className={numInputClass(true)}
              type="number"
              value={step.durationMin}
              onChange={(e) => patchStep(step.id, { durationMin: e.target.value })}
              placeholder="—"
            />
            <span className="text-[10px] text-zinc-300">→</span>
            <input
              className={numInputClass(true)}
              type="number"
              value={step.durationMax}
              onChange={(e) => patchStep(step.id, { durationMax: e.target.value })}
              placeholder="—"
            />
            <select
              className="rounded bg-sky-50 px-1 font-mono text-[9.5px] text-sky-800"
              value={step.durationUm}
              onChange={(e) => patchStep(step.id, { durationUm: e.target.value })}
            >
              {DURATION_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </FieldChip>
        </>
      );
    }

    if (step.mode === "mix") {
      const mix = mixCycleMinutes(step);
      return (
        <>
          <FieldChip tipKey="cw" label="Fwd">
            <input
              className={numInputClass(true)}
              type="number"
              value={step.mixFwdSec}
              onChange={(e) => patchStep(step.id, { mixFwdSec: e.target.value })}
            />
            <span className="font-mono text-[9px] text-zinc-400">s</span>
          </FieldChip>
          <FieldChip tipKey="ccw" label="Back">
            <input
              className={numInputClass(true)}
              type="number"
              value={step.mixBackSec}
              onChange={(e) => patchStep(step.id, { mixBackSec: e.target.value })}
            />
            <span className="font-mono text-[9px] text-zinc-400">s</span>
          </FieldChip>
          <FieldChip tipKey="cyc" label="Cycles">
            <input
              className={numInputClass(true)}
              type="number"
              value={step.mixCycles}
              onChange={(e) => patchStep(step.id, { mixCycles: e.target.value })}
            />
          </FieldChip>
          <FieldChip tipKey="mspd" label="Speed">
            <input
              className={numInputClass(true)}
              type="number"
              value={step.mixSpeed}
              onChange={(e) => patchStep(step.id, { mixSpeed: e.target.value })}
            />
          </FieldChip>
          <FieldChip tipKey="mixt" label="Mixing" calc>
            <span className="font-mono text-xs text-zinc-600">
              {mix ? `${mix.toFixed(1)} min` : "—"}
            </span>
          </FieldChip>
          <FieldChip tipKey="time" label="Total">
            <input
              className={numInputClass(true)}
              type="number"
              value={step.durationMin}
              onChange={(e) => patchStep(step.id, { durationMin: e.target.value })}
            />
            <span className="text-[10px] text-zinc-300">→</span>
            <input
              className={numInputClass(true)}
              type="number"
              value={step.durationMax}
              onChange={(e) => patchStep(step.id, { durationMax: e.target.value })}
            />
            <select
              className="rounded bg-sky-50 px-1 font-mono text-[9.5px] text-sky-800"
              value={step.durationUm}
              onChange={(e) => patchStep(step.id, { durationUm: e.target.value })}
            >
              {DURATION_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </FieldChip>
        </>
      );
    }

    if (step.mode === "line") {
      const takt = step.unitsPerHour
        ? `${(3600 / Number(step.unitsPerHour)).toFixed(1)}s`
        : "—";
      const run = minsOf(step, recipe);
      return (
        <>
          <FieldChip tipKey="uph" label="Units per hour">
            <input
              className={numInputClass()}
              type="number"
              value={step.unitsPerHour}
              onChange={(e) => patchStep(step.id, { unitsPerHour: e.target.value })}
            />
          </FieldChip>
          <FieldChip tipKey="takt" label="Each" calc>
            <span className="font-mono text-xs text-zinc-600">{takt}</span>
          </FieldChip>
          <FieldChip tipKey="unitw" label="Weight per unit">
            <input
              className={numInputClass(true)}
              type="number"
              value={step.capacityMin}
              onChange={(e) => patchStep(step.id, { capacityMin: e.target.value })}
            />
            <span className="text-[10px] text-zinc-300">→</span>
            <input
              className={numInputClass(true)}
              type="number"
              value={step.capacityMax}
              onChange={(e) => patchStep(step.id, { capacityMax: e.target.value })}
            />
            <select
              className="rounded bg-sky-50 px-1 font-mono text-[9.5px] text-sky-800"
              value={step.capacityUm}
              onChange={(e) => patchStep(step.id, { capacityUm: e.target.value })}
            >
              {WEIGHT_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </FieldChip>
          <FieldChip tipKey="run" label="Run" calc>
            <span className="font-mono text-xs text-zinc-600">
              {run ? formatClock(run) : "—"}
            </span>
          </FieldChip>
        </>
      );
    }

    const run = minsOf(step, recipe);
    return (
      <>
        <FieldChip tipKey="cut" label="Cut">
          <input
            className="min-w-24 border-0 border-b border-dotted border-zinc-300 bg-transparent text-xs outline-none focus:border-sky-500"
            value={step.setting}
            onChange={(e) =>
              patchStep(step.id, { setting: e.target.value, showSetting: true })
            }
            placeholder='DICE 1/4"'
          />
        </FieldChip>
        <FieldChip tipKey="lbhr" label="LB per hour">
          <input
            className={numInputClass()}
            type="number"
            value={step.lbPerHour}
            onChange={(e) => patchStep(step.id, { lbPerHour: e.target.value })}
          />
        </FieldChip>
        <FieldChip tipKey="run" label="Run" calc>
          <span className="font-mono text-xs text-zinc-600">
            {run ? formatClock(run) : "—"}
          </span>
        </FieldChip>
      </>
    );
  }

  const maxShare = Math.max(
    ...recipe.steps.map(
      (s) => minsOf(s, recipe) * headcount(crewOf(s, recipe))
    ),
    1
  );

  return (
    <section className="mb-10">
      <div className="mb-3 overflow-hidden rounded-xl border bg-zinc-900 text-white">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              Instructions
              <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10.5px]">
                {recipe.code || "—"}
              </span>
            </h2>
            <p className="mt-0.5 text-sm text-zinc-300">
              {recipe.department}
              {recipe.page ? ` · page ${recipe.page}` : ""}
              {recipe.batchSize != null
                ? ` · batch ${formatNumber(recipe.batchSize)}${
                    recipe.batchYield != null
                      ? ` → ${formatNumber(recipe.batchYield)}`
                      : ""
                  } ${recipe.uom}`
                : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10.5px]">
                {recipe.steps.length} steps
              </span>
              <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10.5px]">
                {formatClock(totals.hi)}
              </span>
              {ccps ? (
                <span className="rounded bg-red-700/70 px-1.5 py-0.5 font-mono text-[10.5px] text-red-100">
                  {ccps} CCP
                </span>
              ) : null}
              {issues ? (
                <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10.5px]">
                  {issues} to fix
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-700/60 px-1.5 py-0.5 font-mono text-[10.5px] text-emerald-100">
                  <Check className="size-3" /> All set
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-white text-zinc-900 hover:bg-zinc-100"
              onClick={() => setFloorOpen(true)}
            >
              <Printer className="size-4" />
              Floor card
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-0 bg-white/15 text-white hover:bg-white/25"
              onClick={() => {
                setFloorOpen(true);
                setTimeout(() => window.print(), 100);
              }}
            >
              Print
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex border-b px-1.5">
          {(
            [
              ["build", "Instructions", recipe.steps.length],
              ["cost", "Cost & labour", null],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "border-b-2 px-3.5 py-2.5 text-sm font-medium text-zinc-500",
                tab === id
                  ? "border-sky-600 text-sky-800"
                  : "border-transparent hover:bg-sky-50"
              )}
            >
              {label}
              {count != null ? (
                <span className="ml-1.5 font-mono text-[10.5px] text-zinc-400">
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="p-3">
          {tab === "cost" ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border p-3">
                  <small className="text-[10px] tracking-wide text-zinc-400 uppercase">
                    Run time
                  </small>
                  <b className="mt-1 block font-mono text-xl">{formatClock(totals.hi)}</b>
                  <span className="text-xs text-zinc-400">
                    {totals.lo !== totals.hi
                      ? `from ${formatClock(totals.lo)}`
                      : "end to end"}
                  </span>
                </div>
                <div className="rounded-xl border p-3">
                  <small className="text-[10px] tracking-wide text-zinc-400 uppercase">
                    Labour
                  </small>
                  <b className="mt-1 block font-mono text-xl">
                    {totals.hours.toFixed(1)} h
                  </b>
                  <span className="text-xs text-zinc-400">
                    {Math.round(totals.personMinutes)} person-minutes
                  </span>
                </div>
                <div className="rounded-xl border border-zinc-900 bg-zinc-900 p-3 text-white">
                  <small className="text-[10px] tracking-wide text-zinc-400 uppercase">
                    Cost per batch
                  </small>
                  <b className="mt-1 block font-mono text-xl">
                    ${totals.cost.toFixed(2)}
                  </b>
                  <span className="text-xs text-zinc-400">rates come from HR</span>
                </div>
                <div className="rounded-xl border border-zinc-900 bg-zinc-900 p-3 text-white">
                  <small className="text-[10px] tracking-wide text-zinc-400 uppercase">
                    Per {recipe.uom}
                  </small>
                  <b className="mt-1 block font-mono text-xl">
                    ${totals.perOutputUnit.toFixed(4)}
                  </b>
                  <span className="text-xs text-zinc-400">
                    on {formatNumber(recipe.batchYield ?? recipe.batchSize ?? 0)}{" "}
                    {recipe.uom}
                  </span>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-[9.5px] tracking-wide text-zinc-400 uppercase">
                      <th className="px-2.5 py-2">#</th>
                      <th className="px-2.5 py-2">Step</th>
                      <th className="px-2.5 py-2">Crew</th>
                      <th className="px-2.5 py-2 text-right">Time</th>
                      <th className="px-2.5 py-2 text-right">Person-min</th>
                      <th className="px-2.5 py-2 text-right">Cost</th>
                      <th className="w-[90px] px-2.5 py-2">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipe.steps.map((step, index) => {
                      const m = minsOf(step, recipe);
                      const pm = m * headcount(crewOf(step, recipe));
                      return (
                        <tr key={step.id} className="border-b border-zinc-100">
                          <td className="px-2.5 py-1.5 font-mono text-xs text-zinc-400">
                            {index + 1}
                          </td>
                          <td className="px-2.5 py-1.5">
                            {step.ccp ? (
                              <span className="mr-1 rounded bg-red-50 px-1 text-[10px] font-medium text-red-700">
                                CCP
                              </span>
                            ) : null}
                            {step.text.slice(0, 48) || "(no instruction)"}
                            {step.text.length > 48 ? "…" : ""}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <div className="flex flex-wrap gap-1">
                              {crewOf(step, recipe).map((c, i) => (
                                <span
                                  key={i}
                                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px]"
                                >
                                  {c.count} {c.role}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[11.5px]">
                            {m ? `${Math.round(m)}m` : "—"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[11.5px]">
                            {pm ? Math.round(pm) : "—"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[11.5px]">
                            ${((pm / 60) * 20).toFixed(2)}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <div
                              className="h-1.5 min-w-[2px] rounded-sm"
                              style={{
                                width: `${Math.max(2, (pm / maxShare) * 100)}%`,
                                background: step.ccp
                                  ? "var(--destructive)"
                                  : MODE_COLORS[step.mode],
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-zinc-900 text-white">
                      <td className="px-2.5 py-2" />
                      <td className="px-2.5 py-2 font-semibold">Batch total</td>
                      <td className="px-2.5 py-2">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(totals.byRole).map(([role, pm]) => (
                            <span
                              key={role}
                              className="rounded bg-white/15 px-1.5 py-0.5 text-[10.5px]"
                            >
                              {role} {(pm / 60).toFixed(1)}h
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        {formatClock(totals.hi)}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        {Math.round(totals.personMinutes)}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        ${totals.cost.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-zinc-500">
                <b>How this is worked out.</b> Each step&apos;s time × its crew =
                person-minutes. Steps without their own crew use the recipe crew.
                Flat placeholder rate until HR rates land.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-1.5"
                title={tipParts("rcrew").title + ": " + tipParts("rcrew").body}
              >
                <span className="inline-flex items-center text-[10px] font-semibold tracking-wide text-sky-900 uppercase">
                  Crew on this recipe
                  <span className="ml-1 inline-grid size-[11px] place-items-center rounded-full border border-sky-300 text-[8px] font-bold text-sky-600">
                    ?
                  </span>
                </span>
                <CrewEditor
                  crew={recipe.crew}
                  onChange={(crew) => onChange({ crew })}
                />
                <span className="ml-auto font-mono text-[11.5px] text-sky-900">
                  {headcount(recipe.crew)} people · {formatClock(totals.hi)} run
                </span>
              </div>

              <div className="space-y-1.5">
                {recipe.steps.length === 0 ? (
                  <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    No instructions yet. Add cooking / prep steps for this recipe.
                  </p>
                ) : (
                  recipe.steps.map((step, index) => {
                    const open = openId === step.id;
                    const color = MODE_COLORS[step.mode];
                    return (
                      <div
                        key={step.id}
                        className={cn(
                          "rounded-lg border bg-white",
                          open && "border-sky-300 shadow-sm",
                          dragId === step.id && "opacity-40"
                        )}
                        style={{ borderLeftWidth: 3, borderLeftColor: step.ccp ? "#b42318" : color }}
                        onDragOver={(e) => {
                          if (!dragId || dragId === step.id) return;
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragId) reorder(dragId, step.id);
                          setDragId(null);
                        }}
                      >
                        <div
                          className="flex cursor-pointer items-start gap-2 px-2.5 py-2 hover:bg-zinc-50/80"
                          onClick={() =>
                            setOpenId(open ? null : step.id)
                          }
                        >
                          <span
                            className="mt-0.5 cursor-grab text-zinc-300"
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDragId(step.id);
                            }}
                            onDragEnd={() => setDragId(null)}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to reorder"
                          >
                            <GripVertical className="size-3.5" />
                          </span>
                          <span
                            className="inline-grid size-[21px] shrink-0 place-items-center rounded-md font-mono text-[11px] text-white"
                            style={{ background: step.ccp ? "#b42318" : color }}
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div
                              className={cn(
                                "text-[13px] leading-snug font-medium",
                                !step.text.trim() && "italic text-zinc-400"
                              )}
                            >
                              {step.text.trim() || "Write what happens here…"}
                            </div>
                            <StepSummary step={step} recipe={recipe} />
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-400">
                              {formatClock(clockAt(recipe, index))}
                            </span>
                            {open ? (
                              <ChevronUp className="size-3.5 text-zinc-400" />
                            ) : (
                              <ChevronDown className="size-3.5 text-zinc-400" />
                            )}
                          </div>
                        </div>

                        {open ? (
                          <div
                            className="space-y-2 border-t bg-zinc-50/50 px-2.5 py-2.5 pl-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <textarea
                              value={step.text}
                              rows={2}
                              placeholder="What does the operator do here?"
                              onChange={(e) =>
                                patchStep(step.id, { text: e.target.value })
                              }
                              className="w-full resize-y rounded-md border bg-white px-2 py-1.5 text-[13px] leading-snug outline-none focus:border-sky-500"
                            />

                            <div className="flex flex-wrap gap-1">
                              <FieldChip
                                tipKey={
                                  step.mode === "mix"
                                    ? "eqM"
                                    : step.mode === "line"
                                      ? "eqL"
                                      : step.mode === "prep"
                                        ? "eqP"
                                        : "eqB"
                                }
                                label={
                                  step.mode === "mix"
                                    ? "Mixer"
                                    : step.mode === "line"
                                      ? "Station"
                                      : step.mode === "prep"
                                        ? "Machine"
                                        : "Equipment"
                                }
                              >
                                <select
                                  value={step.equipment}
                                  onChange={(e) =>
                                    patchStep(step.id, { equipment: e.target.value })
                                  }
                                  className="max-w-[172px] border-0 bg-transparent text-xs"
                                >
                                  <option value="">—</option>
                                  {EQUIPMENT_BY_MODE[step.mode].map((eq) => (
                                    <option key={eq}>{eq}</option>
                                  ))}
                                </select>
                              </FieldChip>
                              {step.mode !== "prep" &&
                              (step.showSetting || step.setting) ? (
                                <FieldChip tipKey="set" label="Setting">
                                  <input
                                    className="min-w-[82px] border-0 border-b border-dotted border-zinc-300 bg-transparent text-xs outline-none focus:border-sky-500"
                                    value={step.setting}
                                    onChange={(e) =>
                                      patchStep(step.id, {
                                        setting: e.target.value,
                                        showSetting: true,
                                      })
                                    }
                                    placeholder="speed / program"
                                  />
                                </FieldChip>
                              ) : null}
                              {modeFields(step)}
                            </div>

                            <div className="flex flex-wrap items-center gap-1">
                              <span className="mr-1 text-[9px] font-semibold tracking-wide text-zinc-400 uppercase">
                                Operator must
                              </span>
                              {(
                                [
                                  ["weigh", "Weigh", "weigh"],
                                  ["recordTemp", "Temperature", "rtemp"],
                                  ["photo", "Photo", "photo"],
                                  ["signOff", "Sign-off", "sign"],
                                  ...(step.mode === "line"
                                    ? ([
                                        ["metalDetect", "Metal detector", "metal"],
                                        ["label", "Label", "label"],
                                      ] as const)
                                    : []),
                                ] as const
                              ).map(([key, label, tip]) => (
                                <ToggleChip
                                  key={key}
                                  tipKey={tip}
                                  pressed={Boolean(step[key])}
                                  onClick={() =>
                                    patchStep(step.id, { [key]: !step[key] })
                                  }
                                >
                                  {label}
                                </ToggleChip>
                              ))}
                              <ToggleChip
                                tipKey="ccp"
                                pressed={step.ccp}
                                danger
                                onClick={() =>
                                  patchStep(step.id, { ccp: !step.ccp })
                                }
                              >
                                CCP
                              </ToggleChip>
                              <ToggleChip
                                tipKey="crew"
                                pressed={openCrewId === step.id}
                                crew
                                onClick={() =>
                                  setOpenCrewId(
                                    openCrewId === step.id ? null : step.id
                                  )
                                }
                              >
                                {headcount(crewOf(step, recipe))} crew
                              </ToggleChip>
                            </div>

                            {openCrewId === step.id ? (
                              <div className="flex flex-wrap items-center gap-2 rounded-md bg-zinc-100 px-2 py-1.5">
                                <CrewEditor
                                  crew={
                                    step.crew.length
                                      ? step.crew
                                      : recipe.crew.map((c) => ({ ...c }))
                                  }
                                  onChange={(crew) => patchStep(step.id, { crew })}
                                />
                                <span className="text-[10.5px] text-zinc-400">
                                  {step.crew.length
                                    ? "This step has its own crew."
                                    : "Inherited from the recipe — edits create an override."}
                                </span>
                              </div>
                            ) : null}

                            {step.ccp ? (
                              <div className="grid gap-1.5 rounded-md border border-red-200 bg-red-50 p-2">
                                <div>
                                  <div className="mb-0.5 text-[9px] font-semibold tracking-wide text-red-800 uppercase">
                                    <TipLabel tipKey="limit">Critical limit</TipLabel>
                                  </div>
                                  <input
                                    value={step.criticalLimit}
                                    onChange={(e) =>
                                      patchStep(step.id, {
                                        criticalLimit: e.target.value,
                                      })
                                    }
                                    placeholder='165 °F for 15 seconds'
                                    className="w-full rounded border border-red-200 bg-white px-2 py-1 text-xs outline-none focus:border-red-500"
                                  />
                                </div>
                                <div>
                                  <div className="mb-0.5 text-[9px] font-semibold tracking-wide text-red-800 uppercase">
                                    <TipLabel tipKey="fix">
                                      If not met, operator must
                                    </TipLabel>
                                  </div>
                                  <input
                                    value={step.correctiveAction}
                                    onChange={(e) =>
                                      patchStep(step.id, {
                                        correctiveAction: e.target.value,
                                      })
                                    }
                                    placeholder="Keep cooking and re-probe. Call QA."
                                    className="w-full rounded border border-red-200 bg-white px-2 py-1 text-xs outline-none focus:border-red-500"
                                  />
                                </div>
                              </div>
                            ) : null}

                            {step.showSafety || step.safety ? (
                              <FieldChip tipKey="ppe" label="Safety">
                                <input
                                  className="min-w-[200px] border-0 border-b border-dotted border-zinc-300 bg-transparent text-xs outline-none focus:border-sky-500"
                                  value={step.safety}
                                  onChange={(e) =>
                                    patchStep(step.id, {
                                      safety: e.target.value,
                                      showSafety: true,
                                    })
                                  }
                                  placeholder="Heat gloves. Lid closed while heating."
                                />
                              </FieldChip>
                            ) : null}

                            {stepIssues(step, recipe).length ? (
                              <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                                ▲ {stepIssues(step, recipe).join(" · ")}
                              </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed pt-2">
                                <span className="text-[9px] tracking-wide text-zinc-400 uppercase">
                                  <TipLabel tipKey="mode">Kind</TipLabel>
                                </span>
                                <select
                                  className="rounded border bg-white px-1.5 py-0.5 text-[11px]"
                                  value={step.mode}
                                  onChange={(e) => {
                                    const mode = e.target.value as StepMode;
                                    patchStep(step.id, {
                                      mode,
                                      type: STAGE_TYPES[mode][0],
                                      equipment: "",
                                      capacityUm: mode === "line" ? "OZ" : "LB",
                                    });
                                  }}
                                >
                                  {STEP_MODES.map(([id, label]) => (
                                    <option key={id} value={id}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  className="rounded border bg-white px-1.5 py-0.5 text-[11px]"
                                  value={step.type}
                                  onChange={(e) =>
                                    patchStep(step.id, { type: e.target.value })
                                  }
                                >
                                  {STAGE_TYPES[step.mode].map((t) => (
                                    <option key={t}>{t}</option>
                                  ))}
                                </select>
                                {step.mode !== "prep" &&
                                !(step.showSetting || step.setting) ? (
                                  <button
                                    type="button"
                                    className="rounded border border-dashed px-2 py-0.5 text-[11px] text-sky-800 hover:border-solid hover:bg-sky-50"
                                    onClick={() =>
                                      patchStep(step.id, { showSetting: true })
                                    }
                                  >
                                    Setting
                                  </button>
                                ) : null}
                                {!(step.showSafety || step.safety) ? (
                                  <button
                                    type="button"
                                    className="rounded border border-dashed px-2 py-0.5 text-[11px] text-sky-800 hover:border-solid hover:bg-sky-50"
                                    onClick={() =>
                                      patchStep(step.id, { showSafety: true })
                                    }
                                  >
                                    Safety
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded border border-dashed px-2 py-0.5 text-[11px] text-sky-800 hover:border-solid hover:bg-sky-50"
                                  onClick={() => duplicateStep(step.id)}
                                >
                                  <Copy className="size-3" />
                                  Duplicate
                                </button>
                                <span className="flex-1" />
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] text-zinc-400 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => removeStep(step.id)}
                                >
                                  <Trash2 className="size-3" />
                                  Delete step
                                </button>
                              </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                onClick={addStep}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-sky-200 bg-white py-2 text-sm font-medium text-sky-800 hover:border-solid hover:bg-sky-50"
              >
                <Plus className="size-4" />
                Add a step
              </button>

              <div>
                <h3 className="mb-1.5 text-sm font-semibold">
                  Rules for the whole batch
                </h3>
                <textarea
                  value={recipe.generalRules}
                  rows={2}
                  onChange={(e) => onChange({ generalRules: e.target.value })}
                  placeholder="USDA product, lot tracking, sanitize equipment, supervisor sign-off…"
                  className="w-full resize-y rounded-lg border bg-white px-2.5 py-2 text-xs leading-relaxed outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <RecipeFloorCard
        recipe={recipe}
        open={floorOpen}
        lang={lang}
        multFull={multFull}
        multFinal={multFinal}
        onClose={() => setFloorOpen(false)}
        onLangChange={setLang}
        onMultFullChange={setMultFull}
        onMultFinalChange={setMultFinal}
      />
    </section>
  );
}
