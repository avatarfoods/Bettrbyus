import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const excelPath = path.join(
  "C:",
  "Users",
  "contr",
  "OneDrive - Avatar Foods",
  "Carlos Ozores's files - CONTROL SHARE",
  "1. MASTER FILES",
  "MASTER BOWL FILE",
  "MASTER FRESH -PRODUCTION 08.13.2026 - Copy.xlsm"
);

function normalize(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cellText(row, col) {
  return String(row?.[col] ?? "").trim();
}

function parseNumeric(value) {
  const cleaned = String(value ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

const wb = XLSX.readFile(excelPath, { cellDates: true });

function toRows(sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
}

const RECIPE_SHEETS = [
  "FINISHED PRODUCT",
  "ASSEMBLY",
  "FRESH MIXING",
  "MAIN KITCHEN",
  "GARDE MANGER",
  "PRODUCE",
];

const matrixRows = toRows("INGREDIENT MATRIX");
const headerIndex = matrixRows.findIndex((row) =>
  row.some((cell) => String(cell).trim().toUpperCase() === "ITEM OR WIP #")
);
const header = matrixRows[headerIndex].map((cell) => String(cell).trim().toUpperCase());
const col = (label) => header.findIndex((cell) => cell.startsWith(label));
const codeCol = col("ITEM OR WIP #");
const nameCol = col("PRODUCT NAME");
const deptCol = col("DEPARTMENT");
const kindCol = col("INGREDIENT OR SUBRECIPE");
const storageCol = col("STORAGE LOCATION");

const matrixItems = [];
for (const row of matrixRows.slice(headerIndex + 1)) {
  const itemCode = cellText(row, codeCol);
  const rawKind = cellText(row, kindCol).toLowerCase();
  if (!itemCode || !rawKind) continue;
  if (!["subrecipe", "produce", "ingredient"].includes(rawKind)) continue;
  matrixItems.push({
    itemCode,
    name: cellText(row, nameCol),
    kind: rawKind,
    department: cellText(row, deptCol) || null,
    storage: cellText(row, storageCol) || null,
  });
}

const kindCounts = {};
const deptCounts = {};
for (const item of matrixItems) {
  kindCounts[item.kind] = (kindCounts[item.kind] || 0) + 1;
  const dept = item.department || "(none)";
  deptCounts[dept] = (deptCounts[dept] || 0) + 1;
}

function parseRecipeSheet(sheetName) {
  const rows = toRows(sheetName);
  const recipes = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const labelCol = row.findIndex(
      (cell) => String(cell).trim().toUpperCase() === "RECIPE NAME"
    );
    if (labelCol === -1) continue;
    const name = cellText(row, labelCol + 1);
    if (!name || /template/i.test(name)) continue;
    let department = "";
    let wipCode = "";
    for (let k = 1; k <= 5 && r + k < rows.length; k++) {
      const label = cellText(rows[r + k], labelCol).toUpperCase();
      if (label === "DEPARTMENT") department = cellText(rows[r + k], labelCol + 1);
      if (label === "WIP #") wipCode = cellText(rows[r + k], labelCol + 1);
    }
    if (!wipCode || /enter information/i.test(wipCode)) continue;

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
    if (headerRowIndex === -1) continue;
    const lineHeader = rows[headerRowIndex].map((cell) =>
      String(cell).trim().toUpperCase()
    );
    const ingNameCol = lineHeader.findIndex((cell) =>
      cell.startsWith("INGREDIENT - MATERIAL")
    );
    const lossCol = lineHeader.findIndex(
      (cell) => cell.startsWith("LOSS") || cell === "YEILD" || cell === "YIELD"
    );
    const isPerUnit = lossCol !== -1;
    let qtyCol;
    let uomCol;
    if (isPerUnit) {
      qtyCol = ingNameCol + 1;
      uomCol = lineHeader.findIndex((cell, index) => index > qtyCol && cell === "U/M");
    } else {
      qtyCol = lineHeader.findIndex(
        (cell, index) => index > ingNameCol + 4 && cell.startsWith("QTY")
      );
      uomCol = qtyCol + 1;
    }
    const lines = [];
    for (let k = headerRowIndex + 1; k < rows.length; k++) {
      const lineRow = rows[k];
      const ingredientName = cellText(lineRow, ingNameCol);
      const upperName = ingredientName.toUpperCase();
      const isTotalRow =
        upperName === "INSTRUCTIONS" ||
        cellText(lineRow, uomCol).toUpperCase() === "TOTAL";
      if (isTotalRow) break;
      if (upperName.startsWith("INSTRUCTION")) continue;
      if (cellText(lineRow, labelCol).toUpperCase() === "RECIPE NAME") break;
      if (!ingredientName) continue;
      const qty = parseNumeric(cellText(lineRow, qtyCol));
      if (qty === null || qty <= 0) continue;
      if (["WATER", "ICE", "HOT WATER", "COLD WATER"].includes(normalize(ingredientName)))
        continue;
      lines.push({
        ingredientName,
        quantity: qty,
        uom: cellText(lineRow, uomCol) || null,
      });
    }
    recipes.push({
      wipCode,
      name,
      department: department || sheetName,
      sheetName,
      isPerUnit,
      lines,
    });
  }
  return recipes;
}

const recipes = [];
const seen = new Set();
for (const sheet of RECIPE_SHEETS) {
  for (const recipe of parseRecipeSheet(sheet)) {
    if (seen.has(recipe.wipCode)) continue;
    seen.add(recipe.wipCode);
    recipes.push(recipe);
  }
}

const recipeByName = new Map();
const recipeByWip = new Map();
for (const recipe of recipes) {
  recipeByName.set(normalize(recipe.name), recipe);
  recipeByWip.set(recipe.wipCode, recipe);
}
const subrecipeByName = new Map();
for (const item of matrixItems) {
  if (item.kind === "subrecipe") {
    subrecipeByName.set(normalize(item.name), item);
  }
}
const materialByName = new Map();
for (const item of matrixItems) {
  if (item.kind !== "subrecipe") {
    materialByName.set(normalize(item.name), item);
  }
}

const bySheet = {};
const connections = { material: 0, subrecipe: 0, unresolved: 0 };
const unresolved = [];
const graphs = [];

for (const recipe of recipes) {
  bySheet[recipe.sheetName] = (bySheet[recipe.sheetName] || 0) + 1;
  const resolvedLines = recipe.lines.map((line) => {
    const key = normalize(line.ingredientName);
    const asRecipe = recipeByName.get(key);
    const asSub = subrecipeByName.get(key);
    const asMaterial = materialByName.get(key);
    let kind = "unresolved";
    let target = null;
    if (asRecipe) {
      kind = "subrecipe";
      target = asRecipe.wipCode;
    } else if (asSub) {
      kind = "subrecipe";
      target = asSub.itemCode;
    } else if (asMaterial) {
      kind = "material";
      target = asMaterial.itemCode;
    }
    connections[kind] += 1;
    if (kind === "unresolved") unresolved.push(`${recipe.name} -> ${line.ingredientName}`);
    return { ...line, kind, target };
  });
  graphs.push({ ...recipe, lines: resolvedLines });
}

function explode(wip, depth = 0, seenChain = new Set()) {
  const recipe = recipeByWip.get(wip);
  if (!recipe) return [`${"  ".repeat(depth)}MISSING ${wip}`];
  if (seenChain.has(wip)) return [`${"  ".repeat(depth)}CYCLE ${recipe.name}`];
  const next = new Set(seenChain);
  next.add(wip);
  const lines = [`${"  ".repeat(depth)}${recipe.sheetName} | ${recipe.wipCode} ${recipe.name} (${recipe.lines.length} lines, ${recipe.isPerUnit ? "per-unit" : "batch"})`];
  for (const line of recipe.lines.slice(0, 12)) {
    const key = normalize(line.ingredientName);
    const asRecipe = recipeByName.get(key);
    if (asRecipe) {
      lines.push(...explode(asRecipe.wipCode, depth + 1, next));
    } else {
      const asSub = subrecipeByName.get(key);
      const asMat = materialByName.get(key);
      const kind = asSub ? "SUB" : asMat ? asMat.kind.toUpperCase() : "UNRESOLVED";
      lines.push(
        `${"  ".repeat(depth + 1)}[${kind}] ${line.ingredientName} ${line.quantity} ${line.uom ?? ""}`
      );
    }
  }
  if (recipe.lines.length > 12) {
    lines.push(`${"  ".repeat(depth + 1)}… +${recipe.lines.length - 12} more`);
  }
  return lines;
}

console.log("\n=== MATRIX ===");
console.log("items", matrixItems.length, kindCounts);
console.log("departments", deptCounts);

console.log("\n=== RECIPES ===");
console.log("count", recipes.length);
console.log("by sheet", bySheet);
console.log("connections", connections);
console.log("unresolved sample", unresolved.slice(0, 20));

const sampleFinished = recipes.filter((r) => r.sheetName === "FINISHED PRODUCT").slice(0, 3);
const sampleMixing = recipes.filter((r) => r.sheetName === "FRESH MIXING").slice(0, 2);
const sampleKitchen = recipes.filter((r) => r.sheetName === "MAIN KITCHEN").slice(0, 2);
const sampleAssembly = recipes.filter((r) => r.sheetName === "ASSEMBLY").slice(0, 2);

console.log("\n=== SAMPLE TREES ===");
for (const recipe of [...sampleFinished, ...sampleAssembly, ...sampleMixing, ...sampleKitchen]) {
  console.log("\n" + explode(recipe.wipCode).join("\n"));
}

const out = {
  matrixSummary: { count: matrixItems.length, kindCounts, deptCounts },
  recipeSummary: { count: recipes.length, bySheet, connections },
  recipes: graphs.map((r) => ({
    wipCode: r.wipCode,
    name: r.name,
    department: r.department,
    sheetName: r.sheetName,
    isPerUnit: r.isPerUnit,
    lineCount: r.lines.length,
    lines: r.lines.map((l) => ({
      name: l.ingredientName,
      qty: l.quantity,
      uom: l.uom,
      kind: l.kind,
      target: l.target,
    })),
  })),
  materials: matrixItems.filter((i) => i.kind !== "subrecipe").slice(0, 40),
  subrecipes: matrixItems.filter((i) => i.kind === "subrecipe").slice(0, 40),
};
fs.writeFileSync("scripts/recipe-inspect.json", JSON.stringify(out, null, 2));
console.log("\nwrote scripts/recipe-inspect.json");
