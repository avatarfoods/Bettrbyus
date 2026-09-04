"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Layers, Loader2, ScrollText } from "lucide-react";
import { savePrintPlan } from "@/lib/settings/print-actions";
import {
  PRINT_SHEET_IDS,
  defaultSheetsFor,
  type PrintPlan,
  type PrintSheetId,
} from "@/lib/settings/wallpaper";
import { departmentColor } from "@/lib/production/department-colors";
import { SettingsPage, Hint } from "@/components/settings/shared";
import { cn } from "@/lib/utils";

export type PrintDepartment = {
  name: string;
  lineName: string | null;
  color: string | null;
};

const SHEETS: Record<PrintSheetId, { label: string; Icon: typeof FileText; hint: string }> = {
  batch: {
    label: "Batch record",
    Icon: Layers,
    hint: "One page per run in this department: ingredients scaled to the plan, lot numbers, the method.",
  },
  release: {
    label: "Product release",
    Icon: ScrollText,
    hint: "One line per pallet of this department's finished products, with lot, expiration and two signatures.",
  },
  report: {
    label: "Production report",
    Icon: FileText,
    hint: "This department's page of the report: what to make, how many batches, what it is for.",
  },
};

/**
 * What prints for each department, and in what order.
 *
 * Print all walks the departments and, for each, prints the sheets ticked
 * here left to right. Finished Product wants the batch record, the release
 * and the report; a kitchen wants the batch record and the report, and no
 * release - nothing there goes on a pallet.
 */
export function PrintSettings({
  departments,
  plan: initial,
}: {
  departments: PrintDepartment[];
  plan: PrintPlan;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<PrintPlan>(() => {
    const filled: PrintPlan = {};
    for (const dept of departments) filled[dept.name] = defaultSheetsFor(dept.name, initial);
    return filled;
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = departments.some(
    (dept) => (plan[dept.name] ?? []).join("|") !== defaultSheetsFor(dept.name, initial).join("|")
  );

  function update(name: string, next: PrintSheetId[]) {
    setPlan((current) => ({ ...current, [name]: next }));
    setSaved(false);
  }
  function toggle(name: string, id: PrintSheetId) {
    const current = (plan[name] ?? []) as PrintSheetId[];
    update(name, current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }
  function move(name: string, id: PrintSheetId, delta: -1 | 1) {
    const current = [...((plan[name] ?? []) as PrintSheetId[])];
    const index = current.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    update(name, current);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await savePrintPlan(plan);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  // Grouped by line, the way the plant reads.
  const lines = [...new Set(departments.map((dept) => dept.lineName ?? "—"))];

  return (
    <SettingsPage intro="What Print all prints for each department, left to right. Click a sheet to add or drop it; the arrows change the order the pages come out in.">
      <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-56 border-b border-border bg-brand-muted px-3 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
                Department
              </th>
              <th className="border-b border-border bg-brand-muted px-3 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
                <span className="inline-flex items-center gap-1">
                  Prints, in this order
                  <Hint text="Each chip is a sheet. Filled means it prints; hollow means it does not. Arrows move a sheet earlier or later in the pile." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.flatMap((line) => [
              <tr key={`line-${line}`} className="border-y border-primary/15 bg-brand-muted/40">
                <td colSpan={2} className="px-3 py-0.5 text-[0.5625rem] font-bold tracking-wider text-primary uppercase">
                  {line}
                </td>
              </tr>,
              ...departments
                .filter((dept) => (dept.lineName ?? "—") === line)
                .map((dept, index) => {
                  const look = departmentColor(dept.color, index);
                  const chosen = (plan[dept.name] ?? []) as PrintSheetId[];
                  const off = PRINT_SHEET_IDS.filter((id) => !chosen.includes(id));
                  return (
                    <tr key={dept.name} className="border-b border-border/60">
                      <td className="px-3 py-1.5 text-xs font-semibold">
                        <span className="flex items-center gap-1.5">
                          <span className={cn("h-3 w-1 shrink-0 rounded-[1px]", look.spine)} />
                          <span className="truncate">{dept.name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {chosen.map((id, position) => {
                            const sheet = SHEETS[id];
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center overflow-hidden rounded-sm bg-primary text-primary-foreground"
                              >
                                <button
                                  type="button"
                                  onClick={() => move(dept.name, id, -1)}
                                  disabled={position === 0}
                                  aria-label={`Move ${sheet.label} earlier`}
                                  className="inline-flex h-7 w-5 items-center justify-center hover:bg-white/15 disabled:opacity-30"
                                >
                                  <ChevronLeft className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggle(dept.name, id)}
                                  title={`${sheet.hint} Click to drop it.`}
                                  className="inline-flex h-7 items-center gap-1.5 px-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase hover:bg-white/15"
                                >
                                  <span className="text-[0.625rem] font-bold tabular-nums opacity-70">{position + 1}</span>
                                  <sheet.Icon className="size-3.5" />
                                  {sheet.label}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => move(dept.name, id, 1)}
                                  disabled={position === chosen.length - 1}
                                  aria-label={`Move ${sheet.label} later`}
                                  className="inline-flex h-7 w-5 items-center justify-center hover:bg-white/15 disabled:opacity-30"
                                >
                                  <ChevronRight className="size-3" />
                                </button>
                              </span>
                            );
                          })}
                          {off.map((id) => {
                            const sheet = SHEETS[id];
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => toggle(dept.name, id)}
                                title={`${sheet.hint} Click to add it.`}
                                className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase ring-1 ring-foreground/15 hover:bg-muted"
                              >
                                <sheet.Icon className="size-3.5" />
                                {sheet.label}
                              </button>
                            );
                          })}
                          {chosen.length === 0 && (
                            <span className="text-[0.625rem] text-muted-foreground">Nothing prints for this department.</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                }),
            ])}
          </tbody>
        </table>
        <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
              dirty ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-muted text-muted-foreground"
            )}
          >
            {pending && <Loader2 className="size-3 animate-spin" />}
            Save
          </button>
          {saved && !dirty && <span className="text-xs text-success">Saved</span>}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </div>
    </SettingsPage>
  );
}
