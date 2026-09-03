"use client";

import { burdenPct, money, type Department, type Employee, type PaySettings } from "@/lib/hr/model";
import type { departmentColor } from "@/lib/hr/colors";
import { Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * Payroll on the books, per department - what the people cost before any
 * schedule is written. Straight from the Paychex rates: salaried people at
 * their weekly pay, hourly people at a full week (part-timers at half), no
 * overtime, plus employer taxes at the rates in Pay rules. A run rate, not a
 * bill - the Scheduled view is what a given week actually costs.
 */
export function PayrollTable({
  departments,
  people,
  settings,
  look,
  leading,
}: {
  departments: Department[];
  /** Everyone active, whether or not they are on the schedule. */
  people: Employee[];
  settings: PaySettings;
  look: (d: Department) => ReturnType<typeof departmentColor>;
  /** Sits first in the summary card - the view switch, when there is one. */
  leading?: React.ReactNode;
}) {
  const fullWeek = settings.weeklyOvertimeAfter || 40;
  const partWeek = fullWeek / 2;
  const burden = burdenPct(settings);

  const rows = departments.map((department) => {
    const mine = people.filter((p) => p.departmentId === department.id && p.active);
    const staff = mine.filter((p) => p.employeeType !== "contractor");
    const salaried = staff.filter((p) => p.payType === "salary");
    const hourly = staff.filter((p) => p.payType === "hourly");
    const salaryWeek = salaried.reduce((sum, p) => sum + (p.payRate ?? 0), 0);
    const hourlyWeek = hourly.reduce((sum, p) => sum + (p.payRate ?? 0) * (p.fullTime ? fullWeek : partWeek), 0);
    const wages = salaryWeek + hourlyWeek;
    return {
      department,
      salaried: salaried.length,
      hourlyFull: hourly.filter((p) => p.fullTime).length,
      hourlyPart: hourly.filter((p) => !p.fullTime).length,
      contractors: mine.length - staff.length,
      noRate: staff.filter((p) => p.payRate === null).length,
      salaryWeek,
      hourlyWeek,
      wages,
      taxes: wages * burden,
      total: wages * (1 + burden),
    };
  });

  const total = rows.reduce(
    (sum, r) => ({
      salaried: sum.salaried + r.salaried,
      hourlyFull: sum.hourlyFull + r.hourlyFull,
      hourlyPart: sum.hourlyPart + r.hourlyPart,
      contractors: sum.contractors + r.contractors,
      noRate: sum.noRate + r.noRate,
      salaryWeek: sum.salaryWeek + r.salaryWeek,
      hourlyWeek: sum.hourlyWeek + r.hourlyWeek,
      wages: sum.wages + r.wages,
      taxes: sum.taxes + r.taxes,
      total: sum.total + r.total,
    }),
    { salaried: 0, hourlyFull: 0, hourlyPart: 0, contractors: 0, noRate: 0, salaryWeek: 0, hourlyWeek: 0, wages: 0, taxes: 0, total: 0 }
  );
  const biggest = Math.max(1, ...rows.map((r) => r.total));
  const monthly = (week: number) => (week * 52) / 12;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
        {leading}
        <Big label="a week" value={money(total.total)} hint="Wages plus employer taxes for everyone on payroll, from the Paychex rates. Not a schedule - what the people cost whether or not a week is written." />
        <Big label="a month" value={money(monthly(total.total))} />
        <Big label="a year" value={money(total.total * 52)} />
        <Big label="wages" value={money(total.wages)} />
        <Big label="employer taxes" value={money(total.taxes)} />
        <span className="ml-auto flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
          {total.salaried} salaried · {total.hourlyFull} hourly full-time · {total.hourlyPart} part-time
          {total.contractors > 0 && ` · ${total.contractors} contractor${total.contractors === 1 ? "" : "s"} not counted`}
          <Hint
            text={`Salaried people at their weekly pay (annual / 52). Hourly people at ${fullWeek} hours a week, part-timers at ${partWeek}, no overtime. Employer taxes at ${(burden * 100).toFixed(2)}% from Pay rules. Contractors are not payroll. A person with no rate in Paychex counts as zero and is flagged.`}
          />
        </span>
      </div>

      <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <thead>
            <tr className="bg-brand-muted text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
              <th className="px-3 py-1.5 text-left">Department</th>
              <th className="px-2 py-1.5 text-right">People</th>
              <th className="border-l border-border/60 px-2 py-1.5 text-right" title="Salaried">Salaried</th>
              <th className="px-2 py-1.5 text-right" title="Hourly, full-time">Hourly</th>
              <th className="border-r border-border/60 px-2 py-1.5 text-right" title="Hourly, part-time">Part-time</th>
              <th className="px-2 py-1.5 text-right">Salaries / wk</th>
              <th className="px-2 py-1.5 text-right">Hourly / wk</th>
              <th className="px-2 py-1.5 text-right">Employer taxes</th>
              <th className="px-2 py-1.5 text-right">A week</th>
              <th className="px-2 py-1.5 text-right">A month</th>
              <th className="px-2 py-1.5 text-right">A year</th>
              <th className="w-36 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => b.total - a.total)
              .map((r) => {
                const style = look(r.department);
                const headcount = r.salaried + r.hourlyFull + r.hourlyPart;
                return (
                  <tr key={r.department.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/40">
                    <td className="px-3 py-1">
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <span className={cn("block h-4 w-1 shrink-0", style.dot)} />
                        {r.department.name}
                        {r.noRate > 0 && (
                          <span title={`${r.noRate} without a pay rate in Paychex - counted as zero`} className="rounded-sm bg-warning-muted px-1 text-[0.5625rem] font-bold text-warning-foreground">
                            {r.noRate} no rate ?
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right text-xs font-semibold tabular-nums">{headcount}</td>
                    <td className="border-l border-border/60 px-2 py-1 text-right text-xs tabular-nums">{r.salaried > 0 ? r.salaried : <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums">{r.hourlyFull > 0 ? r.hourlyFull : <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="border-r border-border/60 px-2 py-1 text-right text-xs tabular-nums">{r.hourlyPart > 0 ? r.hourlyPart : <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums">{r.salaryWeek > 0 ? money(r.salaryWeek) : "—"}</td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums">{r.hourlyWeek > 0 ? money(r.hourlyWeek) : "—"}</td>
                    <td className="px-2 py-1 text-right text-xs text-muted-foreground tabular-nums">{money(r.taxes)}</td>
                    <td className="px-2 py-1 text-right text-xs font-bold tabular-nums">{money(r.total)}</td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums">{money(monthly(r.total))}</td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums">{money(r.total * 52)}</td>
                    <td className="px-2 py-1">
                      <span className="block h-2 rounded-sm bg-muted">
                        <span className={cn("block h-2 rounded-sm", style.soft)} style={{ width: `${(r.total / biggest) * 100}%` }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-sm text-muted-foreground">No departments to show.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-t-success/40 bg-success/10 text-xs font-semibold">
              <td className="px-3 py-1 text-[0.5625rem] tracking-wider text-muted-foreground uppercase">Total</td>
              <td className="px-2 py-1 text-right tabular-nums">{total.salaried + total.hourlyFull + total.hourlyPart}</td>
              <td className="border-l border-border/60 px-2 py-1 text-right tabular-nums">{total.salaried}</td>
              <td className="px-2 py-1 text-right tabular-nums">{total.hourlyFull}</td>
              <td className="border-r border-border/60 px-2 py-1 text-right tabular-nums">{total.hourlyPart}</td>
              <td className="px-2 py-1 text-right tabular-nums">{money(total.salaryWeek)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{money(total.hourlyWeek)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{money(total.taxes)}</td>
              <td className="px-2 py-1 text-right font-bold tabular-nums">{money(total.total)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{money(monthly(total.total))}</td>
              <td className="px-2 py-1 text-right tabular-nums">{money(total.total * 52)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Big({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </span>
    </span>
  );
}
