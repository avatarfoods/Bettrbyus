import { LABOR_RATE_PER_HOUR } from "@/lib/recipes/instruction-config";
import type { CookingRecipe, RecipeCrewMember, RecipeStep } from "@/lib/recipes/recipe-graph";

export function toMinutes(value: string | number, unit: string): number {
  const n = Number(value);
  if (!n) return 0;
  if (unit === "sec") return n / 60;
  if (unit === "hr") return n * 60;
  return n;
}

export function crewOf(
  step: RecipeStep,
  recipe: CookingRecipe
): RecipeCrewMember[] {
  return step.crew.length ? step.crew : recipe.crew;
}

export function headcount(crew: RecipeCrewMember[]): number {
  return crew.reduce((sum, member) => sum + (Number(member.count) || 0), 0);
}

export function mixCycleMinutes(step: RecipeStep): number {
  return (
    ((Number(step.mixFwdSec) || 0) + (Number(step.mixBackSec) || 0)) *
    (Number(step.mixCycles) || 0) /
    60
  );
}

/** Scheduled (max) minutes for a step. */
export function minsOf(step: RecipeStep, recipe: CookingRecipe): number {
  if (step.mode === "line") {
    const uph = Number(step.unitsPerHour);
    const target = recipe.targetUnits ?? recipe.orderTotal ?? 0;
    return uph ? (target / uph) * 60 : 0;
  }
  if (step.mode === "prep") {
    const lbhr = Number(step.lbPerHour);
    const batchIn = recipe.batchSize ?? 0;
    return lbhr ? (batchIn / lbhr) * 60 : 0;
  }
  return (
    toMinutes(step.durationMax, step.durationUm) ||
    toMinutes(step.durationMin, step.durationUm) ||
    (step.mode === "mix" ? mixCycleMinutes(step) : 0)
  );
}

export function minsLo(step: RecipeStep, recipe: CookingRecipe): number {
  if (step.mode === "batch" || step.mode === "mix") {
    return toMinutes(step.durationMin, step.durationUm) || minsOf(step, recipe);
  }
  return minsOf(step, recipe);
}

export type LabourTotals = {
  lo: number;
  hi: number;
  personMinutes: number;
  hours: number;
  cost: number;
  perOutputUnit: number;
  perPiece: number;
  byRole: Record<string, number>;
};

export function labourTotals(recipe: CookingRecipe): LabourTotals {
  let lo = 0;
  let hi = 0;
  let personMinutes = 0;
  const byRole: Record<string, number> = {};

  for (const step of recipe.steps) {
    const m = minsOf(step, recipe);
    lo += minsLo(step, recipe);
    hi += m;
    for (const member of crewOf(step, recipe)) {
      const n = Number(member.count) || 0;
      const pm = m * n;
      personMinutes += pm;
      byRole[member.role] = (byRole[member.role] || 0) + pm;
    }
  }

  const hours = personMinutes / 60;
  const cost = hours * LABOR_RATE_PER_HOUR;
  const out = recipe.batchYield ?? recipe.batchSize ?? 0;
  const target = recipe.targetUnits ?? recipe.orderTotal ?? 0;

  return {
    lo,
    hi,
    personMinutes,
    hours,
    cost,
    perOutputUnit: out ? cost / out : 0,
    perPiece: target ? cost / target : 0,
    byRole,
  };
}

export function clockAt(recipe: CookingRecipe, index: number): number {
  return recipe.steps
    .slice(0, index)
    .reduce((sum, step) => sum + minsOf(step, recipe), 0);
}

export function formatClock(minutes: number): string {
  const m = Math.round(minutes);
  return (m >= 60 ? `${Math.floor(m / 60)}h ` : "") + `${m % 60}m`;
}

export function stepIssues(step: RecipeStep, recipe: CookingRecipe): string[] {
  const issues: string[] = [];
  if (!step.text.trim()) issues.push("No instruction written yet.");
  if (step.ccp && !step.criticalLimit.trim()) {
    issues.push("Critical control point with no critical limit.");
  }
  if (
    step.mode === "batch" &&
    step.capacityMin &&
    step.capacityUm === "LB" &&
    recipe.batchSize != null &&
    Number(step.capacityMin) > recipe.batchSize
  ) {
    issues.push(
      `${step.equipment || "Equipment"} needs at least ${Number(step.capacityMin).toLocaleString("en-US")} LB — the batch is ${recipe.batchSize.toLocaleString("en-US")} LB.`
    );
  }
  if (step.mode === "line" && !step.unitsPerHour) {
    issues.push("No units per hour, so run time cannot be worked out.");
  }
  if (step.mode === "prep" && !step.lbPerHour) {
    issues.push("No pounds per hour, so run time cannot be worked out.");
  }
  return issues;
}

export function allIssueCount(recipe: CookingRecipe): number {
  return recipe.steps.reduce(
    (sum, step) => sum + stepIssues(step, recipe).length,
    0
  );
}

export function ccpCount(recipe: CookingRecipe): number {
  return recipe.steps.filter((step) => step.ccp).length;
}
