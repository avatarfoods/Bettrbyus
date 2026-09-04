"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Layers,
  ListFilter,
  Printer,
  RefreshCw,
} from "lucide-react";
import type {
  PickingResult,
  PickingRow,
} from "@/lib/production/picking/types";
import { syncPackSizes } from "@/lib/production/picking/actions";
import { departmentColor } from "@/lib/production/department-colors";
import { SearchPanel } from "@/components/ui/search-panel";
import { Hint } from "@/components/settings/shared";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  GearAction,
  GearButton,
  GearDialog,
  GearLink,
} from "@/components/ui/gear-dialog";
import { OnHandPanel } from "@/components/production/picking/on-hand-panel";
import { downloadPickingExcel } from "@/components/production/picking/export";
import { cn } from "@/lib/utils";

type GroupBy = "none" | "department" | "type";

const STEP =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-primary transition-colors hover:bg-muted";
const DATE_FIELD =
  "h-7 rounded-sm border border-border bg-card px-1.5 text-xs tabular-nums focus:ring-1 focus:ring-primary focus:outline-none";
const TH =
  "border-b border-border bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase";
const TD = "border-b border-border/60 px-2 py-1 text-[0.8125rem]";
/** The one column that is Odoo's, not the plan's: its own colour, set apart. */
const ON_HAND_TH =
  "w-20 border-l-2 border-l-sky-300 bg-sky-50 text-right text-sky-800 dark:border-l-sky-700 dark:bg-sky-950/40 dark:text-sky-200";
const ON_HAND_TD =
  "border-l-2 border-l-sky-300 bg-sky-50/70 text-right dark:border-l-sky-700 dark:bg-sky-950/30";

function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fmt(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "";
  if (Math.abs(value) < 0.05) return "0";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : digits,
  });
}

/**
 * The picking sheet.
 *
 * Summary first, then the controls in the order the question is asked - which
 * mode, which days, how much extra, what to find - then the sheet itself,
 * grouped by department or type from the arrows on those two headers, with
 * the totals at the foot. Rows nothing asks for are hidden until asked for.
 */
export function PickingView({
  result,
  today,
  isAdmin,
  lineName = null,
  departmentColors,
}: {
  result: PickingResult;
  today: string;
  isAdmin: boolean;
  /** The line in the header, for the file names and the print title. */
  lineName?: string | null;
  /** Department name to the colour key chosen in Settings. */
  departmentColors: [string, string | null][];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const [extra, setExtra] = useState(String(result.extraPct));
  const [notice, setNotice] = useState<string | null>(null);
  /** The second date box, open only when a span was asked for. */
  const [ranged, setRanged] = useState(result.from !== result.to);
  const [gear, setGear] = useState(false);
  /** The row whose Odoo stock is open beside the sheet. */
  const [inspected, setInspected] = useState<string | null>(null);
  const inspectedRow = result.rows.find((row) => row.materialId === inspected) ?? null;

  const onlyRequested = filters.includes("requested");
  const onlyNoPack = filters.includes("nopack");

  const { mode, from, to } = result;
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = from; d <= to && out.length < 60; d = shiftDay(d, 1)) out.push(d);
    return out;
  }, [from, to]);

  function go(next: Partial<{ mode: string; from: string; to: string; extra: string }>) {
    const search = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") search.delete(key);
      else search.set(key, value);
    }
    router.push(`/production/picking?${search}`);
  }

  /**
   * Colours follow the department, the same way the plan does. The sheet's
   * departments are the plant's rooms (MAIN KITCHEN), Settings has the shifts
   * (MAIN KITCHEN AM), so the first configured department that starts with
   * the sheet's name lends its colour.
   */
  const looks = useMemo(() => {
    const map = new Map<string, ReturnType<typeof departmentColor>>();
    const names = [...new Set(result.rows.map((row) => row.department ?? "—"))].sort();
    names.forEach((name, index) => {
      const hit = departmentColors.find(([configured]) =>
        configured.trim().toUpperCase().startsWith(name.trim().toUpperCase())
      );
      const configuredIndex = hit ? departmentColors.indexOf(hit) : index;
      map.set(name, departmentColor(hit?.[1] ?? null, configuredIndex));
    });
    return map;
  }, [result.rows, departmentColors]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return result.rows.filter((row) => {
      if (onlyRequested && row.need <= 0.0001) return false;
      if (onlyNoPack && row.packSize !== null) return false;
      if (!needle) return true;
      return `${row.itemCode} ${row.name} ${row.department ?? ""} ${row.type ?? ""} ${row.sources.join(" ")}`
        .toLowerCase()
        .includes(needle);
    });
  }, [result.rows, query, onlyRequested, onlyNoPack]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: null as string | null, rows }];
    const map = new Map<string, PickingRow[]>();
    for (const row of rows) {
      const key = (groupBy === "department" ? row.department : row.type) ?? "—";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b)))
      .map(([key, list]) => ({ key, rows: list }));
  }, [rows, groupBy]);

  const totals = useMemo(() => {
    let lbs = 0;
    let cases = 0;
    let toPick = 0;
    let items = 0;
    for (const row of rows) {
      if (row.need <= 0.0001) continue;
      items += 1;
      if (row.unit === "lb") lbs += row.need;
      if (row.cases !== null) cases += row.cases;
      if (row.toPick !== null) toPick += row.toPick;
    }
    return { lbs, cases, toPick, items };
  }, [rows]);

  const driverCases = result.drivers.reduce((sum, d) => sum + d.quantity, 0);

  async function refreshPacks() {
    const ok = await confirm({
      title: "Read pack sizes from Odoo?",
      description:
        "Pack Size, U/M, Case Description and Storage are read for every material linked to an Odoo product. Departments and types on this sheet are not touched.",
      confirmLabel: "Read from Odoo",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setNotice(null);
    startTransition(async () => {
      const outcome = await syncPackSizes();
      setNotice(outcome.message);
      if (outcome.ok) router.refresh();
    });
  }

  const columns = 10;

  const printHref = () => {
    const search = new URLSearchParams(window.location.search);
    search.set("group", groupBy === "type" ? "type" : "department");
    search.set("all", onlyRequested ? "0" : "0");
    return `/production/picking/print?${search}`;
  };

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4 print:px-0 print:py-0">
      {/* ------------------------------------------------ summary */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
        <Big
          tone="blue"
          value={fmt(totals.cases, 1)}
          label="cases requested"
          hint="Every material's need divided by its pack size, before taking off what is on hand."
        />
        <Big
          tone="green"
          value={fmt(totals.lbs, 0)}
          label="lb requested"
          hint="The weight materials only. Pieces - cartons, trays, film - are counted in cases, not pounds."
        />
        <Big
          tone={totals.toPick > 0 ? "amber" : "muted"}
          value={fmt(totals.toPick, 0)}
          label="cases to pick"
          hint="Every material's requested amount divided by its pack size, rounded up to whole cases. On hand is not taken off."
        />
        <Big
          tone="muted"
          value={String(totals.items)}
          label="items"
          hint="Materials with something requested, after the filters."
        />
        <Big
          tone="muted"
          value={fmt(driverCases, 0)}
          label={`finished cases planned ${from === to ? "that day" : "in the range"}`}
          hint={
            mode === "daily"
              ? "The finished products on the live plan for these dates. Daily usage lists what every planned run - bowls and the steps beneath them - pulls that day."
              : "The finished products on the live plan for these dates. Open order explodes their whole tree, top to bottom, whatever is planned for the steps in between."
          }
        />
        {result.withoutPack > 0 && (
          <Big
            tone="muted"
            value={String(result.withoutPack)}
            label="requested without a pack size"
            hint="Requested materials with no pack size in Odoo. They show pounds or pieces but no cases, and a red ? where the pack size would be. Filter to them with 'No pack size'."
          />
        )}

        <span className="ml-auto flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => router.push(printHref())}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-primary px-2.5 text-[0.6875rem] font-semibold tracking-wide text-primary-foreground uppercase transition-colors hover:opacity-90"
          >
            <Printer className="size-3.5" />
            Print
          </button>
          <GearButton
            onClick={() => setGear(true)}
            label="Picking order settings"
            title="Print or save as PDF, export to Excel, pack sizes from Odoo"
          />
          <GearDialog
            open={gear}
            onOpenChange={setGear}
            title="Picking order"
            description="Ways out of this sheet, and where its pack sizes come from."
            error={notice && !pending ? notice : null}
          >
            <GearLink
              href={typeof window === "undefined" ? "/production/picking/print" : printHref()}
              icon={<Printer />}
              title="Print / Save as PDF"
              hint="Opens the sheet as a document: one section per department, a box to tick per line. The print dialog saves it as a PDF."
              onClick={() => setGear(false)}
            />
            <GearAction
              icon={<FileSpreadsheet />}
              title="Export to Excel"
              hint="Downloads what is on screen as a workbook: the materials to pick on one tab, the recipe totals on another."
              onClick={() => {
                downloadPickingExcel(result, rows, result.recipeTotals, lineName);
                setGear(false);
              }}
            />
            {isAdmin && (
              <GearAction
                icon={<RefreshCw />}
                title={pending ? "Reading from Odoo…" : "Pack sizes from Odoo"}
                hint={
                  result.packSyncedAt
                    ? `Reads Pack Size, U/M, Case Description and Storage again for every material. Last read ${new Date(result.packSyncedAt).toLocaleString()}.`
                    : "Reads Pack Size, U/M, Case Description and Storage from Odoo for every material. Never read yet."
                }
                disabled={pending}
                onClick={() => void refreshPacks()}
              />
            )}
          </GearDialog>
        </span>
      </div>

      {/* ------------------------------------------------ controls */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
          {(
            [
              ["daily", "Daily usage", "What each room pulls for the runs planned on these dates - each recipe's own materials"],
              ["open", "Open order", "The whole tree behind the finished products planned on these dates - everything 500 cases of a bowl consume, top to bottom"],
            ] as const
          ).map(([id, label, title]) => (
            <button
              key={id}
              type="button"
              title={title}
              onClick={() => go({ mode: id, extra: "" })}
              aria-pressed={mode === id}
              className={cn(
                "h-7 px-2.5 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
                mode === id
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </span>

        {(
          <>
            <Hairline />
            {/* Day or Range, the same switch the dashboards have. One date is
                how the sheet is used; the span is there for the few times. */}
            <span className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
              {(
                [
                  ["day", "Day"],
                  ["range", "Range"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (id === "day") {
                      setRanged(false);
                      if (to !== from) go({ to: from });
                    } else setRanged(true);
                  }}
                  aria-pressed={ranged === (id === "range")}
                  className={cn(
                    "h-7 px-2.5 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
                    ranged === (id === "range")
                      ? "bg-foreground text-background"
                      : "bg-card text-muted-foreground hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </span>
            <button
              type="button"
              onClick={() => go({ from: shiftDay(from, -days.length), to: shiftDay(to, -days.length) })}
              aria-label="Earlier"
              className={STEP}
            >
              <ChevronLeft className="size-4" />
            </button>
            <input
              type="date"
              value={from}
              max={ranged ? to : undefined}
              aria-label={ranged ? "Production from" : "Production date"}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                if (!ranged) go({ from: value, to: value });
                else go({ from: value, to: value > to ? value : to });
              }}
              className={DATE_FIELD}
            />
            {ranged && (
              <>
                <span className="text-xs text-muted-foreground">&rarr;</span>
                <input
                  type="date"
                  value={to}
                  min={from}
                  aria-label="Production to"
                  onChange={(event) => event.target.value && go({ to: event.target.value })}
                  className={DATE_FIELD}
                />
              </>
            )}
            <button
              type="button"
              onClick={() => go({ from: shiftDay(from, days.length), to: shiftDay(to, days.length) })}
              aria-label="Later"
              className={STEP}
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => go({ from: today, to: ranged ? (to < today ? today : to) : today })}
              className="h-7 rounded-sm px-2 text-[0.6875rem] font-semibold tracking-wide text-primary uppercase hover:bg-muted"
            >
              Today
            </button>
          </>
        )}

        <Hairline />
        <label className="flex items-center gap-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Extra
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={extra}
            onChange={(event) => setExtra(event.target.value)}
            onBlur={() => {
              const value = Number(extra);
              if (Number.isFinite(value) && value >= 0 && value <= 100 && value !== result.extraPct) {
                go({ extra: String(value) });
              } else setExtra(String(result.extraPct));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            aria-label="Extra percent"
            className={cn(DATE_FIELD, "w-14 text-right")}
          />
          <span className="normal-case">%</span>
          <Hint text="Buffer on top of what the recipes ask for. The workbook used 5% on daily usage and 15% on an open order." />
        </label>

        <SearchPanel
          query={query}
          onQueryChange={setQuery}
          placeholder="Find a material or a recipe…"
          aria-label="Search materials"
          filters={filters}
          onFiltersChange={setFilters}
          filterGroups={[
            {
              items: [
                { id: "requested", label: "Only requested" },
                { id: "nopack", label: "No pack size" },
              ],
            },
          ]}
          className="min-w-56 flex-1 sm:max-w-md"
        />

        <span className="ml-auto text-[0.625rem] tabular-nums text-muted-foreground">
          {rows.length} / {result.rows.length}
        </span>
      </div>

      {/* ------------------------------------------------ notices */}
      {result.missingTable && (
        <p className="rounded-sm bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
          <strong>The picking table is not there yet.</strong> Run{" "}
          <code>supabase/migrations/20260904_picking.sql</code> in the Supabase SQL editor. Until
          then the sheet has no departments, types or Odoo pack sizes, and falls back to the
          pounds per case in Purchasing.
        </p>
      )}
      {notice && (
        <p className="rounded-sm bg-brand-muted px-3 py-1.5 text-xs text-primary print:hidden">{notice}</p>
      )}
      {result.warnings.length > 0 && (
        <details className="rounded-sm bg-warning-muted/60 px-3 py-1.5 text-xs text-warning-foreground print:hidden">
          <summary className="cursor-pointer font-semibold">
            {result.warnings.length} thing{result.warnings.length === 1 ? "" : "s"} to know about these numbers
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {result.warnings.slice(0, 40).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {result.unresolved.length > 0 && (
        <details className="rounded-sm bg-destructive/10 px-3 py-1.5 text-xs text-destructive print:hidden">
          <summary className="cursor-pointer font-semibold">
            {result.unresolved.length} recipe line{result.unresolved.length === 1 ? "" : "s"} do not reach an Odoo product, so they are missing from this sheet
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {result.unresolved.slice(0, 40).map((line) => (
              <li key={`${line.recipeName}|${line.ingredientName}`}>
                {line.recipeName}: {line.ingredientName}
                {line.totalLbs > 0 && ` · ${fmt(line.totalLbs, 1)} lb`}
                {line.totalUnits > 0 && ` · ${fmt(line.totalUnits, 0)} ea`}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* ------------------------------------------------ the sheet */}
      <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
      <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(TH, "w-36")}>
                <GroupHeader
                  label="Department"
                  active={groupBy === "department"}
                  onToggle={() => setGroupBy(groupBy === "department" ? "none" : "department")}
                />
              </th>
              <th className={cn(TH, "w-28")}>
                <GroupHeader
                  label="Type"
                  active={groupBy === "type"}
                  onToggle={() => setGroupBy(groupBy === "type" ? "none" : "type")}
                />
              </th>
              <th className={cn(TH, "w-20")}>Item #</th>
              <th className={cn(TH, "w-[38%] min-w-[16rem]")}>Item</th>
              <th className={cn(TH, "w-20 text-center")}>
                {/* Excel's filter on the column that matters: click the
                    header and the zero rows go away, click again and they
                    are back. */}
                <button
                  type="button"
                  onClick={() =>
                    setFilters((current) =>
                      current.includes("requested")
                        ? current.filter((id) => id !== "requested")
                        : [...current, "requested"]
                    )
                  }
                  aria-pressed={onlyRequested}
                  title={
                    onlyRequested
                      ? "Hiding the rows with nothing to pick. Click to show them."
                      : "Click to hide the rows with nothing to pick"
                  }
                  className={cn(
                    "-mx-1 inline-flex h-5 items-center gap-0.5 rounded-sm px-1 text-[0.5625rem] font-bold tracking-wider uppercase transition-colors",
                    onlyRequested
                      ? "bg-primary text-primary-foreground"
                      : "text-primary hover:bg-primary/10"
                  )}
                >
                  {onlyRequested && <ListFilter className="size-2.5 shrink-0" />}
                  To pick
                  <ChevronDown
                    className={cn("size-3 shrink-0 transition-transform", onlyRequested && "rotate-180")}
                  />
                </button>
              </th>
              <th className={cn(TH, "w-20 text-right")}>
                <span className="inline-flex items-center gap-1">
                  Pack size
                  <Hint text="From Odoo's Product Spec: Pack Size. One case holds this many of the U/M beside it. Grey means it came from Purchasing's pounds per case instead." />
                </span>
              </th>
              <th className={cn(TH, "w-14")}>U/M</th>
              <th className={cn(TH, "w-28 text-right")}>
                <span className="inline-flex items-center gap-1">
                  From recipes
                  <Hint text="The total the recipes ask for on these dates, with the extra on top - pounds for weight, pieces for cartons and film. To pick is this divided by the pack size, rounded up to whole cases." />
                </span>
              </th>
              <th className={cn(TH, "w-40")}>Case</th>
              <th className={cn(TH, ON_HAND_TH)}>
                <span className="inline-flex items-center gap-1">
                  On hand
                  <Hint text="Cases in Odoo at the last read, for information - it is not taken off To pick. Click a number for the lots behind it." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-zinc-50/70 dark:[&>tr:nth-child(even)]:bg-zinc-900/25">
            {groups.flatMap((group) => {
              const look =
                groupBy === "department" && group.key
                  ? looks.get(group.key)
                  : undefined;
              const header =
                group.key !== null ? (
                  <tr
                    key={`group-${group.key}`}
                    className={cn("border-y border-primary/15", look?.tint ?? "bg-brand-muted/40")}
                  >
                    <td colSpan={columns} className="px-2 py-0.5 text-[0.625rem] font-bold tracking-wider text-primary uppercase">
                      <span className="flex items-center gap-2">
                        {look && <span className={cn("h-3 w-1 rounded-[1px]", look.spine)} />}
                        {group.key}
                        <span className="font-semibold text-primary/60 tabular-nums">{group.rows.length}</span>
                        <span className="ml-auto font-semibold text-primary/80 tabular-nums">
                          {fmt(group.rows.reduce((sum, row) => sum + (row.cases ?? 0), 0), 1)} cs
                        </span>
                      </span>
                    </td>
                  </tr>
                ) : null;
              return [
                header,
                ...group.rows.map((row) => (
                  <Row
                    key={row.materialId}
                    row={row}
                    look={looks.get(row.department ?? "—")}
                    inspected={inspected === row.materialId}
                    onInspect={() => setInspected((current) => (current === row.materialId ? null : row.materialId))}
                  />
                )),
              ];
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {result.rows.length === 0
                    ? "No materials for this line and place yet."
                    : onlyRequested
                      ? mode === "daily"
                        ? "Nothing is planned on these dates for this line."
                        : "No finished product is planned on these dates for this line."
                      : "Nothing matches the search."}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-t-success/40 bg-success/10">
              <td colSpan={4} className="px-2 py-1 text-right text-[0.625rem] font-bold tracking-wider text-success uppercase">
                Total
              </td>
              <td className="px-2 py-1 text-center text-base font-extrabold tabular-nums text-zinc-950 dark:text-white">
                {fmt(totals.toPick, 0)}
                <span className="ml-1 text-[0.625rem] font-normal text-muted-foreground">cs</span>
              </td>
              <td colSpan={2} />
              <td className="px-2 py-1 text-right text-[0.8125rem] font-bold tabular-nums">
                {fmt(totals.lbs, 0)} <span className="text-[0.625rem] font-normal text-muted-foreground">lb</span>
              </td>
              <td />
              <td className={cn(ON_HAND_TD, "py-1")} />
            </tr>
          </tfoot>
        </table>
      </div>
      </div>
      {inspectedRow && (
        <OnHandPanel row={inspectedRow} onClose={() => setInspected(null)} />
      )}
      </div>

      {/* ------------------------------------------------ what drove it */}
      {result.drivers.length > 0 && (
        <details className="rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10 print:hidden">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
            {result.drivers.length} finished product{result.drivers.length === 1 ? "" : "s"} behind these numbers
          </summary>
          <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {result.drivers.map((driver) => (
              <li key={driver.recipeId} className="flex items-baseline gap-2">
                <span className="font-mono text-[0.6875rem] text-muted-foreground">{driver.wipCode}</span>
                <span className="min-w-0 flex-1 truncate">{driver.name}</span>
                <span className="font-semibold tabular-nums">
                  {fmt(driver.quantity, 0)}{" "}
                  <span className="text-[0.625rem] font-normal text-muted-foreground">{(driver.uom ?? "cs").toLowerCase()}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({
  row,
  look,
  inspected,
  onInspect,
}: {
  row: PickingRow;
  look: ReturnType<typeof departmentColor> | undefined;
  inspected: boolean;
  onInspect: () => void;
}) {
  const empty = row.need <= 0.0001;
  return (
    <tr className={cn("transition-colors hover:bg-brand-muted/30", empty && "text-muted-foreground/60")}>
      <td className={cn(TD, "text-xs text-muted-foreground")}>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-3 w-1 shrink-0 rounded-[1px]", look?.spine ?? "bg-muted-foreground/40")} />
          <span className="truncate">{row.department ?? "—"}</span>
        </span>
      </td>
      <td className={cn(TD, "text-xs")}>
        {row.type ? (
          <span className={cn("inline-flex rounded-sm px-1.5 py-px text-[0.625rem] font-semibold tracking-wide uppercase", look?.tint ?? "bg-muted", empty ? "text-muted-foreground" : "text-foreground/80")}>
            {row.type}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={cn(TD, "font-mono text-xs font-semibold", empty ? "text-muted-foreground" : "text-foreground")}>{row.itemCode}</td>
      <td className={cn(TD, "font-semibold", empty ? "text-muted-foreground" : "text-foreground")} title={row.sources.length ? `From: ${row.sources.join(", ")}` : undefined}>
        <span className="block truncate">{row.name}</span>
      </td>
      <td
        className={cn(
          TD,
          "text-center text-base font-extrabold tabular-nums",
          row.toPick !== null && row.toPick > 0
            ? "text-zinc-950 dark:text-white"
            : "text-muted-foreground/50"
        )}
      >
        {row.toPick === null ? (
          empty ? (
            ""
          ) : (
            <span
              title="No pack size, so the cases cannot be counted. Pick by the requested pounds or pieces."
              className="inline-flex size-4 cursor-help items-center justify-center rounded-sm bg-destructive/10 text-[0.625rem] font-bold text-destructive"
            >
              ?
            </span>
          )
        ) : (
          fmt(row.toPick, 0)
        )}
      </td>
      <td className={cn(TD, "text-right tabular-nums", row.packSource !== "odoo" && "text-muted-foreground")}>
        {row.packSize !== null ? (
          fmt(row.packSize, 2)
        ) : (
          <span
            title="No pack size in Odoo yet, so cases cannot be counted. The pounds or pieces requested still stand."
            className="inline-flex size-4 cursor-help items-center justify-center rounded-sm bg-destructive/10 text-[0.625rem] font-bold text-destructive"
          >
            ?
          </span>
        )}
      </td>
      <td className={cn(TD, "text-xs text-muted-foreground")}>
        {row.packSize !== null ? (row.packUom ?? (row.unit === "lb" ? "lbs" : "unit")).toLowerCase() : ""}
      </td>
      <td className={cn(TD, "text-right tabular-nums text-muted-foreground")}>
        {empty ? "" : (
          <>
            {fmt(row.need, 1)} <span className="text-[0.625rem]">{row.unit}</span>
          </>
        )}
      </td>
      <td className={cn(TD, "text-xs text-muted-foreground")}>
        <span className="block truncate">{row.caseDescription ?? ""}</span>
      </td>
      <td className={cn(TD, ON_HAND_TD, inspected && "bg-sky-100 dark:bg-sky-900/40")}>
        <button
          type="button"
          onClick={onInspect}
          title="What Odoo holds: lots, quantities, expiry"
          className="-mx-1 inline-flex h-5 min-w-8 items-center justify-end rounded-sm px-1 font-semibold tabular-nums text-sky-800 hover:bg-sky-200/70 dark:text-sky-200 dark:hover:bg-sky-800/60"
        >
          {row.onHand === null ? "·" : fmt(row.onHand, 0)}
        </button>
      </td>
    </tr>
  );
}

function GroupHeader({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? `Grouped by ${label.toLowerCase()}. Click for a flat list.` : `Group the rows by ${label.toLowerCase()}`}
      className={cn(
        "-mx-1 inline-flex h-5 items-center gap-0.5 rounded-sm px-1 text-[0.5625rem] font-semibold tracking-wider uppercase transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"
      )}
    >
      {active && <Layers className="size-2.5 shrink-0" />}
      {label}
      <ChevronDown className={cn("size-3 shrink-0 transition-transform", active && "rotate-180")} />
    </button>
  );
}

function Big({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "blue" | "green" | "amber" | "muted";
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "blue" && "text-primary",
          tone === "green" && "text-success",
          tone === "amber" && "text-warning-foreground",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value || "0"}
      </span>
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </span>
    </span>
  );
}

function Hairline() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}
