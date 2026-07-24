"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeIngredientName,
  parseMasterWorkbook,
  type ParsedRecipe,
} from "@/lib/purchasing/master-parser";
import { buildResolver, computeRequirements } from "@/lib/purchasing/mrp";

const CHUNK_SIZE = 500;

export type ImportResult = {
  ok: boolean;
  message: string;
  importId?: string;
  stats?: {
    recipes: number;
    recipeLines: number;
    scheduleEntries: number;
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
  const materialIdByCode = new Map(
    (materialRows ?? []).map((row) => [row.item_code, row.id])
  );

  const aliasRows: { alias: string; material_id: string }[] = [];
  const seenAliases = new Set<string>();
  for (const item of parsed.matrixItems) {
    if (item.kind === "subrecipe") continue;
    const materialId = materialIdByCode.get(item.itemCode);
    const alias = normalizeIngredientName(item.name);
    if (!materialId || !alias || seenAliases.has(alias)) continue;
    seenAliases.add(alias);
    aliasRows.push({ alias, material_id: materialId });
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
  }));
  for (let i = 0; i < scheduleRows.length; i += CHUNK_SIZE) {
    const chunk = scheduleRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("purchasing_schedule_entries").insert(chunk);
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
      scheduleFrom,
      scheduleTo,
    },
    warnings: parsed.warnings,
  };
}

type DbRecipe = {
  id: string;
  wip_code: string;
  name: string;
  department: string | null;
  batch_size: number | null;
};

type DbRecipeLine = {
  recipe_id: string;
  material_id: string | null;
  sub_recipe_id: string | null;
  ingredient_name: string;
  quantity: number;
  uom: string | null;
  loss_pct: number | null;
  sort_order: number;
};

/**
 * Generate (or regenerate) the buy list for a purchase cycle from an import.
 * Nets requirements against on-hand inventory cumulatively across open
 * cycles ordered by required date — same math as the legacy spreadsheet.
 */
export async function generateCycle(input: {
  importId: string;
  requiredDate: string;
  fromDate: string;
  toDate: string;
}): Promise<GenerateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to generate a cycle." };
  }

  const [recipesRes, linesRes, scheduleRes, materialsRes, aliasesRes, inventoryRes] =
    await Promise.all([
      supabase
        .from("purchasing_recipes")
        .select("id, wip_code, name, department, batch_size"),
      supabase
        .from("purchasing_recipe_lines")
        .select(
          "recipe_id, material_id, sub_recipe_id, ingredient_name, quantity, uom, loss_pct, sort_order"
        ),
      supabase
        .from("purchasing_schedule_entries")
        .select("wip_code, schedule_date, quantity, uom")
        .eq("import_id", input.importId)
        .gte("schedule_date", input.fromDate)
        .lte("schedule_date", input.toDate),
      supabase
        .from("purchasing_materials")
        .select("id, item_code, name, lbs_per_case, lead_time_days, thaw_buffer_days, is_protein"),
      supabase.from("purchasing_material_aliases").select("alias, material_id"),
      supabase
        .from("purchasing_current_inventory")
        .select("material_id, qty_on_hand"),
    ]);

  const firstError =
    recipesRes.error ?? linesRes.error ?? scheduleRes.error ?? materialsRes.error ??
    aliasesRes.error ?? inventoryRes.error;
  if (firstError) {
    return { ok: false, message: `Loading data failed: ${firstError.message}` };
  }

  const dbRecipes = (recipesRes.data ?? []) as DbRecipe[];
  const dbLines = (linesRes.data ?? []) as DbRecipeLine[];
  const materials = materialsRes.data ?? [];
  const scheduleEntries = scheduleRes.data ?? [];

  if (scheduleEntries.length === 0) {
    return {
      ok: false,
      message: "No scheduled production found in that date range for this import.",
    };
  }

  // Rebuild in-memory recipes for the MRP engine.
  const linesByRecipe = new Map<string, DbRecipeLine[]>();
  for (const line of dbLines) {
    const list = linesByRecipe.get(line.recipe_id) ?? [];
    list.push(line);
    linesByRecipe.set(line.recipe_id, list);
  }
  const recipes: ParsedRecipe[] = dbRecipes.map((recipe) => ({
    wipCode: recipe.wip_code,
    name: recipe.name,
    department: recipe.department ?? "",
    sheetName: recipe.department ?? "",
    batchSize: recipe.batch_size,
    lines: (linesByRecipe.get(recipe.id) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => ({
        ingredientName: line.ingredient_name,
        quantity: line.quantity,
        uom: line.uom,
        lossPct: line.loss_pct,
      })),
  }));

  const recipeNames = new Map<string, string>();
  for (const recipe of recipes) {
    recipeNames.set(normalizeIngredientName(recipe.name), recipe.wipCode);
  }
  const materialByCode = new Map(materials.map((m) => [m.item_code, m]));
  const materialNames = new Map<string, string>();
  for (const material of materials) {
    materialNames.set(normalizeIngredientName(material.name), material.item_code);
  }
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const aliases = new Map<string, string>();
  for (const alias of aliasesRes.data ?? []) {
    const material = materialById.get(alias.material_id);
    if (material) aliases.set(normalizeIngredientName(alias.alias), material.item_code);
  }

  // Resolutions stored on BOM lines at import time take precedence: they carry
  // the INGREDIENT MATRIX name->code knowledge from the master file itself.
  const wipByRecipeId = new Map(dbRecipes.map((recipe) => [recipe.id, recipe.wip_code]));
  for (const line of dbLines) {
    const key = normalizeIngredientName(line.ingredient_name);
    if (line.sub_recipe_id) {
      const wip = wipByRecipeId.get(line.sub_recipe_id);
      if (wip) recipeNames.set(key, wip);
    } else if (line.material_id) {
      const material = materialById.get(line.material_id);
      if (material) aliases.set(key, material.item_code);
    }
  }

  const resolve = buildResolver({ recipes, recipeNames, materialNames, aliases });
  const mrp = computeRequirements(
    recipes,
    scheduleEntries.map((entry) => ({
      wipCode: entry.wip_code,
      recipeName: "",
      department: "",
      date: entry.schedule_date,
      quantity: entry.quantity,
      uom: entry.uom,
    })),
    resolve
  );

  // Upsert the cycle for this required date.
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

  // On-hand netting: cumulative across earlier open cycles.
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
      return { ok: false, message: `Loading earlier cycles failed: ${earlierError.message}` };
    }
    for (const line of earlierLines ?? []) {
      earlierNeed.set(
        line.material_id,
        (earlierNeed.get(line.material_id) ?? 0) + (line.cases_required ?? 0)
      );
    }
  }

  // Preserve purchasing progress on regeneration.
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
  const now = new Date().toISOString();
  const requiredDate = new Date(`${input.requiredDate}T00:00:00`);

  const newLines = [...mrp.requirements.values()]
    .map((requirement) => {
      const material = materialByCode.get(requirement.itemCode);
      if (!material) return null;

      const rawQty = requirement.totalLbs > 0 ? requirement.totalLbs : requirement.totalUnits;
      let casesRequired: number;
      if (material.lbs_per_case && material.lbs_per_case > 0) {
        casesRequired = Math.ceil(rawQty / material.lbs_per_case);
      } else {
        casesRequired = Math.ceil(rawQty);
        linesWithoutSpec.push(`${material.item_code} ${material.name}`);
      }
      if (casesRequired <= 0) return null;

      const bufferDays =
        material.lead_time_days + (material.is_protein ? material.thaw_buffer_days : 0);
      const orderBy = new Date(requiredDate);
      orderBy.setDate(orderBy.getDate() - bufferDays);
      const orderByDate = orderBy.toISOString().slice(0, 10);

      const need = casesRequired;
      const before = earlierNeed.get(material.id) ?? 0;
      const available = onHand.get(material.id) ?? 0;
      const requiredToOrder = Math.min(need, Math.max(0, before + need - available));

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

      return {
        cycle_id: cycle.id,
        material_id: material.id,
        cases_required: casesRequired,
        lbs_required: requirement.totalLbs > 0 ? requirement.totalLbs : null,
        on_hand_cases: onHand.get(material.id) ?? null,
        required_to_order: requiredToOrder,
        order_by_date: orderByDate,
        is_emergency: false,
        updated_by: user.id,
        created_at: now,
        updated_at: now,
        ...carryOver,
      };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null);

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

  revalidatePath("/purchasing");

  const unresolved: UnresolvedName[] = [...mrp.unresolved.values()].map((entry) => ({
    ingredientName: entry.ingredientName,
    totalLbs: entry.totalLbs,
    totalUnits: entry.totalUnits,
    recipes: [...entry.recipes],
  }));

  return {
    ok: true,
    message: `Cycle for ${input.requiredDate}: ${newLines.length} materials computed${
      unresolved.length > 0 ? `, ${unresolved.length} ingredient names need mapping` : ""
    }.`,
    cycleId: cycle.id,
    linesCreated: newLines.length,
    linesWithoutSpec,
    unresolved,
    warnings: mrp.warnings,
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
