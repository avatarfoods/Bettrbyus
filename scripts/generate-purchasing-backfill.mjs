// One-time backfill for purchasing_materials spec fields (lbs_per_case,
// storage_type, price) from the legacy Excel files. Generates a SQL migration
// that upserts materials without overwriting anything already set in the app.
//
// Usage:
//   node scripts/generate-purchasing-backfill.mjs "<Component Matrix.xlsx>" "<MASTER FRESH.xlsm>"

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));

const [componentMatrixPath, masterFilePath] = process.argv.slice(2);
if (!componentMatrixPath || !masterFilePath) {
  console.error(
    'Usage: node scripts/generate-purchasing-backfill.mjs "<Component Matrix.xlsx>" "<MASTER FRESH.xlsm>"'
  );
  process.exit(1);
}

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function normalizeStorage(type, storage) {
  if (String(type).trim().toLowerCase() === "produce") return "produce";
  const value = String(storage).trim().toLowerCase();
  if (value === "dry") return "dry";
  if (value === "refrigerated") return "refrigerated";
  if (value === "frozen") return "frozen";
  return null;
}

// materials: item_code -> { name, storage_type, lbs_per_case, price }
const materials = new Map();

// 1) INGREDIENT MATRIX from the master file: buyable Ingredient/Produce rows.
{
  const workbook = XLSX.readFile(masterFilePath);
  const rows = sheetRows(workbook, "INGREDIENT MATRIX");

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => String(cell).trim().toUpperCase() === "ITEM OR WIP #")
  );
  if (headerIndex === -1) throw new Error("INGREDIENT MATRIX header row not found");

  const header = rows[headerIndex].map((cell) => String(cell).trim().toUpperCase());
  const col = (label) => header.findIndex((cell) => cell.startsWith(label));
  const codeCol = col("ITEM OR WIP #");
  const nameCol = col("PRODUCT NAME");
  const typeCol = col("INGREDIENT OR SUBRECIPE");
  const storageCol = col("STORAGE LOCATION");
  const weightCol = col("PRODUCT WEIGHT");
  const priceCol = col("PRODUCT PRICE");

  for (const row of rows.slice(headerIndex + 1)) {
    const code = String(row[codeCol] ?? "").trim();
    const type = String(row[typeCol] ?? "").trim().toLowerCase();
    if (!code || (type !== "ingredient" && type !== "produce")) continue;

    materials.set(code, {
      name: String(row[nameCol] ?? "").trim(),
      storage_type: normalizeStorage(row[typeCol], row[storageCol]),
      lbs_per_case: parseNumber(row[weightCol]),
      price: parseNumber(row[priceCol]),
    });
  }
}

// 2) Inventory_ sheet from the Component Matrix: "Spec Cs" is the conversion
//    actually used by purchasing, so it wins over the matrix weight.
{
  const workbook = XLSX.readFile(componentMatrixPath);
  const rows = sheetRows(workbook, "Inventory_");

  const headerIndex = rows.findIndex(
    (row) => String(row[0] ?? "").trim() === "Item Code"
  );
  if (headerIndex === -1) throw new Error("Inventory_ header row not found");

  for (const row of rows.slice(headerIndex + 1)) {
    const code = String(row[0] ?? "").trim();
    if (!code) continue;
    const name = String(row[1] ?? "").trim();
    const spec = parseNumber(row[2]);

    const existing = materials.get(code);
    if (existing) {
      if (spec !== null) existing.lbs_per_case = spec;
      if (!existing.name && name) existing.name = name;
    } else {
      materials.set(code, {
        name,
        storage_type: null,
        lbs_per_case: spec,
        price: null,
      });
    }
  }
}

function sqlLiteral(value) {
  let tag = "seed";
  while (String(value).includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${value}$${tag}$`;
}

const values = [];
for (const [code, material] of materials) {
  if (!material.name) continue;
  values.push(
    `  (${sqlLiteral(code)}, ${sqlLiteral(material.name)}, ` +
      `${material.storage_type ? sqlLiteral(material.storage_type) : "null"}, ` +
      `${material.lbs_per_case ?? "null"}, ${material.price ?? "null"})`
  );
}

const sql = `-- One-time backfill of purchasing_materials spec fields from the legacy
-- Component Matrix / master production Excel files.
-- Existing app-managed values are preserved (coalesce keeps current data);
-- names are only used for rows that don't exist yet (Odoo sync owns names).

insert into public.purchasing_materials (item_code, name, storage_type, lbs_per_case, price)
values
${values.join(",\n")}
on conflict (item_code) do update set
  storage_type = coalesce(public.purchasing_materials.storage_type, excluded.storage_type),
  lbs_per_case = coalesce(public.purchasing_materials.lbs_per_case, excluded.lbs_per_case),
  price = coalesce(public.purchasing_materials.price, excluded.price),
  updated_at = now();
`;

const outPath = join(__dirname, "..", "supabase", "migrations", "20260724_purchasing_backfill.sql");
writeFileSync(outPath, sql, "utf8");
console.log(`Wrote ${values.length} material rows to ${outPath}`);
