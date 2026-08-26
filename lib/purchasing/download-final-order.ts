"use client";

import * as XLSX from "xlsx";
import type { FinalOrderSnapshot } from "@/lib/purchasing/finalize-order";

/** Download Final Order PO as .xlsx (same fields as the printable view). */
export function downloadFinalOrderExcel(snapshot: FinalOrderSnapshot) {
  const rows: (string | number)[][] = [
    ["Final Order PO"],
    ["Order number", snapshot.orderNumber],
    ["Required date", snapshot.requiredDate],
    ["Production week", snapshot.productionWeek || ""],
    ["Finalized", snapshot.finalizedAt.slice(0, 10)],
    [],
    [
      "Group",
      "Item #",
      "Description",
      "Req. to order",
      "Cases req.",
      "On hand",
    ],
  ];

  for (const group of snapshot.groups) {
    for (const line of group.lines) {
      rows.push([
        group.label,
        line.itemCode,
        line.isEmergency ? `${line.name} (emergency)` : line.name,
        line.requiredToOrder,
        line.casesRequired,
        line.onHandCases ?? "",
      ]);
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 48 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Order");
  XLSX.writeFile(workbook, `${snapshot.orderNumber}.xlsx`);
}
