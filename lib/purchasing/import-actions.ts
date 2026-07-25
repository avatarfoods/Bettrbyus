"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import {
  ingredientMatchesMaterial,
  normalizeIngredientName,
  parseMasterWorkbook,
} from "@/lib/purchasing/master-parser";

const CHUNK_SIZE = 500;

export type ImportResult = {
  ok: boolean;
  message: string;
  importId?: string;
  stats?: {
    recipes: number;
    recipeLines: number;
    scheduleEntries: number;
    masterPoLines: number;
    scheduleFrom: string | null;
    scheduleTo: string | null;
  };
  warnings?: string[];
};

export type UnresolvedName = {
  ingredientName: string;
  totalLbs: number;
  totalUnits: number;
  recipes: string[];
};

export type GenerateResult = {
  ok: boolean;
  message: string;
  cycleId?: string;
  linesCreated?: number;
  linesWithoutSpec?: string[];
  unresolved?: UnresolvedName[];
  warnings?: string[];
};

/**
 * Parse an uploaded master planning .xlsm and store recipes, BOM lines and
 * the production schedule. Recipes are replaced wholesale on each import.
 */
export async function importMasterFile(formData: FormData): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to import." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "No file received." };
  }

  let parsed;
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "array" });
    parsed = parseMasterWorkbook(workbook);
  } catch (error) {
    console.error("Master file parse failed:", error);
    return { ok: false, message: "Could not read the file. Is it the master planning .xlsm?" };
  }

  if (parsed.recipes.length === 0 || parsed.scheduleEntries.length === 0) {
    return {
      ok: false,
      message: `Parsed ${parsed.recipes.length} recipes and ${parsed.scheduleEntries.length} schedule entries — this doesn't look like the master planning file.`,
      warnings: parsed.warnings,
    };
  }

  // Upsert recipes on wip_code.
  const now = new Date().toISOString();
  const recipeRows = parsed.recipes.map((recipe) => ({
    wip_code: recipe.wipCode,
    name: recipe.name,
    department: recipe.department,
    batch_size: recipe.batchSize,
    uom: recipe.batchSize !== null ? "LBS" : "UNIT",
    active: true,
    updated_at: now,
  }));
  const { error: recipesError } = await supabase
    .from("purchasing_recipes")
    .upsert(recipeRows, { onConflict: "wip_code" });
  if (recipesError) {
    return { ok: false, message: `Saving recipes failed: ${recipesError.message}` };
  }

  const { data: recipeIds, error: recipeIdsError } = await supabase
    .from("purchasing_recipes")
    .select("id, wip_code");
  if (recipeIdsError || !recipeIds) {
    return { ok: false, message: `Reading recipes failed: ${recipeIdsError?.message}` };
  }
  const idByWip = new Map(recipeIds.map((row) => [row.wip_code, row.id]));

  // The INGREDIENT MATRIX maps every ingredient name to its item code. Persist
  // those mappings as aliases so recipe lines resolve automatically instead of
  // requiring manual mapping against the (differently worded) Odoo names.
  const { data: materialRows, error: materialRowsError } = await supabase
    .from("purchasing_materials")
    .select("id, item_code, name");
  if (materialRowsError) {
    return { ok: false, message: `Reading materials failed: ${materialRowsError.message}` };
  }
  const materialByIdForImport = new Map(
    (materialRows ?? []).map((row) => [row.id, row])
  );
  const materialIdByCode = new Map(
    (materialRows ?? []).map((row) => [row.item_code, row.id])
  );
  const materialIdByCodeUpper = new Map(
    (materialRows ?? []).map((row) => [row.item_code.toUpperCase(), row.id])
  );

  function resolveMaterialIdByCode(itemCode: string) {
    return (
      materialIdByCode.get(itemCode) ??
      materialIdByCodeUpper.get(itemCode.toUpperCase()) ??
      null
    );
  }

  const aliasRows: { alias: string; material_id: string }[] = [];
  const seenAliases = new Set<string>();
  const departmentByMaterialId = new Map<string, string>();
  for (const item of parsed.matrixItems) {
    if (item.kind === "subrecipe") continue;
    const materialId = resolveMaterialIdByCode(item.itemCode);
    const alias = normalizeIngredientName(item.name);
    if (!materialId || !alias || seenAliases.has(alias)) continue;
    const material = materialByIdForImport.get(materialId);
    // Skip when Excel matrix code points at a different Odoo product.
    if (!material || !ingredientMatchesMaterial(item.name, material.name)) {
      continue;
    }
    seenAliases.add(alias);
    aliasRows.push({ alias, material_id: materialId });
    if (item.department) {
      departmentByMaterialId.set(materialId, item.department);
    }
  }
  for (let i = 0; i < aliasRows.length; i += CHUNK_SIZE) {
    const chunk = aliasRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from("purchasing_material_aliases")
      .upsert(chunk, { onConflict: "alias" });
    if (error) {
      return { ok: false, message: `Saving name mappings failed: ${error.message}` };
    }
  }

  // Prefer MASTER PO# department labels when present (matches Excel sections).
  for (const line of parsed.masterPoLines) {
    const materialId = resolveMaterialIdByCode(line.itemCode);
    if (materialId && line.department) {
      departmentByMaterialId.set(materialId, line.department);
    }
  }

  // Stamp departments onto materials for Master PO section grouping.
  for (const [materialId, department] of departmentByMaterialId) {
    const { error } = await supabase
      .from("purchasing_materials")
      .update({ department, updated_at: now })
      .eq("id", materialId);
    if (
      error &&
      typeof error.message === "string" &&
      !error.message.includes("department")
    ) {
      return { ok: false, message: `Saving material departments failed: ${error.message}` };
    }
  }

  // Mark matrix produce items so they never land on the Master PO buy list.
  for (const item of parsed.matrixItems) {
    if (
      item.kind !== "produce" &&
      !((item.department ?? "").toUpperCase().startsWith("PRODUCE"))
    ) {
      continue;
    }
    const materialId = resolveMaterialIdByCode(item.itemCode);
    if (!materialId) continue;
    const { error } = await supabase
      .from("purchasing_materials")
      .update({
        storage_type: "produce",
        department: item.department || "PRODUCE",
        updated_at: now,
      })
      .eq("id", materialId);
    if (
      error &&
      typeof error.message === "string" &&
      !error.message.includes("storage_type") &&
      !error.message.includes("department")
    ) {
      return { ok: false, message: `Saving produce flags failed: ${error.message}` };
    }
  }

  // Resolution maps for storing material_id / sub_recipe_id on BOM lines.
  // Matrix subrecipe names also map to recipes (they can differ from the
  // recipe sheet names).
  const wipByName = new Map<string, string>();
  for (const recipe of parsed.recipes) {
    wipByName.set(normalizeIngredientName(recipe.name), recipe.wipCode);
  }
  for (const item of parsed.matrixItems) {
    if (item.kind !== "subrecipe") continue;
    const key = normalizeIngredientName(item.name);
    if (!wipByName.has(key) && idByWip.has(item.itemCode)) {
      wipByName.set(key, item.itemCode);
    }
  }
  const materialIdByName = new Map<string, string>();
  for (const row of materialRows ?? []) {
    materialIdByName.set(normalizeIngredientName(row.name), row.id);
  }
  for (const row of aliasRows) {
    materialIdByName.set(row.alias, row.material_id);
  }
  const { data: existingAliases } = await supabase
    .from("purchasing_material_aliases")
    .select("alias, material_id");
  for (const row of existingAliases ?? []) {
    const material = materialByIdForImport.get(row.material_id);
    if (
      !material ||
      !ingredientMatchesMaterial(row.alias, material.name)
    ) {
      continue;
    }
    materialIdByName.set(normalizeIngredientName(row.alias), row.material_id);
  }

  // Replace all BOM lines for imported recipes.
  const importedRecipeIds = parsed.recipes
    .map((recipe) => idByWip.get(recipe.wipCode))
    .filter((id): id is string => id !== undefined);
  for (let i = 0; i < importedRecipeIds.length; i += CHUNK_SIZE) {
    const chunk = importedRecipeIds.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from("purchasing_recipe_lines")
      .delete()
      .in("recipe_id", chunk);
    if (error) {
      return { ok: false, message: `Clearing old recipe lines failed: ${error.message}` };
    }
  }

  const lineRows = parsed.recipes.flatMap((recipe) => {
    const recipeId = idByWip.get(recipe.wipCode);
    if (!recipeId) return [];
    return recipe.lines.map((line, index) => {
      const key = normalizeIngredientName(line.ingredientName);
      const subWip = wipByName.get(key);
      const subRecipeId = subWip ? (idByWip.get(subWip) ?? null) : null;
      const materialId = subRecipeId ? null : (materialIdByName.get(key) ?? null);
      return {
        recipe_id: recipeId,
        material_id: materialId,
        sub_recipe_id: subRecipeId,
        ingredient_name: line.ingredientName,
        quantity: line.quantity,
        uom: line.uom,
        loss_pct: line.lossPct,
        sort_order: index,
      };
    });
  });
  for (let i = 0; i < lineRows.length; i += CHUNK_SIZE) {
    const chunk = lineRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("purchasing_recipe_lines").insert(chunk);
    if (error) {
      return { ok: false, message: `Saving recipe lines failed: ${error.message}` };
    }
  }

  // Record the import + schedule entries.
  const dates = parsed.scheduleEntries.map((entry) => entry.date).sort();
  const scheduleFrom = dates[0] ?? null;
  const scheduleTo = dates[dates.length - 1] ?? null;

  const { data: importRow, error: importError } = await supabase
    .from("purchasing_master_imports")
    .insert({
      file_name: file.name,
      production_date: scheduleFrom,
      imported_by: user.id,
      stats: {
        recipes: parsed.recipes.length,
        recipe_lines: lineRows.length,
        schedule_entries: parsed.scheduleEntries.length,
        matrix_items: parsed.matrixItems.length,
        schedule_from: scheduleFrom,
        schedule_to: scheduleTo,
        master_po_lines: parsed.masterPoLines.map((row) => ({
          itemCode: row.itemCode,
          name: row.name,
          department: row.department,
          type: row.type,
          lbsNeeded: row.lbsNeeded,
          casesNeeded: row.casesNeeded,
          productWeight: row.productWeight,
        })),
        produce_item_codes: parsed.matrixItems
          .filter(
            (item) =>
              item.kind === "produce" ||
              (item.department ?? "").toUpperCase().startsWith("PRODUCE") ||
              item.storageType === "produce"
          )
          .map((item) => item.itemCode.toUpperCase()),
        warnings: parsed.warnings,
      },
    })
    .select("id")
    .single();
  if (importError || !importRow) {
    return { ok: false, message: `Saving import failed: ${importError?.message}` };
  }

  const scheduleRows = parsed.scheduleEntries.map((entry) => ({
    import_id: importRow.id,
    recipe_id: idByWip.get(entry.wipCode) ?? null,
    wip_code: entry.wipCode,
    schedule_date: entry.date,
    quantity: entry.quantity,
    uom: entry.uom,
    department: entry.department || null,
    recipe_name: entry.recipeName || null,
  }));
  for (let i = 0; i < scheduleRows.length; i += CHUNK_SIZE) {
    const chunk = scheduleRows.slice(i, i + CHUNK_SIZE);
    let { error } = await supabase.from("purchasing_schedule_entries").insert(chunk);
    if (
      error &&
      typeof error.message === "string" &&
      (error.message.includes("department") || error.message.includes("recipe_name"))
    ) {
      const withoutLabels = chunk.map(
        ({ department: _d, recipe_name: _n, ...rest }) => rest
      );
      const fallback = await supabase
        .from("purchasing_schedule_entries")
        .insert(withoutLabels);
      error = fallback.error;
    }
    if (error) {
      return { ok: false, message: `Saving schedule failed: ${error.message}` };
    }
  }

  revalidatePath("/purchasing");

  return {
    ok: true,
    message: `Imported ${parsed.recipes.length} recipes and ${parsed.scheduleEntries.length} scheduled productions (${scheduleFrom} to ${scheduleTo}).`,
    importId: importRow.id,
    stats: {
      recipes: parsed.recipes.length,
      recipeLines: lineRows.length,
      scheduleEntries: parsed.scheduleEntries.length,
      masterPoLines: parsed.masterPoLines.length,
      scheduleFrom,
      scheduleTo,
    },
    warnings: parsed.warnings,
  };
}

/**
 * Generate Master PO buy list from the Excel MASTER PO# snapshot stored on import.
 * Excel already applied Component Usage + EXTRA %; TMS only nets on-hand and
 * tracks status / ETA / notes.
 */
export async function generateCycle(input: {
  importId: string;
  requiredDate: string;
  fromDate: string;
  toDate: string;
  /** Extra buffer percent, e.g. 15 for 15%. Default 0 — not auto-applied. */
  extraPercent?: number;
}): Promise<GenerateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to generate a cycle." };
  }

  type StoredMasterPoLine = {
    itemCode: string;
    name: string;
    department: string;
    type: string;
    lbsNeeded: number;
    casesNeeded: number;
    productWeight: number | null;
  };

  type MaterialRow = {
    id: string;
    item_code: string;
    name: string;
    lbs_per_case: number | null;
    lead_time_days: number;
    thaw_buffer_days: number;
    is_protein: boolean;
    department?: string | null;
    storage_type?: string | null;
  };

  const [importRes, materialsRes, inventoryRes] = await Promise.all([
    supabase
      .from("purchasing_master_imports")
      .select("id, stats")
      .eq("id", input.importId)
      .maybeSingle(),
    supabase
      .from("purchasing_materials")
      .select(
        "id, item_code, name, lbs_per_case, lead_time_days, thaw_buffer_days, is_protein, department, storage_type"
      ),
    supabase
      .from("purchasing_current_inventory")
      .select("material_id, qty_on_hand"),
  ]);

  let materials = (materialsRes.data ?? []) as MaterialRow[];
  let materialsError = materialsRes.error;
  if (
    materialsError &&
    typeof materialsError.message === "string" &&
    (materialsError.message.includes("department") ||
      materialsError.message.includes("storage_type"))
  ) {
    const fallback = await supabase
      .from("purchasing_materials")
      .select(
        "id, item_code, name, lbs_per_case, lead_time_days, thaw_buffer_days, is_protein"
      );
    materials = (fallback.data ?? []) as MaterialRow[];
    materialsError = fallback.error;
  }

  const firstError = importRes.error ?? materialsError ?? inventoryRes.error;
  if (firstError) {
    return { ok: false, message: `Loading data failed: ${firstError.message}` };
  }
  if (!importRes.data) {
    return { ok: false, message: "Import not found." };
  }

  const importStats = (importRes.data.stats ?? {}) as {
    master_po_lines?: StoredMasterPoLine[];
    produce_item_codes?: string[];
  };
  const produceCodes = new Set(
    (importStats.produce_item_codes ?? []).map((code) => code.toUpperCase())
  );
  const masterPoLines = (importStats.master_po_lines ?? []).filter((line) => {
    const dept = (line.department ?? "").trim().toUpperCase();
    const type = (line.type ?? "").trim().toUpperCase();
    if (type === "PRODUCE") return false;
    if (dept === "PRODUCE" || dept.startsWith("PRODUCE ")) return false;
    if (produceCodes.has(line.itemCode.toUpperCase())) return false;
    return true;
  });
  if (masterPoLines.length === 0) {
    return {
      ok: false,
      message:
        "This import has no MASTER PO# snapshot. Re-import the master .xlsm after Excel has calculated Master PO.",
    };
  }

  function isProduceMaterial(material: MaterialRow) {
    if (material.storage_type === "produce") return true;
    const dept = (material.department ?? "").trim().toUpperCase();
    if (dept === "PRODUCE" || dept.startsWith("PRODUCE ")) return true;
    if (produceCodes.has(material.item_code.toUpperCase())) return true;
    return false;
  }

  const materialByCode = new Map(materials.map((m) => [m.item_code, m]));
  const materialByCodeUpper = new Map(
    materials.map((m) => [m.item_code.toUpperCase(), m])
  );

  function findMaterial(line: StoredMasterPoLine) {
    // Never trust item_code alone — Excel and Odoo reuse codes for different products
    // (e.g. 510064 Gouda vs chocolate wafers).
    const byCode =
      materialByCode.get(line.itemCode) ??
      materialByCodeUpper.get(line.itemCode.toUpperCase());
    if (
      byCode &&
      !isProduceMaterial(byCode) &&
      ingredientMatchesMaterial(line.name, byCode.name)
    ) {
      return byCode;
    }

    const key = normalizeIngredientName(line.name);
    for (const material of materials) {
      if (isProduceMaterial(material)) continue;
      if (normalizeIngredientName(material.name) === key) return material;
    }
    for (const material of materials) {
      if (isProduceMaterial(material)) continue;
      if (ingredientMatchesMaterial(line.name, material.name)) return material;
    }
    return null;
  }

  const extraPct = Number(input.extraPercent);
  const extraFactor =
    Number.isFinite(extraPct) && extraPct > 0 ? 1 + extraPct / 100 : 1;

  const { data: existingCycles, error: cyclesError } = await supabase
    .from("purchasing_cycles")
    .select("id, required_date, po_number, status");
  if (cyclesError) {
    return { ok: false, message: `Loading cycles failed: ${cyclesError.message}` };
  }

  let cycle = (existingCycles ?? []).find(
    (row) => row.required_date === input.requiredDate
  );
  if (!cycle) {
    const nextPo =
      Math.max(0, ...(existingCycles ?? []).map((row) => row.po_number ?? 0)) + 1;
    const { data: created, error: createError } = await supabase
      .from("purchasing_cycles")
      .insert({
        po_number: nextPo,
        required_date: input.requiredDate,
        week_label: `${input.fromDate} to ${input.toDate}`,
        status: "in_progress",
        import_id: input.importId,
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
        import_id: input.importId,
        week_label: `${input.fromDate} to ${input.toDate}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cycle.id);
  }

  const onHand = new Map<string, number>(
    (inventoryRes.data ?? []).map((row) => [row.material_id, row.qty_on_hand])
  );

  const earlierOpenCycleIds = (existingCycles ?? [])
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
      return {
        ok: false,
        message: `Loading earlier cycles failed: ${earlierError.message}`,
      };
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
  let existingLines: ExistingLine[] = [];
  {
    const withArrived = await supabase
      .from("purchasing_lines")
      .select(
        "id, material_id, status, arrival_date, arrived_at, notes, is_emergency, required_time"
      )
      .eq("cycle_id", cycle.id);
    if (
      withArrived.error &&
      typeof withArrived.error.message === "string" &&
      withArrived.error.message.includes("arrived_at")
    ) {
      const withoutArrived = await supabase
        .from("purchasing_lines")
        .select(
          "id, material_id, status, arrival_date, notes, is_emergency, required_time"
        )
        .eq("cycle_id", cycle.id);
      if (withoutArrived.error) {
        return {
          ok: false,
          message: `Loading existing lines failed: ${withoutArrived.error.message}`,
        };
      }
      existingLines = (withoutArrived.data ?? []).map((line) => ({
        ...line,
        arrived_at: null,
      })) as ExistingLine[];
    } else if (withArrived.error) {
      return {
        ok: false,
        message: `Loading existing lines failed: ${withArrived.error.message}`,
      };
    } else {
      existingLines = (withArrived.data ?? []) as ExistingLine[];
    }
  }
  const existingByMaterial = new Map(
    existingLines.map((line) => [line.material_id, line])
  );

  const { error: deleteError } = await supabase
    .from("purchasing_lines")
    .delete()
    .eq("cycle_id", cycle.id)
    .eq("is_emergency", false);
  if (deleteError) {
    return { ok: false, message: `Clearing old lines failed: ${deleteError.message}` };
  }

  const linesWithoutSpec: string[] = [];
  const droppedWithoutMaterial: string[] = [];
  const now = new Date().toISOString();
  const requiredDate = new Date(`${input.requiredDate}T00:00:00`);

  type BuyLine = {
    cycle_id: string;
    material_id: string;
    cases_required: number;
    lbs_required: number | null;
    on_hand_cases: number | null;
    required_to_order: number;
    order_by_date: string;
    is_emergency: boolean;
    updated_by: string;
    created_at: string;
    updated_at: string;
    status?: string;
    arrival_date?: string | null;
    arrived_at?: string | null;
    notes?: string | null;
  };

  // Multiple Excel item codes can resolve to one Odoo material — merge so
  // upsert does not hit the same (cycle_id, material_id) twice.
  const mergedByMaterial = new Map<string, BuyLine>();
  const departmentUpdates = new Map<string, string>();

  for (const poLine of masterPoLines) {
    const material = findMaterial(poLine);
    if (!material) {
      droppedWithoutMaterial.push(`${poLine.itemCode} ${poLine.name}`);
      continue;
    }

    const dept = (poLine.department ?? "").trim();
    if (dept && dept.toUpperCase() !== "OTHER") {
      departmentUpdates.set(material.id, dept);
    }

    let casesRequired = Math.ceil(poLine.casesNeeded * extraFactor);
    const lbs = poLine.lbsNeeded > 0 ? poLine.lbsNeeded * extraFactor : 0;
    if (casesRequired <= 0 && lbs > 0) {
      const weight =
        (poLine.productWeight && poLine.productWeight > 0
          ? poLine.productWeight
          : null) ?? material.lbs_per_case;
      if (weight && weight > 0) {
        casesRequired = Math.ceil(lbs / weight);
      } else {
        casesRequired = Math.ceil(lbs);
        linesWithoutSpec.push(`${material.item_code} ${material.name}`);
      }
    }
    if (casesRequired <= 0) continue;

    const existing = mergedByMaterial.get(material.id);
    if (existing) {
      existing.cases_required += casesRequired;
      const totalLbs = (existing.lbs_required ?? 0) + lbs;
      existing.lbs_required = totalLbs > 0 ? totalLbs : null;
      continue;
    }

    const bufferDays =
      material.lead_time_days + (material.is_protein ? material.thaw_buffer_days : 0);
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

    mergedByMaterial.set(material.id, {
      cycle_id: cycle.id,
      material_id: material.id,
      cases_required: casesRequired,
      lbs_required: lbs > 0 ? lbs : null,
      on_hand_cases: onHand.get(material.id) ?? null,
      required_to_order: 0,
      order_by_date: orderByDate,
      is_emergency: false,
      updated_by: user.id,
      created_at: now,
      updated_at: now,
      ...carryOver,
    });
  }

  const newLines = [...mergedByMaterial.values()].map((line) => {
    const need = line.cases_required;
    const before = earlierNeed.get(line.material_id) ?? 0;
    const available = onHand.get(line.material_id) ?? 0;
    return {
      ...line,
      required_to_order: Math.min(need, Math.max(0, before + need - available)),
    };
  });

  for (let i = 0; i < newLines.length; i += CHUNK_SIZE) {
    const chunk = newLines.slice(i, i + CHUNK_SIZE);
    let { error } = await supabase
      .from("purchasing_lines")
      .upsert(chunk, { onConflict: "cycle_id,material_id" });
    if (error && error.message.includes("arrived_at")) {
      const withoutArrived = chunk.map(({ arrived_at: _a, ...rest }) => rest);
      const retry = await supabase
        .from("purchasing_lines")
        .upsert(withoutArrived, { onConflict: "cycle_id,material_id" });
      error = retry.error;
    }
    if (error) {
      return { ok: false, message: `Saving buy lines failed: ${error.message}` };
    }
  }

  // Stamp Master PO departments onto materials so filters/grouping stay correct.
  for (const [materialId, department] of departmentUpdates) {
    const { error } = await supabase
      .from("purchasing_materials")
      .update({ department, updated_at: now })
      .eq("id", materialId);
    if (
      error &&
      typeof error.message === "string" &&
      !error.message.includes("department")
    ) {
      return {
        ok: false,
        message: `Saving material departments failed: ${error.message}`,
      };
    }
  }

  revalidatePath("/purchasing");

  return {
    ok: true,
    message: `Master PO for ${input.requiredDate} (production ${input.fromDate} to ${input.toDate}): ${newLines.length} lines from Excel MASTER PO#${
      droppedWithoutMaterial.length > 0
        ? `, ${droppedWithoutMaterial.length} codes missing from Odoo materials`
        : ""
    }.`,
    cycleId: cycle.id,
    linesCreated: newLines.length,
    linesWithoutSpec,
    unresolved: [],
    warnings: [
      ...(droppedWithoutMaterial.length > 0
        ? [
            `No Odoo material for: ${droppedWithoutMaterial.slice(0, 8).join("; ")}${
              droppedWithoutMaterial.length > 8 ? "…" : ""
            }`,
          ]
        : []),
    ],
  };
}

export type RemoveImportResult = {
  ok: boolean;
  message: string;
  removedFileName?: string;
  nextImport?: {
    id: string;
    fileName: string;
    scheduleFrom: string | null;
    scheduleTo: string | null;
  } | null;
};

/**
 * Remove every master plan import and schedule. Existing purchase weeks are
 * kept (their import_id is cleared). Recipes/materials are not touched.
 */
export async function removeMasterImport(
  importId: string
): Promise<RemoveImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("purchasing_master_imports")
    .select("id, file_name")
    .eq("id", importId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  const removedFileName = (existing?.file_name as string | undefined) ?? null;

  const { data: allImports, error: listError } = await supabase
    .from("purchasing_master_imports")
    .select("id");

  if (listError) {
    return { ok: false, message: listError.message };
  }

  const ids = (allImports ?? []).map((row) => row.id as string);
  if (ids.length === 0) {
    revalidatePath("/purchasing");
    return {
      ok: true,
      message: "Plan already removed.",
      nextImport: null,
    };
  }

  // Clear FK on every week so import rows can be deleted.
  const unlink = await supabase
    .from("purchasing_cycles")
    .update({ import_id: null })
    .not("import_id", "is", null);

  if (unlink.error) {
    console.error("Failed to unlink cycles from import:", unlink.error);
    return { ok: false, message: unlink.error.message };
  }

  const scheduleDelete = await supabase
    .from("purchasing_schedule_entries")
    .delete()
    .in("import_id", ids);

  if (scheduleDelete.error) {
    console.error("Failed to delete schedule entries:", scheduleDelete.error);
    return { ok: false, message: scheduleDelete.error.message };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("purchasing_master_imports")
    .delete()
    .in("id", ids)
    .select("id");

  if (deleteError) {
    console.error("Failed to delete master import:", deleteError);
    return {
      ok: false,
      message:
        deleteError.code === "42501"
          ? "Delete is not allowed. Check purchasing_master_imports delete policy in Supabase."
          : deleteError.message,
    };
  }

  if (!deleted?.length) {
    return {
      ok: false,
      message:
        "Plan was not deleted (0 rows). Confirm the purchasing_master_imports delete policy exists in Supabase.",
    };
  }

  revalidatePath("/purchasing");

  return {
    ok: true,
    message:
      deleted.length > 1
        ? `Removed ${deleted.length} imported plans${
            removedFileName ? ` (including ${removedFileName})` : ""
          }. You can import a new plan.`
        : `Removed ${removedFileName ?? "plan"}. You can import a new plan.`,
    removedFileName: removedFileName ?? undefined,
    nextImport: null,
  };
}
