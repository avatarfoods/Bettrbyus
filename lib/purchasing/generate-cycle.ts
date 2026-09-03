"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computeMaterialRequirements } from "@/lib/purchasing/mrp";
import { fetchBom, fetchLiveScheduleDemand } from "@/lib/purchasing/live-demand";
import { defaultDemandRange } from "@/lib/purchasing/demand-range";

/**
 * Live Master PO generation.
 *
 * Replaces the old Excel-import-driven generateCycle() in import-actions.ts:
 * order quantities come from the production schedule + BOM, computed here,
 * instead of from a workbook's own already-calculated MASTER PO# rows. See
 * lib/purchasing/mrp.ts for the explosion itself.
 *
 * TODO once PENDING_MIGRATIONS.sql (20260903_purchasing_live_mode) has run:
 * move DEFAULT_EXTRA_PCT below into an app_settings.purchasing_* column so
 * the buffer is admin-editable instead of hardcoded here.
 */

const DEFAULT_EXTRA_PCT = 10;

export type UnresolvedBomLine = {
  recipeId: string;
  recipeName: string;
  ingredientName: string;
  totalLbs: number;
  totalUnits: number;
};

export type GenerateLiveResult =
  | {
      ok: true;
      message: string;
      cycleId: string;
      linesCreated: number;
      unresolvedLines: UnresolvedBomLine[];
      warnings: string[];
    }
  | { ok: false; message: string };

export async function generateCycleLive(input: {
  requiredDate: string;
  /** Start of the demand window. Defaults to defaultDemandRange()'s Monday. */
  fromDate?: string;
  /** End of the demand window. Defaults to defaultDemandRange()'s Saturday. */
  toDate?: string;
  /** Buffer percent, e.g. 15 for 15%. Defaults to DEFAULT_EXTRA_PCT. */
  extraPercent?: number;
}): Promise<GenerateLiveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to generate a cycle." };
  }

  const defaultRange = defaultDemandRange(input.requiredDate);
  const fromDate = input.fromDate || defaultRange.fromDate;
  const toDate = input.toDate || defaultRange.toDate;
  const extraPct = Number.isFinite(input.extraPercent)
    ? (input.extraPercent as number)
    : DEFAULT_EXTRA_PCT;
  const extraFactor = extraPct > 0 ? 1 + extraPct / 100 : 1;

  type MaterialRow = {
    id: string;
    item_code: string;
    name: string;
    lbs_per_case: number | null;
    lead_time_days: number;
    thaw_buffer_days: number;
    is_protein: boolean;
    storage_type: string | null;
  };

  const [materialsRes, inventoryRes, existingCyclesRes] = await Promise.all([
    supabase
      .from("purchasing_materials")
      .select(
        "id, item_code, name, lbs_per_case, lead_time_days, thaw_buffer_days, is_protein, storage_type"
      ),
    supabase.from("purchasing_current_inventory").select("material_id, qty_on_hand"),
    supabase.from("purchasing_cycles").select("id, required_date, po_number, status"),
  ]);

  if (materialsRes.error) {
    return { ok: false, message: `Loading materials failed: ${materialsRes.error.message}` };
  }
  if (inventoryRes.error) {
    return { ok: false, message: `Loading inventory failed: ${inventoryRes.error.message}` };
  }
  if (existingCyclesRes.error) {
    return { ok: false, message: `Loading cycles failed: ${existingCyclesRes.error.message}` };
  }

  // Purchased materials only - produce and subrecipes made in-house never
  // reach here in the first place (mrp.ts only accumulates onto a
  // material_id, never a recipe), this is the packaging/dry-ingredient side
  // of that same rule.
  const materials = ((materialsRes.data ?? []) as MaterialRow[]).filter(
    (material) => material.storage_type !== "produce"
  );
  const onHand = new Map<string, number>(
    (inventoryRes.data ?? []).map((row) => [row.material_id, row.qty_on_hand])
  );

  let cycle = (existingCyclesRes.data ?? []).find(
    (row) => row.required_date === input.requiredDate
  );
  if (!cycle) {
    const nextPo =
      Math.max(0, ...(existingCyclesRes.data ?? []).map((row) => row.po_number ?? 0)) + 1;
    const { data: created, error: createError } = await supabase
      .from("purchasing_cycles")
      .insert({
        po_number: nextPo,
        required_date: input.requiredDate,
        week_label: `${fromDate} to ${toDate}`,
        status: "in_progress",
        created_by: user.id,
      })
      .select("id, required_date, po_number, status")
      .single();
    if (createError || !created) {
      return { ok: false, message: `Creating cycle failed: ${createError?.message}` };
    }
    cycle = created;
  } else {
    await supabase
      .from("purchasing_cycles")
      .update({
        week_label: `${fromDate} to ${toDate}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cycle.id);
  }

  const earlierOpenCycleIds = (existingCyclesRes.data ?? [])
    .filter(
      (row) =>
        row.id !== cycle.id &&
        row.status === "in_progress" &&
        row.required_date < input.requiredDate
    )
    .map((row) => row.id);

  const earlierNeed = new Map<string, number>();
  if (earlierOpenCycleIds.length > 0) {
    const { data: earlierLines, error: earlierError } = await supabase
      .from("purchasing_lines")
      .select("material_id, cases_required")
      .in("cycle_id", earlierOpenCycleIds);
    if (earlierError) {
      return { ok: false, message: `Loading earlier cycles failed: ${earlierError.message}` };
    }
    for (const line of earlierLines ?? []) {
      earlierNeed.set(
        line.material_id,
        (earlierNeed.get(line.material_id) ?? 0) + (line.cases_required ?? 0)
      );
    }
  }

  type ExistingLine = {
    id: string;
    material_id: string;
    status: string;
    arrival_date: string | null;
    arrived_at: string | null;
    notes: string | null;
    is_emergency: boolean;
    required_time: string | null;
  };
  const { data: existingLinesData, error: existingLinesError } = await supabase
    .from("purchasing_lines")
    .select(
      "id, material_id, status, arrival_date, arrived_at, notes, is_emergency, required_time"
    )
    .eq("cycle_id", cycle.id);
  if (existingLinesError) {
    return { ok: false, message: `Loading existing lines failed: ${existingLinesError.message}` };
  }
  const existingByMaterial = new Map(
    ((existingLinesData ?? []) as ExistingLine[]).map((line) => [line.material_id, line])
  );

  const { error: deleteError } = await supabase
    .from("purchasing_lines")
    .delete()
    .eq("cycle_id", cycle.id)
    .eq("is_emergency", false);
  if (deleteError) {
    return { ok: false, message: `Clearing old lines failed: ${deleteError.message}` };
  }

  // The explosion itself.
  const [bom, scheduleDemand] = await Promise.all([
    fetchBom(supabase),
    fetchLiveScheduleDemand(supabase, { fromDate, toDate }),
  ]);
  const { requirements, unresolvedLines, warnings } = computeMaterialRequirements({
    recipesById: bom.recipesById,
    linesByRecipeId: bom.linesByRecipeId,
    scheduleEntries: scheduleDemand,
    fromDate,
    toDate,
  });

  const noSpec: string[] = [];
  const now = new Date().toISOString();
  const requiredDate = new Date(`${input.requiredDate}T00:00:00`);

  const newLines = materials.map((material) => {
    const requirement = requirements.get(material.id);
    const totalBase = requirement ? requirement.totalLbs + requirement.totalUnits : 0;

    let casesRequired = 0;
    let lbsRequired: number | null = null;
    if (totalBase > 0) {
      lbsRequired = totalBase * extraFactor;
      if (material.lbs_per_case && material.lbs_per_case > 0) {
        casesRequired = Math.ceil((totalBase / material.lbs_per_case) * extraFactor);
      } else {
        noSpec.push(material.name);
      }
    }

    const bufferDays = material.lead_time_days + (material.is_protein ? material.thaw_buffer_days : 0);
    const orderBy = new Date(requiredDate);
    orderBy.setDate(orderBy.getDate() - bufferDays);
    const orderByDate = orderBy.toISOString().slice(0, 10);

    const previous = existingByMaterial.get(material.id);
    const carryOver =
      previous && !previous.is_emergency
        ? {
            status: previous.status,
            arrival_date: previous.arrival_date,
            arrived_at: previous.arrived_at,
            notes: previous.notes,
          }
        : {};

    const need = casesRequired;
    const before = earlierNeed.get(material.id) ?? 0;
    const available = onHand.get(material.id) ?? 0;
    const requiredToOrder =
      need > 0 ? Math.min(need, Math.max(0, before + need - available)) : 0;

    return {
      cycle_id: cycle!.id,
      material_id: material.id,
      item_code: material.item_code,
      item_name: material.name,
      cases_required: casesRequired,
      lbs_required: lbsRequired,
      on_hand_cases: onHand.get(material.id) ?? null,
      required_to_order: requiredToOrder,
      order_by_date: orderByDate,
      is_emergency: false,
      updated_by: user.id,
      created_at: now,
      updated_at: now,
      ...carryOver,
    };
  });

  const CHUNK_SIZE = 500;
  for (let i = 0; i < newLines.length; i += CHUNK_SIZE) {
    const chunk = newLines.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from("purchasing_lines")
      .upsert(chunk, { onConflict: "cycle_id,material_id" });
    if (error) {
      return { ok: false, message: `Saving buy lines failed: ${error.message}` };
    }
  }

  revalidatePath("/purchasing");

  const resolvedUnresolved: UnresolvedBomLine[] = [...unresolvedLines.values()];
  const allWarnings = [
    ...warnings,
    ...(noSpec.length > 0
      ? [
          `${noSpec.length} material(s) have no lbs/units-per-case spec set, so cases could not be computed: ${noSpec.slice(0, 8).join(", ")}${noSpec.length > 8 ? "…" : ""}`,
        ]
      : []),
    ...(resolvedUnresolved.length > 0
      ? [
          `${resolvedUnresolved.length} recipe line(s) have no material or sub-recipe mapping - some demand may be undercounted.`,
        ]
      : []),
  ];

  const rowsWithQty = newLines.filter((line) => line.cases_required > 0).length;

  return {
    ok: true,
    message: `Master PO for ${input.requiredDate} (production ${fromDate}–${toDate}): ${newLines.length} materials, ${rowsWithQty} with cases needed.`,
    cycleId: cycle!.id,
    linesCreated: newLines.length,
    unresolvedLines: resolvedUnresolved,
    warnings: allWarnings,
  };
}
