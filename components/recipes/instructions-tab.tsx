"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  saveInstructions,
  type InstructionStep,
  type StepInput,
} from "@/lib/recipes/instructions";
import {
  CHECKS,
  CREW_ROLES,
  EQUIPMENT,
  EQUIPMENT_BY_NAME,
  EQUIPMENT_LABEL,
  FIELD_HELP,
  STAGES,
  formatDuration,
  mixingSeconds,
  secondsPerUnit,
  type EquipmentKind,
} from "@/lib/recipes/instruction-config";
import { cn } from "@/lib/utils";

/**
 * The method, written the way the floor reads it.
 *
 * One card per step. The sentence is the point, but a sentence alone leaves
 * the operator guessing at the machine, the setting, and what has to be
 * recorded - so those sit beside it as their own fields rather than buried in
 * prose. Which machine fields appear is decided by the equipment chosen: a
 * line has units per hour, a mixer has forward/back/cycles, a cutter has a
 * blade set-up. Everything else stays hidden so a step stays readable.
 */

function blankStep(): StepInput {
  return {
    stage: null,
    body: "",
    bodyEs: null,
    equipment: null,
    equipmentKind: null,
    setting: null,
    targetTemp: null,
    targetTime: null,
    batchSize: null,
    crewRole: null,
    unitsPerHour: null,
    weightPerUnit: null,
    turnForwardSeconds: null,
    turnBackSeconds: null,
    cycles: null,
    speed: null,
    cutSpec: null,
    poundsPerHour: null,
    checkWeigh: false,
    checkTemperature: false,
    checkPhoto: false,
    checkMetalDetector: false,
    checkLabel: false,
    requiresSignoff: false,
    criticalLimit: null,
    correctiveAction: null,
    safetyNote: null,
  };
}

function toInput(step: InstructionStep): StepInput {
  // id and stepNumber belong to the stored row, not to the draft - the number
  // is re-derived from position on save, so carrying it would let the two
  // disagree after a reorder.
  const draft = { ...step } as Partial<InstructionStep>;
  delete draft.id;
  delete draft.stepNumber;
  return draft as StepInput;
}

export function InstructionsTab({
  recipeId,
  steps,
  missingTable,
  canEdit,
}: {
  recipeId: string;
  steps: InstructionStep[];
  missingTable: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<StepInput[]>(steps.map(toInput));

  // As elsewhere: a missing table stops saving, not looking. The editor works
  // so the shape of a method can be tried out before anyone runs a migration.
  const live = canEdit && editing && !missingTable;

  function update(index: number, patch: Partial<StepInput>) {
    setDrafts((prev) =>
      prev.map((step, i) => (i === index ? { ...step, ...patch } : step))
    );
  }

  function move(index: number, by: number) {
    setDrafts((prev) => {
      const next = [...prev];
      const target = index + by;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function cancel() {
    setDrafts(steps.map(toInput));
    setEditing(false);
    setError(null);
    setNotice(null);
    setWarning(null);
  }

  function save() {
    setNotice(null);
    setWarning(null);
    setError(null);
    startTransition(async () => {
      const result = await saveInstructions({ recipeId, steps: drafts });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(`Saved ${result.saved} steps.`);
      setWarning(result.warning ?? null);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          One action per step, in the order they happen. What you write here is
          what prints on the batch sheet.
        </p>

        {canEdit && !missingTable && (
          <div className="ml-auto flex items-center gap-2">
            {live ? (
              <>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={pending}
                  className="h-8 rounded-sm bg-card ring-1 ring-foreground/10 px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
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
                  Save method
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5" />
                  Locked
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setNotice(null);
                    setWarning(null);
                    setError(null);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Pencil className="size-3.5" />
                  Edit method
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {missingTable && (
        <p className="flex items-start gap-2 rounded-md bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>Instructions cannot be saved yet.</strong> Run{" "}
            <code>PENDING_MIGRATIONS.sql</code> first.
          </span>
        </p>
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

      <ol className="flex flex-col gap-2">
        {drafts.map((step, index) => (
          <StepCard
            key={index}
            index={index}
            step={step}
            live={live}
            isFirst={index === 0}
            isLast={index === drafts.length - 1}
            onChange={(patch) => update(index, patch)}
            onMove={(by) => move(index, by)}
            onRemove={() =>
              setDrafts((prev) => prev.filter((_, i) => i !== index))
            }
          />
        ))}
      </ol>

      {drafts.length === 0 && (
        <p className="rounded-md bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
          No steps yet. The batch sheet prints without a method until you add
          some.
        </p>
      )}

      {live && (
        <button
          type="button"
          onClick={() => setDrafts((prev) => [...prev, blankStep()])}
          className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-dashed border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted"
        >
          <Plus className="size-4" />
          Add step {drafts.length + 1}
        </button>
      )}
    </div>
  );
}

function StepCard({
  index,
  step,
  live,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  step: StepInput;
  live: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<StepInput>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const kind = step.equipmentKind;
  const machineLabel = kind ? EQUIPMENT_LABEL[kind] : "Equipment";

  const perUnit = secondsPerUnit(step.unitsPerHour);
  const mixTotal = mixingSeconds(
    step.turnForwardSeconds,
    step.turnBackSeconds,
    step.cycles
  );

  return (
    <li className="rounded-md bg-card ring-1 ring-foreground/10">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-[1px] bg-primary text-xs font-bold text-primary-foreground tabular-nums">
          {index + 1}
        </span>

        <Select
          value={step.stage ?? ""}
          disabled={!live}
          onChange={(value) => onChange({ stage: value || null })}
          aria-label="Stage"
          help={FIELD_HELP.stage}
          className="w-36 font-semibold"
        >
          <option value="">Stage…</option>
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </Select>

        <Select
          value={step.equipment ?? ""}
          disabled={!live}
          onChange={(value) =>
            onChange({
              equipment: value || null,
              equipmentKind:
                (EQUIPMENT_BY_NAME.get(value)?.kind as EquipmentKind) ?? null,
            })
          }
          aria-label={machineLabel}
          help={FIELD_HELP.equipment}
          className="w-56"
        >
          <option value="">{machineLabel}…</option>
          {EQUIPMENT.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </Select>

        <Select
          value={step.crewRole ?? ""}
          disabled={!live}
          onChange={(value) => onChange({ crewRole: value || null })}
          aria-label="Crew"
          help={FIELD_HELP.crewRole}
          className="w-44"
        >
          <option value="">Who runs it…</option>
          {CREW_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </Select>

        {live && (
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={isFirst}
              aria-label="Move step up"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={isLast}
              aria-label="Move step down"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronDown className="size-4" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove step"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </span>
        )}
      </div>

      <div className="px-3 py-2">
        <textarea
          value={step.body}
          readOnly={!live}
          onChange={(event) => onChange({ body: event.target.value })}
          rows={2}
          placeholder="What the operator does"
          aria-label={`Step ${index + 1} instruction`}
          title={FIELD_HELP.body}
          className={cn(
            "w-full resize-y px-2 py-1 text-sm",
            live
              ? "rounded-sm bg-card ring-1 ring-foreground/10"
              : "border-none bg-transparent p-0 font-medium"
          )}
        />

        {/* Only the fields this machine actually has. */}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Field
            label="Setting"
            help={FIELD_HELP.setting}
            value={step.setting}
            live={live}
            onChange={(v) => onChange({ setting: v })}
            width="w-40"
          />
          <Field
            label="Temperature"
            help={FIELD_HELP.temperature}
            value={step.targetTemp}
            live={live}
            onChange={(v) => onChange({ targetTemp: v })}
            width="w-32"
          />
          <Field
            label="Time"
            help={FIELD_HELP.time}
            value={step.targetTime}
            live={live}
            onChange={(v) => onChange({ targetTime: v })}
            width="w-32"
          />

          {kind === "cooking" && (
            <Field
              label="Batch size"
              help={FIELD_HELP.batchSize}
              value={step.batchSize}
              live={live}
              onChange={(v) => onChange({ batchSize: v })}
              width="w-32"
            />
          )}

          {kind === "line" && (
            <>
              <NumberField
                label="Units per hour"
                help={FIELD_HELP.unitsPerHour}
                value={step.unitsPerHour}
                live={live}
                onChange={(v) => onChange({ unitsPerHour: v })}
              />
              <Derived
                label="Seconds per unit"
                value={perUnit === null ? "—" : `${perUnit.toFixed(2)} sec`}
              />
              <Field
                label="Weight per unit"
                help={FIELD_HELP.weightPerUnit}
                value={step.weightPerUnit}
                live={live}
                onChange={(v) => onChange({ weightPerUnit: v })}
                width="w-36"
              />
            </>
          )}

          {kind === "mixing" && (
            <>
              <NumberField
                label="Forward (sec)"
                help={FIELD_HELP.turnForward}
                value={step.turnForwardSeconds}
                live={live}
                onChange={(v) => onChange({ turnForwardSeconds: v })}
              />
              <NumberField
                label="Back (sec)"
                help={FIELD_HELP.turnBack}
                value={step.turnBackSeconds}
                live={live}
                onChange={(v) => onChange({ turnBackSeconds: v })}
              />
              <NumberField
                label="Cycles"
                help={FIELD_HELP.cycles}
                value={step.cycles}
                live={live}
                onChange={(v) => onChange({ cycles: v })}
              />
              <Field
                label="Speed"
                help={FIELD_HELP.speed}
                value={step.speed}
                live={live}
                onChange={(v) => onChange({ speed: v })}
                width="w-28"
              />
              <Derived label="Mixing time" value={formatDuration(mixTotal)} />
            </>
          )}

          {kind === "cutting" && (
            <>
              <Field
                label="Cut"
                help={FIELD_HELP.cutSpec}
                value={step.cutSpec}
                live={live}
                onChange={(v) => onChange({ cutSpec: v })}
                width="w-40"
              />
              <NumberField
                label="Pounds per hour"
                help={FIELD_HELP.poundsPerHour}
                value={step.poundsPerHour}
                live={live}
                onChange={(v) => onChange({ poundsPerHour: v })}
              />
            </>
          )}
        </div>

        {/* What has to be recorded before the batch moves on. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            You must
          </span>
          {CHECKS.map((check) => (
            <label
              key={check.key}
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                step[check.key] ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              <input
                type="checkbox"
                checked={step[check.key]}
                disabled={!live}
                onChange={(event) =>
                  onChange({ [check.key]: event.target.checked } as Partial<StepInput>)
                }
                className="size-3.5 accent-[var(--color-primary)]"
              />
              {check.label}
            </label>
          ))}
          <label
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              step.requiresSignoff
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            <input
              type="checkbox"
              checked={step.requiresSignoff}
              disabled={!live}
              onChange={(event) =>
                onChange({ requiresSignoff: event.target.checked })
              }
              className="size-3.5 accent-[var(--color-primary)]"
            />
            Supervisor sign-off
          </label>
        </div>

        {(live || step.criticalLimit || step.safetyNote) && (
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <div className="rounded-md bg-destructive/8 p-2 ring-1 ring-destructive/20">
              <span className="block text-[0.625rem] font-bold tracking-wider text-destructive uppercase">
                Critical limit — must be met
              </span>
              <Bare
                value={step.criticalLimit}
                live={live}
                placeholder="e.g. 165 °F for 15 seconds"
                title={FIELD_HELP.criticalLimit}
                onChange={(v) => onChange({ criticalLimit: v })}
              />
              {(live || step.correctiveAction) && (
                <>
                  <span className="mt-1 block text-[0.625rem] font-semibold text-destructive">
                    If it is not met:
                  </span>
                  <Bare
                    value={step.correctiveAction}
                    live={live}
                    placeholder="What to do about it"
                    title={FIELD_HELP.correctiveAction}
                    onChange={(v) => onChange({ correctiveAction: v })}
                  />
                </>
              )}
            </div>

            <div className="rounded-md bg-warning-muted p-2">
              <span className="flex items-center gap-1 text-[0.625rem] font-bold tracking-wider text-warning-foreground uppercase">
                <ShieldAlert className="size-3" />
                Safety
              </span>
              <Bare
                value={step.safetyNote}
                live={live}
                placeholder="Gloves, hot surfaces, blades, lockout"
                title={FIELD_HELP.safetyNote}
                onChange={(v) => onChange({ safetyNote: v })}
              />
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/* ---------------- small pieces ---------------- */

function Select({
  value,
  onChange,
  disabled,
  children,
  className,
  help,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  help?: string;
} & React.AriaAttributes) {
  return (
    <select
      {...rest}
      value={value}
      disabled={disabled}
      title={help}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-7 truncate px-1.5 text-xs",
        disabled
          ? "appearance-none border-none bg-transparent text-foreground"
          : "rounded-sm bg-card ring-1 ring-foreground/10",
        className
      )}
    >
      {children}
    </select>
  );
}

function Field({
  label,
  help,
  value,
  live,
  onChange,
  width = "w-32",
}: {
  label: string;
  help: string;
  value: string | null;
  live: boolean;
  onChange: (value: string | null) => void;
  width?: string;
}) {
  if (!live && !value) return null;
  return (
    <label className={cn("flex flex-col", width)} title={help}>
      <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <input
        value={value ?? ""}
        readOnly={!live}
        onChange={(event) => onChange(event.target.value || null)}
        className={cn(
          "px-1.5 py-0.5 text-xs",
          live
            ? "rounded-sm bg-card ring-1 ring-foreground/10"
            : "border-none bg-transparent p-0 font-medium"
        )}
      />
    </label>
  );
}

function NumberField({
  label,
  help,
  value,
  live,
  onChange,
}: {
  label: string;
  help: string;
  value: number | null;
  live: boolean;
  onChange: (value: number | null) => void;
}) {
  if (!live && value === null) return null;
  return (
    <label className="flex w-28 flex-col" title={help}>
      <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <input
        type="number"
        step="any"
        min={0}
        value={value ?? ""}
        readOnly={!live}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
        className={cn(
          "px-1.5 py-0.5 text-right text-xs tabular-nums",
          live
            ? "rounded-sm bg-card ring-1 ring-foreground/10"
            : "border-none bg-transparent p-0 font-medium"
        )}
      />
    </label>
  );
}

/** A value the app works out, never typed. */
function Derived({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex w-28 flex-col rounded-md bg-muted px-1.5 py-0.5">
      <span className="text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-xs font-medium tabular-nums">{value}</span>
    </span>
  );
}

function Bare({
  value,
  live,
  placeholder,
  title,
  onChange,
}: {
  value: string | null;
  live: boolean;
  placeholder: string;
  title: string;
  onChange: (value: string | null) => void;
}) {
  if (!live) {
    return (
      <span className="block text-xs font-medium">{value || "—"}</span>
    );
  }
  return (
    <input
      value={value ?? ""}
      placeholder={placeholder}
      title={title}
      onChange={(event) => onChange(event.target.value || null)}
      className="mt-0.5 w-full rounded-sm bg-card ring-1 ring-foreground/10 px-1.5 py-0.5 text-xs"
    />
  );
}
