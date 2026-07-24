// Parser for the "MASTER FRESH - PRODUCTION" planning workbook (.xlsm).
//
// Extracts three things:
//  1. INGREDIENT MATRIX  -> item master rows (materials + WIP subrecipes)
//  2. Department sheets  -> recipe blocks (BOM lines with quantities/yields)
//  3. PRODUCTION SCHEDULE -> planned quantity per recipe per day
//
// Two recipe layouts exist:
//  - Batch recipes (MAIN KITCHEN, FRESH MIXING, GARDE MANGER, PRODUCE):
//    ingredient quantities are parts of a batch; the INSTRUCTIONS row holds
//    the batch total. Requirement per output lb = qty / batchTotal.
//  - Per-unit recipes (ASSEMBLY per bowl, FINISHED PRODUCT per case):
//    ingredient quantities are per single output unit, with a loss/yield %.

import * as XLSX from "xlsx";

export type MatrixItemKind = "ingredient" | "produce" | "subrecipe";

export type ParsedMatrixItem = {
  itemCode: string;
  name: string;
  kind: MatrixItemKind;
  storageType: "dry" | "refrigerated" | "frozen" | "produce" | null;
  weightLbsPerUnit: number | null;
  department: string | null;
};

export type ParsedRecipeLine = {
  ingredientName: string;
  quantity: number;
  uom: string | null;
  lossPct: number | null;
};

export type ParsedRecipe = {
  wipCode: string;
  name: string;
  department: string;
  sheetName: string;
  /** Batch total for batch recipes; null for per-unit recipes. */
  batchSize: number | null;
  lines: ParsedRecipeLine[];
};

export type ParsedScheduleEntry = {
  wipCode: string;
  recipeName: string;
  department: string;
  /** ISO date yyyy-mm-dd */
  date: string;
  quantity: number;
  uom: string | null;
};

export type ParsedMasterFile = {
  matrixItems: ParsedMatrixItem[];
  recipes: ParsedRecipe[];
  scheduleEntries: ParsedScheduleEntry[];
  warnings: string[];
};

const RECIPE_SHEETS = [
  "FINISHED PRODUCT",
  "ASSEMBLY",
  "FRESH MIXING",
  "MAIN KITCHEN",
  "GARDE MANGER",
  "PRODUCE",
];

const SCHEDULE_SHEET = "PRODUCTION SCHEDULE";
const MATRIX_SHEET = "INGREDIENT MATRIX";

/** Ingredient names that are never purchased and safe to skip. */
const IGNORED_INGREDIENTS = new Set(["WATER", "ICE", "HOT WATER", "COLD WATER"]);

export function normalizeIngredientName(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

export function isIgnoredIngredient(name: string): boolean {
  return IGNORED_INGREDIENTS.has(normalizeIngredientName(name));
}

function toRows(workbook: XLSX.WorkBook, sheetName: string): string[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as string[][];
}

function cellText(row: string[] | undefined, col: number): string {
  if (!row) return "";
  return String(row[col] ?? "").trim();
}

function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseDateText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Excel serial date (days since 1899-12-30), when sheet exports a bare number.
  const serial = Number(trimmed.replace(/,/g, ""));
  if (Number.isFinite(serial) && serial > 20000 && serial < 100000) {
    const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
    const date = new Date(utc);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function parseMatrix(workbook: XLSX.WorkBook, warnings: string[]): ParsedMatrixItem[] {
  const rows = toRows(workbook, MATRIX_SHEET);
  if (rows.length === 0) {
    warnings.push(`Sheet "${MATRIX_SHEET}" not found.`);
    return [];
  }

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => String(cell).trim().toUpperCase() === "ITEM OR WIP #")
  );
  if (headerIndex === -1) {
    warnings.push(`Header row not found in "${MATRIX_SHEET}".`);
    return [];
  }

  const header = rows[headerIndex].map((cell) => String(cell).trim().toUpperCase());
  const col = (label: string) => header.findIndex((cell) => cell.startsWith(label));
  const codeCol = col("ITEM OR WIP #");
  const nameCol = col("PRODUCT NAME");
  const deptCol = col("DEPARTMENT");
  const kindCol = col("INGREDIENT OR SUBRECIPE");
  const storageCol = col("STORAGE LOCATION");
  const weightCol = col("PRODUCT WEIGHT");

  const items: ParsedMatrixItem[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const itemCode = cellText(row, codeCol);
    const rawKind = cellText(row, kindCol).toLowerCase();
    if (!itemCode || !rawKind) continue;

    let kind: MatrixItemKind;
    if (rawKind === "subrecipe") kind = "subrecipe";
    else if (rawKind === "produce") kind = "produce";
    else if (rawKind === "ingredient") kind = "ingredient";
    else continue;

    const storageRaw = cellText(row, storageCol).toLowerCase();
    const storageType =
      kind === "produce"
        ? ("produce" as const)
        : storageRaw === "dry" || storageRaw === "refrigerated" || storageRaw === "frozen"
          ? (storageRaw as "dry" | "refrigerated" | "frozen")
          : null;

    items.push({
      itemCode,
      name: cellText(row, nameCol),
      kind,
      storageType,
      weightLbsPerUnit: parseNumeric(cellText(row, weightCol)),
      department: cellText(row, deptCol) || null,
    });
  }

  return items;
}

function parseLossPct(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (!match) return null;
  return Number(match[1]);
}

function parseRecipeSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  warnings: string[]
): ParsedRecipe[] {
  const rows = toRows(workbook, sheetName);
  const recipes: ParsedRecipe[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const labelCol = row.findIndex(
      (cell) => String(cell).trim().toUpperCase() === "RECIPE NAME"
    );
    if (labelCol === -1) continue;

    const name = cellText(row, labelCol + 1);
    if (!name || /template/i.test(name)) continue;

    // Locate DEPARTMENT / WIP # rows within the block header.
    let department = "";
    let wipCode = "";
    for (let k = 1; k <= 5 && r + k < rows.length; k++) {
      const label = cellText(rows[r + k], labelCol).toUpperCase();
      if (label === "DEPARTMENT") department = cellText(rows[r + k], labelCol + 1);
      if (label === "WIP #") wipCode = cellText(rows[r + k], labelCol + 1);
    }
    if (!wipCode || /enter information/i.test(wipCode)) continue;

    // Locate the ingredient table header row.
    let headerRowIndex = -1;
    for (let k = 1; k <= 7 && r + k < rows.length; k++) {
      if (
        rows[r + k].some((cell) =>
          String(cell).trim().toUpperCase().startsWith("INGREDIENT - MATERIAL")
        )
      ) {
        headerRowIndex = r + k;
        break;
      }
    }
    if (headerRowIndex === -1) {
      warnings.push(`Recipe "${name}" (${sheetName}): ingredient header not found.`);
      continue;
    }

    const header = rows[headerRowIndex].map((cell) => String(cell).trim().toUpperCase());
    const nameCol = header.findIndex((cell) => cell.startsWith("INGREDIENT - MATERIAL"));
    const lossCol = header.findIndex(
      (cell) => cell.startsWith("LOSS") || cell === "YEILD" || cell === "YIELD"
    );
    const isPerUnit = lossCol !== -1;

    let qtyCol: number;
    let uomCol: number;
    if (isPerUnit) {
      qtyCol = nameCol + 1;
      uomCol = header.findIndex((cell, index) => index > qtyCol && cell === "U/M");
    } else {
      // Batch layout: original recipe quantity is the first QTY column in the
      // right-hand "ORIGINAL RECIPE" section (followed by its U/M column).
      qtyCol = header.findIndex(
        (cell, index) => index > nameCol + 4 && cell.startsWith("QTY")
      );
      uomCol = qtyCol + 1;
    }
    if (qtyCol <= 0) {
      warnings.push(`Recipe "${name}" (${sheetName}): quantity column not found.`);
      continue;
    }

    const lines: ParsedRecipeLine[] = [];
    let batchSize: number | null = null;

    for (let k = headerRowIndex + 1; k < rows.length; k++) {
      const lineRow = rows[k];
      const ingredientName = cellText(lineRow, nameCol);
      const upperName = ingredientName.toUpperCase();
      // The batch-total row usually has "INSTRUCTIONS" in the name column, but
      // some recipes rename it (e.g. INSTRUCTIONS FOR 3/4"); the reliable
      // marker is "TOTAL" in the U/M column of the original-recipe section.
      const isTotalRow =
        upperName === "INSTRUCTIONS" ||
        cellText(lineRow, uomCol).toUpperCase() === "TOTAL";
      if (isTotalRow) {
        if (!isPerUnit) batchSize = parseNumeric(cellText(lineRow, qtyCol));
        break;
      }
      if (upperName.startsWith("INSTRUCTION")) continue;
      // Safety stop if a new block begins before INSTRUCTIONS was found.
      if (cellText(lineRow, labelCol).toUpperCase() === "RECIPE NAME") break;
      if (!ingredientName) continue;

      const quantity = parseNumeric(cellText(lineRow, qtyCol));
      if (quantity === null || quantity <= 0) continue;
      if (isIgnoredIngredient(ingredientName)) continue;

      lines.push({
        ingredientName,
        quantity,
        uom: cellText(lineRow, uomCol) || null,
        lossPct: isPerUnit ? parseLossPct(cellText(lineRow, lossCol)) : null,
      });
    }

    if (!isPerUnit && batchSize === null) {
      batchSize = lines.reduce((sum, line) => sum + line.quantity, 0) || null;
    }

    if (lines.length > 0) {
      recipes.push({
        wipCode,
        name,
        department: department || sheetName,
        sheetName,
        batchSize: isPerUnit ? null : batchSize,
        lines,
      });
    }
  }

  return recipes;
}

function parseDepartmentScheduleOverlay(
  workbook: XLSX.WorkBook,
  warnings: string[]
): Map<string, number> {
  // PRODUCTION SCHEDULE Finished/Kitchen cells are often formulas that pull from
  // "{DEPARTMENT} SCHEDULE". xlsx cannot evaluate those (cached #VALUE!), so we
  // read the department sheets directly and fill missing quantities.
  const overlay = new Map<string, number>();

  for (const sheetName of workbook.SheetNames) {
    if (!/ schedule$/i.test(sheetName)) continue;
    if (/^(production|initial) schedule$/i.test(sheetName.trim())) continue;

    const rows = toRows(workbook, sheetName);
    if (rows.length === 0) continue;

    const headerIndex = rows.findIndex((row) => {
      const cells = row.map((cell) => String(cell).trim().toUpperCase());
      return (
        cells.includes("ITEM #") ||
        (cells.includes("RECIPE") && cells.includes("DEPARTMENT"))
      );
    });
    if (headerIndex === -1) {
      warnings.push(`Header row not found in "${sheetName}".`);
      continue;
    }

    const header = rows[headerIndex].map((cell) =>
      String(cell).trim().toUpperCase()
    );
    const deptCol = header.indexOf("DEPARTMENT");
    const codeCol = header.indexOf("ITEM #");
    const recipeCol = header.indexOf("RECIPE");
    const deptFromSheet = sheetName.replace(/\s+SCHEDULE$/i, "").trim();

    let dateByCol = new Map<number, string>();
    for (
      let r = Math.max(0, headerIndex - 5);
      r <= headerIndex;
      r++
    ) {
      const candidate = new Map<number, string>();
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const isoDate = parseDateText(String(row[c] ?? ""));
        if (isoDate) candidate.set(c, isoDate);
      }
      if (candidate.size > dateByCol.size) dateByCol = candidate;
    }
    if (dateByCol.size === 0) {
      warnings.push(`No schedule dates found in "${sheetName}".`);
      continue;
    }

    let qtyCells = 0;
    for (const row of rows.slice(headerIndex + 1)) {
      const department =
        (deptCol >= 0 ? cellText(row, deptCol) : "") || deptFromSheet;
      const wipCode = codeCol >= 0 ? cellText(row, codeCol) : "";
      const recipeName = recipeCol >= 0 ? cellText(row, recipeCol) : "";
      if (!wipCode && !recipeName) continue;

      for (const [col, date] of dateByCol) {
        const quantity = parseNumeric(cellText(row, col));
        if (quantity === null || quantity <= 0) continue;
        qtyCells += 1;
        if (wipCode) {
          overlay.set(
            `${department.toUpperCase()}||${wipCode.toUpperCase()}||${date}`,
            quantity
          );
        }
        if (recipeName) {
          overlay.set(
            `${department.toUpperCase()}||${normalizeIngredientName(recipeName)}||${date}`,
            quantity
          );
        }
      }
    }

    if (qtyCells === 0) {
      warnings.push(`No quantities found in "${sheetName}".`);
    }
  }

  return overlay;
}

function parseSchedule(
  workbook: XLSX.WorkBook,
  warnings: string[]
): ParsedScheduleEntry[] {
  const rows = toRows(workbook, SCHEDULE_SHEET);
  if (rows.length === 0) {
    warnings.push(`Sheet "${SCHEDULE_SHEET}" not found.`);
    return [];
  }

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => String(cell).trim().toUpperCase() === "ITEM #")
  );
  if (headerIndex === -1) {
    warnings.push(`Header row not found in "${SCHEDULE_SHEET}".`);
    return [];
  }

  const header = rows[headerIndex].map((cell) => String(cell).trim().toUpperCase());
  const deptCol = header.indexOf("DEPARTMENT");
  const codeCol = header.indexOf("ITEM #");
  const recipeCol = header.indexOf("RECIPE");
  const uomCol = header.indexOf("U/M");

  // Dates live on the row above the header, aligned per column.
  const dateRow = rows[headerIndex - 1] ?? [];
  const dateByCol = new Map<number, string>();
  for (let c = Math.max(0, uomCol + 1); c < dateRow.length; c++) {
    const isoDate = parseDateText(String(dateRow[c] ?? ""));
    if (isoDate) dateByCol.set(c, isoDate);
  }
  if (dateByCol.size === 0) {
    // Some files put dates a few rows above the ITEM # header.
    for (let r = Math.max(0, headerIndex - 5); r < headerIndex; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const isoDate = parseDateText(String(row[c] ?? ""));
        if (isoDate) dateByCol.set(c, isoDate);
      }
      if (dateByCol.size > 0) break;
    }
  }
  if (dateByCol.size === 0) {
    warnings.push(`No schedule dates found in "${SCHEDULE_SHEET}".`);
    return [];
  }

  const overlay = parseDepartmentScheduleOverlay(workbook, warnings);
  let filledFromOverlay = 0;

  const entries: ParsedScheduleEntry[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const wipCode = cellText(row, codeCol);
    if (!wipCode) continue;
    const recipeName = cellText(row, recipeCol);
    const department = cellText(row, deptCol);
    const deptKey = department.toUpperCase();

    for (const [col, date] of dateByCol) {
      let quantity = parseNumeric(cellText(row, col));
      if (quantity === null || quantity <= 0) {
        const byCode = overlay.get(`${deptKey}||${wipCode.toUpperCase()}||${date}`);
        const byName = recipeName
          ? overlay.get(
              `${deptKey}||${normalizeIngredientName(recipeName)}||${date}`
            )
          : undefined;
        quantity = byCode ?? byName ?? null;
        if (quantity != null && quantity > 0) filledFromOverlay += 1;
      }
      if (quantity === null || quantity <= 0) continue;
      entries.push({
        wipCode,
        recipeName,
        department,
        date,
        quantity,
        uom: cellText(row, uomCol) || null,
      });
    }
  }

  if (filledFromOverlay > 0) {
    warnings.push(
      `Filled ${filledFromOverlay} schedule quantities from department schedule sheets (Excel formulas are not readable from the file).`
    );
  }

  return entries;
}

export function parseMasterWorkbook(workbook: XLSX.WorkBook): ParsedMasterFile {
  const warnings: string[] = [];
  const matrixItems = parseMatrix(workbook, warnings);
  const scheduleEntries = parseSchedule(workbook, warnings);

  const recipes: ParsedRecipe[] = [];
  const seenWipCodes = new Set<string>();
  for (const sheetName of RECIPE_SHEETS) {
    if (!workbook.Sheets[sheetName]) {
      warnings.push(`Recipe sheet "${sheetName}" not found.`);
      continue;
    }
    for (const recipe of parseRecipeSheet(workbook, sheetName, warnings)) {
      if (seenWipCodes.has(recipe.wipCode)) continue;
      seenWipCodes.add(recipe.wipCode);
      recipes.push(recipe);
    }
  }

  return { matrixItems, recipes, scheduleEntries, warnings };
}

export function parseMasterFile(buffer: Uint8Array): ParsedMasterFile {
  const workbook = XLSX.read(buffer, { type: "array" });
  return parseMasterWorkbook(workbook);
}
