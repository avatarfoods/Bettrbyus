// Parser for the "MASTER FRESH - PRODUCTION" planning workbook (.xlsm).
//
// Extracts three things:
//  1. INGREDIENT MATRIX  -> item master rows (materials + WIP subrecipes)
//  2. Department sheets  -> recipe blocks (BOM lines with quantities/yields)
//  3. PRODUCTION SCHEDULE -> planned quantity per recipe per day
//
// Two recipe layouts exist:
//  - Batch recipes (MAIN KITCHEN, FRESH MIXING, GARDE MANGER, PRODUCE):
//    Excel Component Usage (col AA) = scaledQty / BATCH_YIELD * demandLbs.
//    scaledQty is the "FINAL"/column-M amount = originalQty * desiredBatch / ingredientTotal.
//    We store quantity + batchSize so MRP uses the same ratio (qty / batchSize).
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

export type ParsedComponentUsage = {
  ingredientName: string;
  /** Matrix item code when known. */
  itemCode: string | null;
  /** Matrix department for Master PO grouping. */
  department: string | null;
  /** Sum of AA across recipe sheets (before EXTRA %). */
  lbs: number;
  /** Per-sheet contribution (for debugging). */
  bySheet: Record<string, number>;
};

/** One row of the MASTER PICKING ORDER table on Excel MASTER PO#. */
export type ParsedMasterPoLine = {
  itemCode: string;
  name: string;
  department: string;
  type: string;
  /** Excel G "QTY ORDER" — cases purchasing actually orders. 0 = nothing to buy. */
  qtyOrder: number;
  /** Excel H "SPECT CS" — units per case. */
  spectCs: number | null;
  /** LBS before EXTRA % (Excel R stripped of workbook EXTRA). */
  lbsNeeded: number;
  /** Cases before EXTRA % (Excel T stripped of workbook EXTRA). */
  casesNeeded: number;
  productWeight: number | null;
  /** Produce rows stay in the list; the UI decides whether to show them. */
  isProduce: boolean;
};

export type ParsedMasterFile = {
  matrixItems: ParsedMatrixItem[];
  recipes: ParsedRecipe[];
  scheduleEntries: ParsedScheduleEntry[];
  /** Snapshot of Excel MASTER PO# buy lines (source of truth for generate). */
  masterPoLines: ParsedMasterPoLine[];
  /** @deprecated Kept for older imports / offline checks. */
  componentUsage: ParsedComponentUsage[];
  componentUsageFrom: string | null;
  componentUsageTo: string | null;
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
const MASTER_PO_SHEET = "MASTER PO#";

/** Ingredient names that are never purchased and safe to skip. */
const IGNORED_INGREDIENTS = new Set(["WATER", "ICE", "HOT WATER", "COLD WATER"]);

/** Skip non-buy / notes rows. MIN/MAX is a real Master PO type in Excel — keep it. */
const MASTER_PO_SKIP_TYPES = new Set(["NOTES", "-", ""]);

function isProduceDepartment(department: string): boolean {
  const dept = department.trim().toUpperCase();
  return dept === "PRODUCE" || dept.startsWith("PRODUCE ");
}

function isProduceType(type: string): boolean {
  return type.trim().toUpperCase() === "PRODUCE";
}

export function normalizeIngredientName(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

export function isIgnoredIngredient(name: string): boolean {
  return IGNORED_INGREDIENTS.has(normalizeIngredientName(name));
}

/**
 * True when an Excel ingredient name and an Odoo material name refer to the
 * same thing. Used to reject matrix item-code collisions (e.g. master file
 * 510064 = Gouda, but Odoo 510064 = chocolate wafers).
 */
export function ingredientMatchesMaterial(
  ingredientName: string,
  materialName: string
): boolean {
  const a = normalizeIngredientName(ingredientName);
  const b = normalizeIngredientName(materialName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const stop = new Set(["THE", "AND", "FOR", "WITH", "FROM", "CT", "CS", "LB", "LBS"]);
  const tokens = (value: string) =>
    value
      .split(/[^A-Z0-9]+/)
      .filter((token) => token.length > 2 && !stop.has(token));

  const tokensA = new Set(tokens(a));
  const tokensB = tokens(b);
  if (tokensA.size === 0 || tokensB.length === 0) return false;
  const overlap = tokensB.filter((token) => tokensA.has(token)).length;
  return overlap >= 1;
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

    // Batch yield / desired batch sit on the RECIPE NAME row; labels are above.
    let desiredBatch: number | null = null;
    let batchYield: number | null = null;
    for (let up = 1; up <= 3 && r - up >= 0; up++) {
      const labelRow = rows[r - up];
      for (let c = 0; c < labelRow.length; c++) {
        const label = String(labelRow[c] ?? "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, " ");
        if (label.startsWith("DESIRED BATCH")) {
          desiredBatch = parseNumeric(cellText(row, c)) ?? desiredBatch;
        }
        if (label.startsWith("BATCH YEILD") || label.startsWith("BATCH YIELD")) {
          batchYield = parseNumeric(cellText(row, c)) ?? batchYield;
        }
      }
    }

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
    let scaledQtyCol = -1;
    if (isPerUnit) {
      qtyCol = nameCol + 1;
      uomCol = header.findIndex((cell, index) => index > qtyCol && cell === "U/M");
    } else {
      // Batch layout: original recipe quantity is the first QTY column in the
      // right-hand "ORIGINAL RECIPE" section (followed by its U/M column).
      // Excel Component Usage uses the next qty column (M) = original * desired/total.
      qtyCol = header.findIndex(
        (cell, index) => index > nameCol + 4 && cell.startsWith("QTY")
      );
      uomCol = qtyCol + 1;
      if (qtyCol >= 0) {
        const nextQty = header.findIndex(
          (cell, index) => index > uomCol && cell.startsWith("QTY")
        );
        scaledQtyCol = nextQty >= 0 ? nextQty : qtyCol + 2;
      }
    }
    if (qtyCol <= 0) {
      warnings.push(`Recipe "${name}" (${sheetName}): quantity column not found.`);
      continue;
    }

    const lines: ParsedRecipeLine[] = [];
    let ingredientTotal: number | null = null;
    let usedScaledQty = false;

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
        if (!isPerUnit) ingredientTotal = parseNumeric(cellText(lineRow, qtyCol));
        break;
      }
      if (upperName.startsWith("INSTRUCTION")) continue;
      // Safety stop if a new block begins before INSTRUCTIONS was found.
      if (cellText(lineRow, labelCol).toUpperCase() === "RECIPE NAME") break;
      if (!ingredientName) continue;

      const originalQty = parseNumeric(cellText(lineRow, qtyCol));
      if (originalQty === null || originalQty <= 0) continue;
      if (isIgnoredIngredient(ingredientName)) continue;

      // Prefer Excel's scaled qty (col M) when present — matches AA = M/P * demand.
      const scaledQty =
        !isPerUnit && scaledQtyCol >= 0
          ? parseNumeric(cellText(lineRow, scaledQtyCol))
          : null;
      let quantity = originalQty;
      if (scaledQty !== null && scaledQty > 0) {
        quantity = scaledQty;
        usedScaledQty = true;
      }

      lines.push({
        ingredientName,
        quantity,
        uom: cellText(lineRow, uomCol) || null,
        lossPct: isPerUnit ? parseLossPct(cellText(lineRow, lossCol)) : null,
      });
    }

    let batchSize: number | null = null;
    if (!isPerUnit) {
      // Excel: AA = M * (demand / BATCH_YIELD). Prefer yield as batchSize when
      // lines carry scaled M quantities. Otherwise rewrite ingredient total by
      // yield/desired so original qtys still produce M/P ratios.
      if (batchYield !== null && batchYield > 0 && usedScaledQty) {
        batchSize = batchYield;
      } else if (
        batchYield !== null &&
        batchYield > 0 &&
        ingredientTotal !== null &&
        ingredientTotal > 0 &&
        desiredBatch !== null &&
        desiredBatch > 0
      ) {
        batchSize = ingredientTotal * (batchYield / desiredBatch);
      } else if (batchYield !== null && batchYield > 0) {
        batchSize = batchYield;
      } else if (ingredientTotal !== null && ingredientTotal > 0) {
        batchSize = ingredientTotal;
      } else {
        batchSize = lines.reduce((sum, line) => sum + line.quantity, 0) || null;
      }
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

/**
 * Excel MASTER PO# Component Usage column R =
 *   SUMIF(each recipe sheet!C:C, itemName, AA:AA) * (1 + EXTRA%)
 *
 * Column AA on each department sheet is the pre-calculated ingredient lbs for
 * the Produce Schedule date window. Reading cached AA values is the only way
 * to match Excel exactly (Z/X formulas are circular across sheets).
 */
function parseComponentUsage(
  workbook: XLSX.WorkBook,
  matrixItems: ParsedMatrixItem[],
  warnings: string[]
): {
  usage: ParsedComponentUsage[];
  from: string | null;
  to: string | null;
} {
  const produceSchedule = workbook.Sheets["PRODUCE SCHEDULE"];
  const fromCell = produceSchedule?.["D3"];
  const toCell = produceSchedule?.["E3"];
  const cellToIso = (cell: XLSX.CellObject | undefined) => {
    if (!cell) return null;
    if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
    return parseDateText(String(cell.w ?? cell.v ?? ""));
  };
  const from = cellToIso(fromCell);
  const to = cellToIso(toCell) || from;

  const codeByName = new Map<string, string>();
  const deptByName = new Map<string, string>();
  for (const item of matrixItems) {
    if (item.kind === "subrecipe") continue;
    const key = normalizeIngredientName(item.name);
    codeByName.set(key, item.itemCode);
    if (item.department) deptByName.set(key, item.department);
  }

  const totals = new Map<
    string,
    { ingredientName: string; lbs: number; bySheet: Record<string, number> }
  >();

  for (const sheetName of RECIPE_SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    // Prefer raw numbers for AA; names as text.
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];

    for (const row of rows) {
      const name = String(row[2] ?? "").trim();
      if (!name) continue;
      const upper = name.toUpperCase();
      if (
        upper === "INGREDIENT - MATERIAL" ||
        upper === "RECIPE NAME" ||
        upper.startsWith("INSTRUCTION") ||
        upper === "TOTAL" ||
        upper === "NONE"
      ) {
        continue;
      }
      const aa = Number(row[26]);
      if (!Number.isFinite(aa) || aa === 0) continue;

      const key = normalizeIngredientName(name);
      // Skip recipe-title rows that aren't purchasable ingredients when they
      // have no matrix match and look like WIP headers — still sum if matrix hits.
      let entry = totals.get(key);
      if (!entry) {
        entry = { ingredientName: name, lbs: 0, bySheet: {} };
        totals.set(key, entry);
      }
      entry.lbs += aa;
      entry.bySheet[sheetName] = (entry.bySheet[sheetName] ?? 0) + aa;
    }
  }

  const usage: ParsedComponentUsage[] = [...totals.entries()]
    .map(([key, entry]) => ({
      ingredientName: entry.ingredientName,
      itemCode: codeByName.get(key) ?? null,
      department: deptByName.get(key) ?? null,
      lbs: entry.lbs,
      bySheet: entry.bySheet,
    }))
    .filter((row) => row.lbs > 0)
    .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));

  if (usage.length === 0) {
    // AA is optional debug data; MASTER PO# is the generate source of truth.
  } else if (from) {
    // Intentionally quiet — generate uses MASTER PO# snapshot, not AA.
  }

  return { usage, from, to };
}

/**
 * Read the MASTER PICKING ORDER table on Excel MASTER PO#.
 * Sheet range starts at column B, so sheet_to_json index 0 = Excel col B:
 *   B=TYPE, D=DEPT, E=CODE, F=ITEM, G=QTY ORDER, H=SPECT CS,
 *   R=LBS NEEDED, S=weight, T=CASES NEEDED
 *
 * Every table row is kept — QTY ORDER 0 still lists in TMS so purchasing sees
 * the full picking order. Excel R/T already include EXTRA (T2), stripped here.
 * Produce / Produce Raw rows are excluded (ordered separately).
 */
function parseMasterPoSheet(
  workbook: XLSX.WorkBook,
  matrixItems: ParsedMatrixItem[],
  warnings: string[]
): ParsedMasterPoLine[] {
  const sheet = workbook.Sheets[MASTER_PO_SHEET];
  if (!sheet) {
    warnings.push(`Sheet "${MASTER_PO_SHEET}" not found.`);
    return [];
  }

  const produceCodes = new Set<string>();
  for (const item of matrixItems) {
    if (
      item.kind === "produce" ||
      isProduceDepartment(item.department ?? "") ||
      item.storageType === "produce"
    ) {
      produceCodes.add(item.itemCode.toUpperCase());
    }
  }

  const excelExtraRaw = Number(sheet["T2"]?.v);
  const excelExtra =
    Number.isFinite(excelExtraRaw) && excelExtraRaw > 0 ? excelExtraRaw : 0;
  const stripFactor = 1 + excelExtra;

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  const lines: ParsedMasterPoLine[] = [];
  const seen = new Set<string>();
  let produceCount = 0;
  let duplicateCount = 0;
  let skippedTypeRows = 0;
  let skippedBlankRows = 0;

  for (const row of rows.slice(3)) {
    const type = String(row[0] ?? "")
      .trim()
      .toUpperCase();
    const department = String(row[2] ?? "").trim();
    const itemCode = String(row[3] ?? "").trim();
    const name = String(row[4] ?? "")
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!itemCode || !name) {
      skippedBlankRows += 1;
      continue;
    }
    if (MASTER_PO_SKIP_TYPES.has(type)) {
      skippedTypeRows += 1;
      continue;
    }

    const isProduce =
      isProduceType(type) ||
      isProduceDepartment(department) ||
      produceCodes.has(itemCode.toUpperCase());
    if (isProduce) produceCount += 1;

    const qtyOrder = parseNumeric(String(row[5] ?? "")) ?? 0;
    const spectCs = parseNumeric(String(row[6] ?? ""));
    const lbsWithExtra = parseNumeric(String(row[16] ?? "")) ?? 0;
    const productWeight = parseNumeric(String(row[17] ?? ""));
    const casesWithExtra = parseNumeric(String(row[18] ?? "")) ?? 0;

    const lbsNeeded = lbsWithExtra / stripFactor;
    const casesNeeded = casesWithExtra / stripFactor;

    const key = itemCode.toUpperCase();
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);

    lines.push({
      itemCode,
      name,
      department: department || "OTHER",
      type: type || "UNKNOWN",
      qtyOrder: qtyOrder > 0 ? qtyOrder : 0,
      spectCs,
      lbsNeeded,
      casesNeeded,
      productWeight,
      isProduce,
    });
  }

  if (lines.length === 0) {
    warnings.push(
      `No buy lines found on "${MASTER_PO_SHEET}". Save the workbook after Excel calculates Master PO, then re-import.`
    );
  } else {
    const toOrder = lines.filter((line) => line.qtyOrder > 0).length;
    const dropped: string[] = [];
    if (skippedBlankRows > 0) dropped.push(`${skippedBlankRows} blank`);
    if (skippedTypeRows > 0) dropped.push(`${skippedTypeRows} notes/divider`);
    if (duplicateCount > 0) dropped.push(`${duplicateCount} duplicate code`);
    warnings.push(
      `Imported ${lines.length} lines from ${MASTER_PO_SHEET} (${toOrder} with QTY ORDER > 0, ${produceCount} produce)${
        dropped.length > 0 ? `; skipped ${dropped.join(", ")} rows` : ""
      }.`
    );
  }

  return lines;
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

  const masterPoLines = parseMasterPoSheet(workbook, matrixItems, warnings);
  // AA parse kept for offline validation only — generate uses masterPoLines.
  const component = parseComponentUsage(workbook, matrixItems, warnings);

  return {
    matrixItems,
    recipes,
    scheduleEntries,
    masterPoLines,
    componentUsage: component.usage,
    componentUsageFrom: component.from,
    componentUsageTo: component.to,
    warnings,
  };
}

export function parseMasterFile(buffer: Uint8Array): ParsedMasterFile {
  const workbook = XLSX.read(buffer, { type: "array" });
  return parseMasterWorkbook(workbook);
}
