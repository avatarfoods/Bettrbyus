"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import type { EquipmentKind } from "@/lib/recipes/instruction-config";
import { isMissingColumn, isMissingTable } from "@/lib/supabase/missing";

/**
 * Recipe instructions - the numbered method the floor works from.
 *
 * Steps are stored one row per step rather than as a block of text, because
 * the number is real: it is printed, signed against, and referred to by
 * number. Everything beside the sentence - the machine, the setting, the
 * check, the limit - is a column rather than something buried in prose, so
 * the same step can be printed, checked and reported on.
 */

export type InstructionStep = {
  id: string;
  stepNumber: number;
  stage: string | null;
  body: string;
  bodyEs: string | null;

  equipment: string | null;
  equipmentKind: EquipmentKind | null;
  setting: string | null;
  targetTemp: string | null;
  targetTime: string | null;
  batchSize: string | null;
  crewRole: string | null;

  unitsPerHour: number | null;
  weightPerUnit: string | null;
  turnForwardSeconds: number | null;
  turnBackSeconds: number | null;
  cycles: number | null;
  speed: string | null;
  cutSpec: string | null;
  poundsPerHour: number | null;

  checkWeigh: boolean;
  checkTemperature: boolean;
  checkPhoto: boolean;
  checkMetalDetector: boolean;
  checkLabel: boolean;
  requiresSignoff: boolean;

  criticalLimit: string | null;
  correctiveAction: string | null;
  safetyNote: string | null;
};

export type InstructionsData = {
  steps: InstructionStep[];
  missingTable: boolean;
  /** True when the table exists but the richer columns do not yet. */
  missingColumns: boolean;
};

export type ActionResult =
  | { ok: true; warning?: string }
  | { ok: false; message: string };

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

function toStep(row: Record<string, unknown>): InstructionStep {
  return {
    id: row.id as string,
    stepNumber: (row.step_number as number) ?? 0,
    stage: str(row.stage),
    body: (row.body as string) ?? "",
    bodyEs: str(row.body_es),

    equipment: str(row.equipment),
    equipmentKind: (str(row.equipment_kind) as EquipmentKind | null) ?? null,
    setting: str(row.setting),
    targetTemp: str(row.target_temp),
    targetTime: str(row.target_time),
    batchSize: str(row.batch_size),
    crewRole: str(row.crew_role),

    unitsPerHour: num(row.units_per_hour),
    weightPerUnit: str(row.weight_per_unit),
    turnForwardSeconds: num(row.turn_forward_seconds),
    turnBackSeconds: num(row.turn_back_seconds),
    cycles: num(row.cycles),
    speed: str(row.speed),
    cutSpec: str(row.cut_spec),
    poundsPerHour: num(row.pounds_per_hour),

    checkWeigh: Boolean(row.check_weigh),
    checkTemperature: Boolean(row.check_temperature),
    checkPhoto: Boolean(row.check_photo),
    checkMetalDetector: Boolean(row.check_metal_detector),
    checkLabel: Boolean(row.check_label),
    requiresSignoff: Boolean(row.requires_signoff),

    criticalLimit: str(row.critical_limit),
    correctiveAction: str(row.corrective_action),
    safetyNote: str(row.safety_note),
  };
}

export async function fetchInstructions(
  supabase: SupabaseClient,
  recipeId: string
): Promise<InstructionsData> {
  // "*" so the page works before and after the columns are added - naming one
  // that does not exist yet fails the whole query.
  const { data, error } = await supabase
    .from("recipe_instructions")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("step_number");

  if (error) {
    return {
      steps: [],
      missingTable: isMissingTable(error),
      missingColumns: false,
    };
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  return {
    steps: rows.map(toStep),
    missingTable: false,
    // Detected from the shape of what came back rather than a second query.
    missingColumns: rows.length > 0 && !("stage" in rows[0]),
  };
}



async function requireAdmin() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false as const, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return {
      ok: false as const,
      message: "Only an administrator can change instructions",
    };
  }
  return { ok: true as const, supabase, userId: profile.id };
}

export type StepInput = Omit<InstructionStep, "id" | "stepNumber">;

/**
 * Replaces a recipe's whole method in one go.
 *
 * Saving step by step would let the numbering drift between writes; replacing
 * the set keeps the printed sheet consistent with what was on screen when
 * Save was pressed.
 */
export async function saveInstructions(input: {
  recipeId: string;
  steps: StepInput[];
}): Promise<ActionResult & { saved?: number }> {
  if (!input.recipeId) return { ok: false, message: "Missing recipe" };

  const cleaned = input.steps
    .map((step) => ({ ...step, body: (step.body ?? "").trim() }))
    .filter((step) => step.body !== "");

  if (cleaned.some((step) => step.body.length > 2000)) {
    return { ok: false, message: "A step is too long — split it into two" };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const { error: deleteError } = await gate.supabase
    .from("recipe_instructions")
    .delete()
    .eq("recipe_id", input.recipeId);

  if (deleteError) return { ok: false, message: deleteError.message };

  if (cleaned.length === 0) {
    revalidatePath(`/recipes/${input.recipeId}`);
    return { ok: true, saved: 0 };
  }

  const rows = cleaned.map((step, index) => ({
    recipe_id: input.recipeId,
    step_number: index + 1,
    body: step.body,
    body_es: step.bodyEs?.trim() || null,
    stage: step.stage || null,
    equipment: step.equipment || null,
    equipment_kind: step.equipmentKind || null,
    setting: step.setting?.trim() || null,
    target_temp: step.targetTemp?.trim() || null,
    target_time: step.targetTime?.trim() || null,
    batch_size: step.batchSize?.trim() || null,
    crew_role: step.crewRole || null,
    units_per_hour: step.unitsPerHour,
    weight_per_unit: step.weightPerUnit?.trim() || null,
    turn_forward_seconds: step.turnForwardSeconds,
    turn_back_seconds: step.turnBackSeconds,
    cycles: step.cycles,
    speed: step.speed?.trim() || null,
    cut_spec: step.cutSpec?.trim() || null,
    pounds_per_hour: step.poundsPerHour,
    check_weigh: step.checkWeigh,
    check_temperature: step.checkTemperature,
    check_photo: step.checkPhoto,
    check_metal_detector: step.checkMetalDetector,
    check_label: step.checkLabel,
    requires_signoff: step.requiresSignoff,
    critical_limit: step.criticalLimit?.trim() || null,
    corrective_action: step.correctiveAction?.trim() || null,
    safety_note: step.safetyNote?.trim() || null,
    updated_by: gate.userId,
  }));

  const { error } = await gate.supabase
    .from("recipe_instructions")
    .insert(rows);

  if (error) {
    if (!isMissingColumn(error)) return { ok: false, message: error.message };

    // The richer columns have not been added yet. Save what the original
    // table can hold rather than losing the whole method.
    const basic = rows.map((row) => ({
      recipe_id: row.recipe_id,
      step_number: row.step_number,
      body: row.body,
      target_temp: row.target_temp,
      target_time: row.target_time,
      equipment: row.equipment,
      requires_signoff: row.requires_signoff,
      updated_by: row.updated_by,
    }));

    const { error: retryError } = await gate.supabase
      .from("recipe_instructions")
      .insert(basic);

    if (retryError) return { ok: false, message: retryError.message };

    revalidatePath(`/recipes/${input.recipeId}`);
    return {
      ok: true,
      saved: cleaned.length,
      warning:
        "Steps saved. Stage, checks, limits and machine settings were not — they need PENDING_MIGRATIONS.sql to be run first.",
    };
  }

  revalidatePath(`/recipes/${input.recipeId}`);
  revalidatePath("/production/print");
  return { ok: true, saved: cleaned.length };
}
