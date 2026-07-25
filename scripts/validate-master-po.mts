/**
 * Validate Excel MASTER PO# parse vs sheet values.
 *
 * Run:
 *   $env:XLSX_PATH="...xlsm"; node --experimental-strip-types scripts/validate-master-po.mts
 */
import { createRequire } from "module";
import { parseMasterWorkbook } from "../lib/purchasing/master-parser.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

const PATH =
  process.env.XLSX_PATH ??
  "c:/Users/contr/OneDrive - Avatar Foods/Carlos Ozores's files - CONTROL SHARE/1. MASTER FILES/MASTER BOWL FILE/MASTER FRESH -PRODUCTION 07.15.2026  - Copy.xlsm";

function main() {
  const wb = XLSX.readFile(PATH, { cellDates: true });
  const parsed = parseMasterWorkbook(wb);

  console.log("Workbook:", PATH);
  console.log("MASTER PO# lines (non-Produce):", parsed.masterPoLines.length);
  console.log("Sample:");
  for (const line of parsed.masterPoLines.slice(0, 12)) {
    console.log(
      `  ${line.itemCode} [${line.department}] lbs=${line.lbsNeeded.toFixed(1)} cases=${line.casesNeeded.toFixed(1)} ${line.name.slice(0, 40)}`
    );
  }

  const focus = ["310032", "310049", "510029", "410191", "410135"];
  console.log("\nFocus:");
  for (const code of focus) {
    const line = parsed.masterPoLines.find(
      (row) => row.itemCode.toUpperCase() === code
    );
    console.log(code, line ? `lbs ${line.lbsNeeded.toFixed(1)} cases ${line.casesNeeded.toFixed(1)}` : "MISSING");
  }
}

main();
