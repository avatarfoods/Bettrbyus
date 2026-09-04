"use client";

import { format, parseISO } from "date-fns";
import {
  groupStatusLabel,
  type FinalOrderGroup,
  type FinalOrderSnapshot,
} from "@/lib/purchasing/finalize-order";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy");
  } catch {
    return value;
  }
}

function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeSnapshot(snapshot: FinalOrderSnapshot): FinalOrderSnapshot {
  const raw = snapshot as FinalOrderSnapshot & {
    departments?: FinalOrderGroup[];
  };
  const groups =
    Array.isArray(raw.groups) && raw.groups.length > 0
      ? raw.groups
      : Array.isArray(raw.departments)
        ? raw.departments
        : [];

  return {
    cycleId: raw.cycleId ?? "",
    orderNumber: raw.orderNumber || "PO",
    requiredDate: raw.requiredDate || "",
    productionWeek: raw.productionWeek ?? null,
    finalizedAt: raw.finalizedAt || new Date().toISOString(),
    groups: groups.map((group) => ({
      key: group.key ?? "",
      label: group.label || group.key || "Group",
      status: group.status ?? "to_order",
      notes: group.notes ?? null,
      lines: (group.lines ?? []).map((line) => ({
        itemCode: line.itemCode ?? "—",
        name: line.name ?? "Unknown",
        category: line.category ?? group.key ?? "",
        casesRequired: Number(line.casesRequired) || 0,
        onHandCases:
          line.onHandCases == null ? null : Number(line.onHandCases),
        requiredToOrder: Number(line.requiredToOrder) || 0,
        lbsRequired:
          line.lbsRequired == null ? null : Number(line.lbsRequired),
        isEmergency: Boolean(line.isEmergency),
        orderByDate: line.orderByDate ?? null,
      })),
      earliestOrderBy: group.earliestOrderBy ?? null,
    })),
    totals: raw.totals ?? { lineCount: 0, casesToOrder: 0 },
  };
}

function buildPrintHtml(snapshot: FinalOrderSnapshot) {
  const groupsHtml =
    snapshot.groups.length === 0
      ? `<p>No order lines in this Final Order PO.</p>`
      : snapshot.groups
          .map((group) => {
            const rows = (group.lines ?? [])
              .map((line) => {
                const name = escapeHtml(
                  line.isEmergency ? `${line.name} (emergency)` : line.name
                );
                return `<tr>
            <td class="mono">${escapeHtml(line.itemCode)}</td>
            <td>${name}</td>
            <td class="num">${Number(line.requiredToOrder).toLocaleString()}</td>
            <td class="num">${Number(line.casesRequired).toLocaleString()}</td>
            <td class="num muted">${
              line.onHandCases != null
                ? Number(line.onHandCases).toLocaleString()
                : "—"
            }</td>
            <td class="num muted">${escapeHtml(formatDate(line.orderByDate))}</td>
          </tr>`;
              })
              .join("");

            const orderBySuffix = group.earliestOrderBy
              ? ` <span class="status">· Order by ${escapeHtml(
                  formatDate(group.earliestOrderBy)
                )}</span>`
              : "";

            return `<section class="group">
        <h2>${escapeHtml(group.label)} <span class="status">(${escapeHtml(
              groupStatusLabel(group.status)
            )})</span>${orderBySuffix}</h2>
        <table>
          <colgroup>
            <col style="width:14%" />
            <col style="width:32%" />
            <col style="width:12%" />
            <col style="width:12%" />
            <col style="width:10%" />
            <col style="width:20%" />
          </colgroup>
          <thead>
            <tr>
              <th>Item #</th>
              <th>Description</th>
              <th class="num">Req. to order</th>
              <th class="num">Cases req.</th>
              <th class="num">On hand</th>
              <th class="num">Order by</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6">No lines</td></tr>`}</tbody>
        </table>
      </section>`;
          })
          .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(snapshot.orderNumber)}</title>
  <style>
    @page { size: letter portrait; margin: 0.4in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      color: #111;
      background: #fff;
    }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .meta { margin: 0 0 4px; }
    .meta strong { font-weight: 600; }
    .header { border-bottom: 1px solid #ccc; padding-bottom: 12px; margin-bottom: 16px; }
    .group { break-inside: avoid; margin-bottom: 16px; }
    .group h2 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #ddd;
    }
    .group h2 .status {
      text-transform: none;
      letter-spacing: 0;
      font-weight: 500;
      color: #555;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 11px;
    }
    th, td {
      padding: 4px 6px 4px 0;
      vertical-align: top;
      text-align: left;
      border-bottom: 1px solid #eee;
      word-wrap: break-word;
    }
    th {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #555;
      font-weight: 600;
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    td.num { font-weight: 600; }
    td.num + td.num { font-weight: 400; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .muted { color: #666; font-weight: 400 !important; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(snapshot.orderNumber)}</h1>
    <p class="meta">Arrival date: <strong>${escapeHtml(
      formatDate(snapshot.requiredDate)
    )}</strong></p>
    <p class="meta">Production week: <strong>${escapeHtml(
      snapshot.productionWeek || "—"
    )}</strong></p>
    <p class="meta">Finalized: ${escapeHtml(
      formatDate(snapshot.finalizedAt.slice(0, 10))
    )}</p>
  </div>
  ${groupsHtml}
</body>
</html>`;
}

const FRAME_ID = "purchasing-final-order-print-frame";

/**
 * Print Final Order PO via a hidden iframe (no pop-up window).
 * Passes the full snapshot into the iframe document, then prints.
 */
export function printFinalOrder(snapshot: FinalOrderSnapshot) {
  if (!snapshot) {
    window.alert("No final order data to print.");
    return;
  }

  // Clone so we print exactly what was passed (not a later state change).
  const data = normalizeSnapshot(
    JSON.parse(JSON.stringify(snapshot)) as FinalOrderSnapshot
  );
  const html = buildPrintHtml(data);

  document.getElementById(FRAME_ID)?.remove();

  const iframe = document.createElement("iframe");
  iframe.id = FRAME_ID;
  iframe.setAttribute("title", "Print Final Order PO");
  iframe.style.cssText =
    "position:absolute;left:-9999px;top:0;width:8.5in;min-height:11in;border:0;";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    window.alert("Could not prepare the print view.");
    return;
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const runPrint = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      window.setTimeout(() => {
        document.getElementById(FRAME_ID)?.remove();
      }, 1000);
    }
  };

  // Give the browser a tick to layout the written document.
  if (frameDoc.readyState === "complete") {
    window.setTimeout(runPrint, 100);
  } else {
    iframe.onload = () => window.setTimeout(runPrint, 100);
  }
}
