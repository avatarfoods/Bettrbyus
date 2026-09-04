"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  Printer,
  ScrollText,
} from "lucide-react";
import type { ProductionDayPrint } from "@/lib/production/print/build";
import type { ReleaseProduct } from "@/lib/production/print/release";
import { departmentColor } from "@/lib/production/department-colors";
import { Hint } from "@/components/settings/shared";
import { cn } from "@/lib/utils";

const STEP =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-primary transition-colors hover:bg-muted";
const DATE_FIELD =
  "h-7 rounded-sm border border-border bg-card px-1.5 text-xs tabular-nums focus:ring-1 focus:ring-primary focus:outline-none";
const TH =
  "border-b border-border bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase";
const TD = "border-b border-border/60 px-2 py-1 text-[0.8125rem]";

function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fmt(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : digits,
  });
}

/**
 * The day, before it goes to paper.
 *
 * A small dashboard of what is planned - the finished products going out and
 * every department's runs - with a box beside each. Tick some and the sheets
 * print for those alone; tick nothing and they print for everything. The
 * numbers are the plan's, so the sheet in someone's hand says what the
 * schedule said.
 */
export function PrintConsole({
  day,
  release,
  date,
  today,
  lineName,
  scheduleId,
  departmentColors = [],
}: {
  day: ProductionDayPrint;
  release: ReleaseProduct[];
  date: string;
  today: string;
  lineName: string | null;
  scheduleId: string | null;
  /** Department name to the colour key chosen in Settings. */
  departmentColors?: [string, string | null][];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** The warehouse's PO number, printed on the release so they know what to match. */
  const [po, setPo] = useState("");

  const go = (next: string) => {
    const search = new URLSearchParams(window.location.search);
    search.set("date", next);
    router.push(`/production/print?${search}`);
  };

  const base = useMemo(() => {
    const search = new URLSearchParams({ date });
    if (scheduleId) search.set("id", scheduleId);
    if (lineName) search.set("line", lineName);
    return search;
  }, [date, scheduleId, lineName]);

  const href = (path: string, extra: Record<string, string> = {}) => {
    const search = new URLSearchParams(base);
    if (po.trim()) search.set("po", po.trim());
    for (const [key, value] of Object.entries(extra)) if (value) search.set(key, value);
    return `${path}?${search}`;
  };

  const finishedIds = release.map((row) => row.recipeId);
  const finishedSet = useMemo(() => new Set(finishedIds), [finishedIds]);
  // A finished product is listed once, up top. Its packing run is not a
  // second row under a department.
  const departments = useMemo(
    () =>
      day.departments
        .map((dept) => ({
          ...dept,
          sheets: dept.sheets.filter((sheet) => !finishedSet.has(sheet.recipeId)),
        }))
        .filter((dept) => dept.sheets.length > 0),
    [day.departments, finishedSet]
  );
  const runIds = departments.flatMap((dept) => dept.sheets.map((sheet) => sheet.recipeId));
  /** The same colour a department has on the plan and on the picking sheet. */
  const lookFor = (name: string) => {
    const index = departmentColors.findIndex(
      ([configured]) => configured.trim().toUpperCase() === name.trim().toUpperCase()
    );
    return departmentColor(index >= 0 ? departmentColors[index][1] : null, Math.max(index, 0));
  };
  const pickedFinished = finishedIds.filter((id) => picked.has(id));
  const pickedRuns = runIds.filter((id) => picked.has(id));
  const anyPicked = picked.size > 0;

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = (ids: string[]) =>
    setPicked((current) => {
      const next = new Set(current);
      const every = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (every) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const totalCases = release.reduce((sum, row) => sum + row.quantity, 0);
  const totalPallets = release.reduce((sum, row) => sum + row.pallets, 0);
  const totalRuns = runIds.length;
  const totalLbs = departments.reduce((sum, dept) => sum + dept.totalPounds, 0);

  const releaseHref = href("/production/print/release", {
    recipes: pickedFinished.join(","),
  });
  const batchHref = href("/production/print/batch", { recipes: pickedRuns.join(",") });

  return (
    <div className="flex flex-col gap-2.5 px-3 py-3 sm:px-4">
      {/* ---------------------------------------------- summary */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
        <Big tone="blue" value={fmt(totalCases, 0)} label="finished cases" hint="Every finished product planned on this day, in cases." />
        <Big tone="green" value={String(totalPallets)} label="pallets" hint="Cases divided by each product's cases per pallet space, rounded up. One line per pallet on the release sheet." />
        <Big tone="muted" value={String(totalRuns)} label="runs" hint="Every recipe planned on this day, across the departments - one batch sheet each." />
        <Big tone="muted" value={fmt(totalLbs, 0)} label="lb in the kitchens" hint="The weight recipes' planned pounds, all departments together." />

        <span className="ml-auto flex items-center gap-2">
          <Link
            href={href("/production/print/all")}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-primary px-2.5 text-[0.6875rem] font-semibold tracking-wide text-primary-foreground uppercase transition-colors hover:opacity-90"
          >
            <Printer className="size-3.5" />
            Print all
          </Link>
        </span>
      </div>

      {/* ---------------------------------------------- controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => go(shiftDay(date, -1))} aria-label="Earlier" className={STEP}>
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="date"
          value={date}
          aria-label="Production date"
          onChange={(event) => event.target.value && go(event.target.value)}
          className={DATE_FIELD}
        />
        <button type="button" onClick={() => go(shiftDay(date, 1))} aria-label="Later" className={STEP}>
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => go(today)}
          className="h-7 rounded-sm px-2 text-[0.6875rem] font-semibold tracking-wide text-primary uppercase hover:bg-muted"
        >
          Today
        </button>

        <Hairline />

        {/* The three sheets, as buttons. Ticked rows narrow Product release
            and Batch sheets; the report is always the whole day. */}
        <SheetButton href={href("/production/print/report")} icon={FileText} label="Production report" />
        <SheetButton
          href={releaseHref}
          icon={ScrollText}
          label={pickedFinished.length > 0 ? `Product release · ${pickedFinished.length}` : "Product release"}
          accent={pickedFinished.length > 0}
        />
        <label className="flex items-center gap-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          PO #
          <input
            value={po}
            onChange={(event) => setPo(event.target.value.toUpperCase())}
            placeholder="PO06256"
            aria-label="Purchase order number for the release sheet"
            className={cn(DATE_FIELD, "w-28 font-mono normal-case")}
          />
          <Hint text="The warehouse's PO number. It prints on the product release so whoever signs knows which PO the pallets are for." />
        </label>
        <SheetButton
          href={batchHref}
          icon={Layers}
          label={pickedRuns.length > 0 ? `Batch sheets · ${pickedRuns.length}` : "Batch sheets"}
          accent={pickedRuns.length > 0}
        />
        {anyPicked && (
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="h-7 rounded-sm px-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase hover:bg-muted"
          >
            Clear ticks
          </button>
        )}
        <span className="ml-auto text-[0.625rem] text-muted-foreground">
          {day.scheduleName || "no live plan"}
          {day.scheduleStatus && ` · ${day.scheduleStatus}`}
        </span>
      </div>

      {/* ---------------------------------------------- finished products */}
      <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(TH, "w-8 text-center")}>
                <input
                  type="checkbox"
                  aria-label="Tick every finished product"
                  checked={finishedIds.length > 0 && finishedIds.every((id) => picked.has(id))}
                  onChange={() => toggleAll(finishedIds)}
                  className="size-3.5"
                />
              </th>
              <th className={cn(TH, "w-20")}>Item #</th>
              <th className={TH}>Finished product</th>
              <th className={cn(TH, "w-20 text-right")}>Cases</th>
              <th className={cn(TH, "w-24 text-right")}>
                <span className="inline-flex items-center gap-1">
                  Pallets
                  <Hint text="Cases divided by the specification's cases per pallet space, rounded up. Each one is a line on the release sheet." />
                </span>
              </th>
              <th className={cn(TH, "w-28")}>Lot #</th>
              <th className={cn(TH, "w-28")}>Expiration</th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:bg-zinc-50/70 dark:[&>tr:nth-child(even)]:bg-zinc-900/25">
            <tr className="border-y border-primary/15 bg-brand-muted/40">
              <td colSpan={7} className="px-2 py-0.5 text-[0.625rem] font-bold tracking-wider text-primary uppercase">
                Finished products
                <span className="ml-2 font-semibold text-primary/60 tabular-nums">{release.length}</span>
              </td>
            </tr>
            {release.map((row) => (
              <tr
                key={row.recipeId}
                onClick={() => toggle(row.recipeId)}
                className={cn("cursor-pointer transition-colors hover:bg-brand-muted/30", picked.has(row.recipeId) && "bg-brand-muted/50")}
              >
                <td className={cn(TD, "text-center")}>
                  <input
                    type="checkbox"
                    checked={picked.has(row.recipeId)}
                    onChange={() => toggle(row.recipeId)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Tick ${row.name}`}
                    className="size-3.5"
                  />
                </td>
                <td className={cn(TD, "font-mono text-xs font-semibold")}>{row.wipCode}</td>
                <td className={cn(TD, "font-semibold")}>
                  <span className="block truncate">{row.name}</span>
                </td>
                <td className={cn(TD, "text-right text-base font-extrabold tabular-nums")}>{fmt(row.quantity, 0)}</td>
                <td className={cn(TD, "text-right tabular-nums")}>
                  {row.pallets}
                  {row.perSpace ? (
                    <span className="ml-1 text-[0.625rem] text-muted-foreground">× {fmt(row.perSpace, 0)}</span>
                  ) : (
                    <span
                      title="No specification, so the cases per pallet are unknown. One line prints."
                      className="ml-1 inline-flex size-4 cursor-help items-center justify-center rounded-sm bg-destructive/10 text-[0.625rem] font-bold text-destructive"
                    >
                      ?
                    </span>
                  )}
                </td>
                <td className={cn(TD, "font-mono text-xs")}>{row.lot}</td>
                <td className={cn(TD, "text-xs tabular-nums")}>{row.expiration ?? ""}</td>
              </tr>
            ))}
            {release.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No finished product is planned on {date}
                  {lineName && ` for ${lineName}`}.
                </td>
              </tr>
            )}

            {/* ------------------------------------------ the departments */}
            {departments.map((dept) => {
              const ids = dept.sheets.map((sheet) => sheet.recipeId);
              const look = lookFor(dept.department);
              return [
                <tr key={`d-${dept.department}`} className={cn("border-y border-primary/15", look.tint)}>
                  <td className="px-2 py-0.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Tick every run in ${dept.department}`}
                      checked={ids.length > 0 && ids.every((id) => picked.has(id))}
                      onChange={() => toggleAll(ids)}
                      className="size-3.5"
                    />
                  </td>
                  <td colSpan={6} className="px-2 py-0.5 text-[0.625rem] font-bold tracking-wider text-primary uppercase">
                    <span className="flex items-center gap-2">
                      <span className={cn("h-3 w-1 rounded-[1px]", look.spine)} />
                      {dept.department}
                      <span className="font-semibold text-primary/60 tabular-nums">{dept.sheets.length}</span>
                      <span className="ml-auto font-semibold text-primary/80 tabular-nums">
                        {dept.totalPounds > 0 && `${fmt(dept.totalPounds, 0)} lb`}
                        {dept.totalPounds > 0 && dept.totalUnits > 0 && " · "}
                        {dept.totalUnits > 0 && `${fmt(dept.totalUnits, 0)} ea`}
                      </span>
                    </span>
                  </td>
                </tr>,
                ...dept.sheets.map((sheet) => (
                  <tr
                    key={sheet.recipeId}
                    onClick={() => toggle(sheet.recipeId)}
                    className={cn("cursor-pointer transition-colors hover:bg-brand-muted/30", picked.has(sheet.recipeId) && "bg-brand-muted/50")}
                  >
                    <td className={cn(TD, "text-center")}>
                      <input
                        type="checkbox"
                        checked={picked.has(sheet.recipeId)}
                        onChange={() => toggle(sheet.recipeId)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Tick ${sheet.name}`}
                        className="size-3.5"
                      />
                    </td>
                    <td className={cn(TD, "font-mono text-xs font-semibold")}>{sheet.wipCode}</td>
                    <td className={cn(TD, "font-semibold")}>
                      <span className="flex items-center gap-1.5">
                        <span className={cn("h-3 w-1 shrink-0 rounded-[1px]", look.spine)} />
                        <span className="truncate">{sheet.name}</span>
                      </span>
                    </td>
                    <td className={cn(TD, "text-right text-base font-extrabold tabular-nums")}>
                      {fmt(sheet.quantity, 1)}
                      <span className="ml-1 text-[0.625rem] font-normal text-muted-foreground">{(sheet.uom ?? "lb").toLowerCase()}</span>
                    </td>
                    <td className={cn(TD, "text-right tabular-nums text-muted-foreground")}>
                      {sheet.batches !== null && (
                        <>
                          {sheet.batches}
                          <span className="ml-1 text-[0.625rem]">batch{sheet.batches === 1 ? "" : "es"}</span>
                        </>
                      )}
                    </td>
                    <td className={cn(TD, "text-xs text-muted-foreground")} colSpan={2}>
                      {sheet.servesDates.length > 0 && `for ${sheet.servesDates.join(", ")}`}
                    </td>
                  </tr>
                )),
              ];
            })}
            {release.length > 0 && departments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No kitchen runs are planned on this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SheetButton({
  href,
  icon: Icon,
  label,
  accent,
}: {
  href: string;
  icon: typeof Printer;
  label: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
        accent
          ? "bg-foreground text-background"
          : "bg-card text-muted-foreground ring-1 ring-foreground/15 hover:bg-muted"
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </Link>
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
