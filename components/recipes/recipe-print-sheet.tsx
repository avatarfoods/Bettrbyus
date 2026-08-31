import type { CatalogRecipe } from "@/lib/recipes/catalog";
import type { InstructionStep } from "@/lib/recipes/instructions";
import {
  CHECKS,
  EQUIPMENT_LABEL,
  formatDuration,
  mixingSeconds,
  secondsPerUnit,
} from "@/lib/recipes/instruction-config";
import {
  batchPlan,
  batchTotal,
  displayQuantity,
  lineMath,
  lossFactor,
  type DisplayUnit,
} from "@/lib/recipes/yield";

/**
 * The batch record.
 *
 * Designed around what the person holding it actually does, in order:
 *
 *   1. confirm they have the right sheet        -> the masthead
 *   2. see how many batches to run              -> one number, large
 *   3. weigh things and write down lot numbers  -> the table
 *   4. follow the steps                         -> the method
 *   5. sign it off                              -> once, at the end
 *
 * Everything that does not serve one of those five is off the page. Batch
 * size and yield are reference figures that belong on the recipe screen, not
 * on a sheet someone is weighing against; and a name is asked for exactly
 * once, at the point it is given.
 *
 * Greyscale, because this is photocopied, written on in pen, and pinned up in
 * a cold room. Weight is carried by rule thickness and type size instead.
 */

const TD = "border border-neutral-300 px-2 py-1.5 align-middle text-[0.8125rem]";
const TH =
  "border border-neutral-300 bg-neutral-100 px-2 py-1 text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-neutral-600";

function fmt(pounds: number, unit: DisplayUnit): string {
  const shown = displayQuantity(pounds, unit);
  return shown.value.toFixed(Math.abs(shown.value) >= 100 ? 1 : 2);
}

export function RecipePrintSheet({
  recipe,
  steps,
  scheduled,
  productionDate,
}: {
  recipe: CatalogRecipe;
  steps: InstructionStep[];
  scheduled: number | null;
  productionDate: string;
}) {
  const total = batchTotal(recipe.lines);
  const desired = recipe.batchSize;

  const plan = batchPlan(scheduled, recipe.batchYield ?? desired);
  const fullBatches = plan.fullBatches ?? 0;
  const finalBatch = plan.finalBatch ?? 0;
  const hasFinal = finalBatch > 0.005;

  return (
    <div className="text-black">
      {/* 1. Right sheet? Name, code, department, allergens, date. */}
      <header className="flex items-start justify-between gap-6 border-b-[3px] border-black pb-2">
        <div className="min-w-0">
          <h1 className="text-[1.375rem] leading-tight font-bold tracking-tight uppercase">
            {recipe.name}
          </h1>
          <p className="mt-0.5 text-[0.6875rem] tracking-wide uppercase">
            <span className="font-mono font-bold">{recipe.wipCode}</span>
            <span className="mx-1.5 text-neutral-400">|</span>
            {recipe.department ?? "No department"}
          </p>
          <p className="mt-1 text-[0.6875rem] font-bold uppercase">
            Allergens:{" "}
            {recipe.allergens.length > 0 ? (
              <span className="border-b-2 border-black">
                {recipe.allergens.join(" · ")}
              </span>
            ) : (
              "None declared"
            )}
            {recipe.allergensUnverified.length > 0 && (
              <span className="ml-1.5 font-normal normal-case text-neutral-600">
                ({recipe.allergensUnverified.length} ingredient
                {recipe.allergensUnverified.length === 1 ? "" : "s"} unverified)
              </span>
            )}
          </p>
        </div>

        {/* 2. The number that changes: how many batches. */}
        <div className="shrink-0 text-right">
          <p className="text-[0.5625rem] font-bold tracking-[0.08em] uppercase text-neutral-600">
            Production date
          </p>
          <p className="text-[0.9375rem] font-bold tabular-nums">
            {productionDate}
          </p>

          <div className="mt-1.5 border-[3px] border-black px-3 py-1.5">
            <p className="text-[0.5625rem] font-bold tracking-[0.08em] uppercase">
              Batches to run
            </p>
            <p className="text-[2rem] leading-none font-bold tabular-nums">
              {fullBatches}
              {hasFinal && (
                <span className="text-[1.125rem]">
                  {" "}
                  + {finalBatch.toFixed(1)}
                </span>
              )}
            </p>
            <p className="text-[0.5625rem] uppercase">
              {hasFinal ? "full + one part batch" : "full batches"}
              {scheduled !== null && ` · for ${scheduled.toLocaleString()} ${recipe.uom ?? "LB"}`}
            </p>
          </div>
        </div>
      </header>

      {/* Written at the start, in one place. */}
      <div className="flex gap-4 border-b border-neutral-300 py-2">
        <Blank label="Lot number" prefill={lotFrom(productionDate)} />
        <Blank label="Start time" />
        <Blank label="Finish time" />
        <Blank label="Produced by" wide />
      </div>

      {/* 3. Weigh and record. */}
      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr>
            <th className={`${TH} w-[15%] text-left`}>Lot number used</th>
            <th className={`${TH} text-left`}>Ingredient</th>
            <th className={`${TH} w-[16%] text-right`}>
              <span className="block text-[0.75rem] tabular-nums text-black">
                {fullBatches} × full
              </span>
            </th>
            {hasFinal && (
              <th className={`${TH} w-[16%] text-right`}>
                <span className="block text-[0.75rem] tabular-nums text-black">
                  {finalBatch.toFixed(1)} × final
                </span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {recipe.lines.map((line) => {
            const math = lineMath(line, total, desired);
            const perBatch =
              recipe.callBasis === "batch"
                ? math.scaledWithLoss
                : line.quantity * lossFactor(line.lossPct);

            const unit = (line.displayUom ?? line.uom ?? "LB") as DisplayUnit;
            const shownUnit = displayQuantity(perBatch, unit).unit;

            return (
              <tr key={line.id}>
                {/* Blank, and tall enough to write in */}
                <td className={`${TD} h-9`} />
                <td className={TD}>
                  <span className="font-semibold uppercase">
                    {line.materialName ?? line.ingredientName}
                  </span>
                  {line.subRecipeId && (
                    <span className="ml-1.5 border border-neutral-500 px-1 text-[0.5rem] font-bold tracking-wide uppercase">
                      sub-recipe
                    </span>
                  )}
                </td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="text-[1rem] font-bold tabular-nums">
                    {fullBatches > 0 ? fmt(perBatch * fullBatches, unit) : "—"}
                  </span>
                  <span className="ml-1 text-[0.625rem] font-semibold">
                    {shownUnit}
                  </span>
                </td>
                {hasFinal && (
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <span className="text-[1rem] font-bold tabular-nums">
                      {fmt(perBatch * finalBatch, unit)}
                    </span>
                    <span className="ml-1 text-[0.625rem] font-semibold">
                      {shownUnit}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
          {recipe.lines.length === 0 && (
            <tr>
              <td className={TD} colSpan={hasFinal ? 4 : 3}>
                No ingredients on this recipe.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* 4. Do the work. */}
      <section className="mt-4">
        <h2 className="border-b-2 border-black pb-0.5 text-[0.625rem] font-bold tracking-[0.08em] uppercase">
          Method
        </h2>
        <ol className="mt-1.5 flex flex-col">
          {steps.map((step) => (
            <PrintStep key={step.id} step={step} />
          ))}

          {/* Room to write, when there is no method yet or more happens */}
          {Array.from({ length: Math.max(0, 4 - steps.length) }).map((_, i) => (
            <li
              key={`blank-${i}`}
              className="flex gap-3 border-b border-neutral-300 py-2.5"
            >
              <span className="w-6 shrink-0 text-right text-[0.875rem] font-bold tabular-nums text-neutral-400">
                {steps.length + i + 1}
              </span>
              <span className="flex-1" />
            </li>
          ))}
        </ol>
      </section>

      {/* 5. Sign off, once. */}
      <div className="mt-5 flex gap-6">
        <Blank label="Total produced" wide />
        <Blank label="Checked by" wide />
        <Blank label="QA released" wide />
        <Blank label="Date" />
      </div>
    </div>
  );
}

/**
 * One instruction.
 *
 * The sentence carries the weight; the machine settings sit under it in small
 * caps, and the two things that can hurt someone or fail an audit - the
 * critical limit and the safety note - are the only boxed elements on the
 * page, so they are the only things that catch the eye.
 */
function PrintStep({ step }: { step: InstructionStep }) {
  const machine = step.equipmentKind
    ? EQUIPMENT_LABEL[step.equipmentKind]
    : "Equipment";

  const facts = [
    step.equipment && `${machine}: ${step.equipment}`,
    step.setting && `Setting ${step.setting}`,
    step.targetTemp && `Temp ${step.targetTemp}`,
    step.targetTime && `Time ${step.targetTime}`,
    step.batchSize && `Batch ${step.batchSize}`,
    step.cutSpec && `Cut ${step.cutSpec}`,
    step.speed && `Speed ${step.speed}`,
    step.weightPerUnit && `Weight/unit ${step.weightPerUnit}`,
    step.unitsPerHour && `${step.unitsPerHour}/hr`,
    step.poundsPerHour && `${step.poundsPerHour} lb/hr`,
    step.crewRole,
  ].filter(Boolean) as string[];

  const perUnit = secondsPerUnit(step.unitsPerHour);
  const mixTotal = mixingSeconds(
    step.turnForwardSeconds,
    step.turnBackSeconds,
    step.cycles
  );
  if (perUnit !== null) facts.push(`${perUnit.toFixed(2)} sec/unit`);
  if (mixTotal !== null) facts.push(`Mixing ${formatDuration(mixTotal)}`);

  const musts: string[] = CHECKS.filter((check) => step[check.key]).map(
    (c) => c.floor
  );
  if (step.requiresSignoff) musts.push("SUPERVISOR SIGNS");

  return (
    <li className="print-keep flex gap-3 border-b border-neutral-300 py-2">
      <span className="w-6 shrink-0 text-right text-[0.875rem] font-bold tabular-nums">
        {step.stepNumber}
      </span>

      <div className="min-w-0 flex-1">
        {step.stage && (
          <span className="mb-0.5 inline-block bg-black px-1.5 py-px text-[0.5rem] font-bold tracking-[0.08em] text-white uppercase">
            {step.stage}
          </span>
        )}

        <p className="text-[0.875rem] leading-snug">{step.body}</p>

        {facts.length > 0 && (
          <p className="mt-0.5 text-[0.5625rem] font-semibold tracking-[0.06em] text-neutral-600 uppercase">
            {facts.join("   ·   ")}
          </p>
        )}

        {step.criticalLimit && (
          <div className="mt-1.5 border-2 border-black px-2 py-1">
            <p className="text-[0.5625rem] font-bold tracking-[0.08em] uppercase">
              Critical limit — must be met
            </p>
            <p className="text-[0.8125rem] font-bold">{step.criticalLimit}</p>
            {step.correctiveAction && (
              <p className="mt-0.5 text-[0.6875rem]">
                <span className="font-bold uppercase">If not met: </span>
                {step.correctiveAction}
              </p>
            )}
          </div>
        )}

        {step.safetyNote && (
          <p className="mt-1 border-l-4 border-black bg-neutral-100 px-2 py-1 text-[0.6875rem]">
            <span className="font-bold uppercase">Safety: </span>
            {step.safetyNote}
          </p>
        )}
      </div>

      {musts.length > 0 && (
        <div className="w-36 shrink-0">
          {musts.map((must) => (
            <span key={must} className="mb-1 flex items-center gap-1.5">
              <span className="inline-block size-3.5 border-2 border-black" />
              <span className="text-[0.5625rem] font-bold tracking-wide uppercase">
                {must}
              </span>
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

/** A line to write on, labelled underneath so the rule stays clean. */
function Blank({
  label,
  prefill,
  wide,
}: {
  label: string;
  prefill?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "flex-[1.5]" : "flex-1"}>
      <div className="flex h-6 items-end border-b border-black pb-0.5">
        {prefill && (
          <span className="font-mono text-[0.8125rem] font-bold tabular-nums">
            {prefill}
          </span>
        )}
      </div>
      <span className="mt-0.5 block text-[0.5625rem] font-bold tracking-[0.08em] uppercase text-neutral-600">
        {label}
      </span>
    </div>
  );
}

/** MMDDYYYY, the format the plant already writes by hand. */
function lotFrom(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}${d}${y}` : "";
}
