"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/supabase/missing";
import { logRecipeChange } from "@/lib/recipes/change-log";

/**
 * Editing a recipe's ingredient lines, and its batch numbers.
 *
 * The whole line set is replaced in one call rather than saved row by row.
 * Percentages and the scaled quantities are all relative to the batch total,
 * so a half-saved set would show every other ingredient at the wrong share
 * until the next save landed.
 */

export type ActionResult =
  | { ok: true; warning?: string }
  | { ok: false; message: string };

export type LineInput = {
  /** Existing line, or undefined for a new one. */
  id?: string;
  ingredientName: string;
  materialId?: string | null;
  subRecipeId?: string | null;
  quantity: number;
  uom: string | null;
  /** Unit the calculated amount prints in. Null = same as uom. */
  displayUom?: string | null;
  /** Stored as a negative number, e.g. -8 for 8% lost on this line. */
  lossPct: number | null;
};

function fail(message: string): ActionResult {
  return { ok: false, message };
}



async function requireAdmin() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false as const, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return {
      ok: false as const,
      message: "Only an administrator can change a recipe",
    };
  }
  return {
    ok: true as const,
    supabase,
    userId: profile.id,
    userName: profile.full_name || profile.email || null,
  };
}

/**
 * Replaces a recipe's ingredient lines.
 *
 * A line must resolve to something: a material, a subrecipe, or at minimum a
 * name someone typed. Lines with no name at all are dropped rather than
 * saved as blanks that would sit in the batch total forever.
 */
export async function saveRecipeLines(input: {
  recipeId: string;
  lines: LineInput[];
}): Promise<ActionResult & { saved?: number }> {
  if (!input.recipeId) return fail("Missing recipe");

  const cleaned = input.lines
    .map((line) => ({
      ...line,
      ingredientName: (line.ingredientName ?? "").trim(),
      quantity: Number(line.quantity),
    }))
    .filter((line) => line.ingredientName !== "");

  for (const line of cleaned) {
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      return fail(`"${line.ingredientName}" needs a quantity of zero or more`);
    }
    if (
      line.lossPct !== null &&
      (!Number.isFinite(line.lossPct) || Math.abs(line.lossPct) > 100)
    ) {
      return fail(
        `"${line.ingredientName}" has a loss outside -100% to 100%`
      );
    }
    if (line.materialId && line.subRecipeId) {
      return fail(
        `"${line.ingredientName}" cannot be both a material and a subrecipe`
      );
    }
    if (line.subRecipeId === input.recipeId) {
      return fail(`"${line.ingredientName}" cannot contain the recipe itself`);
    }
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  // Replace rather than diff: the sort order is the recipe's method order, and
  // reconciling moves, inserts and deletes row by row is where drift starts.
  const { error: deleteError } = await gate.supabase
    .from("purchasing_recipe_lines")
    .delete()
    .eq("recipe_id", input.recipeId);

  if (deleteError) return fail(deleteError.message);

  if (cleaned.length > 0) {
    const rows = cleaned.map((line, index) => ({
      recipe_id: input.recipeId,
      ingredient_name: line.ingredientName,
      material_id: line.materialId ?? null,
      sub_recipe_id: line.subRecipeId ?? null,
      quantity: line.quantity,
      uom: line.uom,
      display_uom: line.displayUom ?? null,
      loss_pct: line.lossPct,
      sort_order: index + 1,
    }));

    const { error } = await gate.supabase
      .from("purchasing_recipe_lines")
      .insert(rows);

    if (error) {
      if (!isMissingColumn(error)) return fail(error.message);

      // display_uom is the only column the migration adds here, so the lines
      // themselves are saved without it rather than lost.
      const withoutDisplay = rows.map((row) => {
        const copy = { ...row } as Record<string, unknown>;
        delete copy.display_uom;
        return copy;
      });
      const { error: retryError } = await gate.supabase
        .from("purchasing_recipe_lines")
        .insert(withoutDisplay);

      if (retryError) return fail(retryError.message);

      revalidatePath(`/recipes/${input.recipeId}`);
      revalidatePath("/recipes");
      return {
        ok: true,
        saved: cleaned.length,
        warning:
          "Ingredients saved. The per-line print unit was not — it needs PENDING_MIGRATIONS.sql to be run first.",
      };
    }
  }

  await logRecipeChange(gate.supabase, {
    recipeId: input.recipeId,
    userId: gate.userId,
    userName: gate.userName,
    summary: `Saved ${cleaned.length} ingredient line${cleaned.length === 1 ? "" : "s"}: ${cleaned
      .map((line) => line.ingredientName)
      .slice(0, 6)
      .join(", ")}${cleaned.length > 6 ? "…" : ""}`,
  });

  revalidatePath(`/recipes/${input.recipeId}`);
  revalidatePath("/recipes");
  revalidatePath("/production/schedule");
  return { ok: true, saved: cleaned.length };
}

/**
 * The two typed batch numbers. The yield percentage is never stored - it is
 * derived from these, so it cannot disagree with them.
 */
export async function saveRecipeBatch(input: {
  recipeId: string;
  /** DESIRED BATCH SIZE. Null for a per-unit recipe. */
  batchSize: number | null;
  /** BATCH YEILD - what actually comes out. */
  batchYield: number | null;
  /** How the floor is told what to make. */
  callBasis?: "batch" | "unit" | "case";
  uom?: string | null;
}): Promise<ActionResult> {
  if (!input.recipeId) return fail("Missing recipe");

  for (const [label, value] of [
    ["Desired batch size", input.batchSize],
    ["Batch yield", input.batchYield],
  ] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return fail(`${label} must be zero or more`);
    }
  }

  /*
    A batch recipe must state what a batch actually yields.

    Everything downstream - how much of this a bowl takes, how much to buy -
    divides by the yield, so a blank one silently falls back to the desired
    batch and every number below it comes out wrong. It can equal the desired
    batch (a recipe that loses nothing), but it has to be said out loud.
  */
  if (input.callBasis === "batch" || input.batchSize !== null) {
    if (input.batchYield === null || !(input.batchYield > 0)) {
      return fail(
        "Batch yield is required for a batch recipe — what actually comes out of the kettle. Enter the desired batch size again if nothing is lost."
      );
    }
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  // Columns the yield migration adds. If it has not been run, writing them
  // fails the whole update - including batch_size, which has always existed.
  // So the new fields are attempted, then dropped and retried, rather than
  // letting a pending migration block a field that works today.
  const core: Record<string, unknown> = {
    batch_size: input.batchSize,
    updated_at: new Date().toISOString(),
  };
  if (input.uom !== undefined) core.uom = input.uom;

  const pending: Record<string, unknown> = {
    batch_yield: input.batchYield,
  };
  if (input.callBasis !== undefined) pending.call_basis = input.callBasis;

  const { error } = await gate.supabase
    .from("purchasing_recipes")
    .update({ ...core, ...pending })
    .eq("id", input.recipeId);

  if (error && isMissingColumn(error)) {
    const { error: retryError } = await gate.supabase
      .from("purchasing_recipes")
      .update(core)
      .eq("id", input.recipeId);

    if (retryError) return fail(retryError.message);

    revalidatePath(`/recipes/${input.recipeId}`);
    revalidatePath("/production/schedule");
    return {
      ok: true,
      warning:
        "Desired batch saved. Batch yield and called-in could not be — they need PENDING_MIGRATIONS.sql to be run first.",
    };
  }

  if (error) return fail(error.message);

  await logRecipeChange(gate.supabase, {
    recipeId: input.recipeId,
    userId: gate.userId,
    userName: gate.userName,
    summary:
      input.batchSize === null
        ? `Called in ${input.callBasis ?? "unit"} (no batch)`
        : `Batch: desired ${input.batchSize}, yield ${input.batchYield ?? "—"}, called in ${input.callBasis ?? "batch"}`,
  });

  revalidatePath(`/recipes/${input.recipeId}`);
  revalidatePath("/production/schedule");
  return { ok: true };
}
