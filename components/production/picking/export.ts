"use client";

import * as XLSX from "xlsx";
import type { PickingResult, PickingRow, RecipeTotal } from "@/lib/production/picking/types";

/**
 * The sheet as a workbook, the way the plant used to keep it.
 *
 * Two tabs: the materials to pick, and the recipe totals behind them. Rows go
 * out in the order and grouping on screen, so the file reads like the page.
 */
export function downloadPickingExcel(
  result: PickingResult,
  rows: PickingRow[],
  recipes: RecipeTotal[],
  lineName: string | null
) {
  const title =
    result.mode === "daily"
      ? `Picking order ${result.from}${result.to !== result.from ? ` to ${result.to}` : ""}`
      : `Picking order · open orders as of ${result.from}`;

  const materials: (string | number)[][] = [
    [title],
    [`${lineName ?? "All lines"} · ${result.extraPct}% extra`],
    [],
    ["Department", "Type", "Item #", "Item", "To pick (cs)", "Pack size", "U/M", "Requested", "Unit", "Case", "On hand"],
  ];
  for (const row of rows) {
    materials.push([
      row.department ?? "",
      row.type ?? "",
      row.itemCode,
      row.name,
      row.toPick ?? "",
      row.packSize ?? "",
      row.packUom ?? "",
      Number(row.need.toFixed(2)),
      row.unit,
      row.caseDescription ?? "",
      row.onHand ?? "",
    ]);
  }

  const totals: (string | number)[][] = [
    [title],
    [],
    ["Department", "Item #", "Recipe", "Total", "U/M", "Batches"],
  ];
  for (const recipe of recipes) {
    totals.push([
      recipe.isFinished ? "FINISHED PRODUCTS" : (recipe.department ?? ""),
      recipe.wipCode,
      recipe.name,
      Number(recipe.quantity.toFixed(2)),
      recipe.unit === "lb" ? "lbs" : recipe.isFinished ? "cs" : "ea",
      recipe.batches === null ? "" : Number(recipe.batches.toFixed(2)),
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(materials);
  ws1["!cols"] = [18, 14, 10, 44, 12, 10, 8, 12, 6, 18, 10].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws1, "Picking order");
  const ws2 = XLSX.utils.aoa_to_sheet(totals);
  ws2["!cols"] = [20, 10, 44, 12, 6, 10].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws2, "Recipes");

  const stamp = result.mode === "daily" ? result.from : `open-${result.from}`;
  XLSX.writeFile(wb, `picking-order-${stamp}.xlsx`);
}
