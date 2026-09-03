"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import {
  DAY_NAMES,
  addDays,
  displayTime,
  isOff,
  monthDay,
  shiftHours,
  weekDates,
  type AbsenceType,
  type Department,
  type Employee,
  type Schedule,
  type Shift,
} from "@/lib/hr/model";
import { cn } from "@/lib/utils";

/**
 * The sheet that goes on the wall.
 *
 * Landscape letter, one department per page, the week across the top, a
 * person per row. Fixed column widths so every day lines up under its
 * heading, a blue-grey header band, weekends shaded, OFF in bold so an
 * absence is as easy to see as a shift. No cost - the wall is not where
 * money is discussed.
 *
 * Its own frame rather than the production one: that frame is portrait and
 * 8.5in wide, and a week does not fit. The id is the one the global print
 * stylesheet already knows, so nothing outside HR changes.
 */
export type PrintDepartment = {
  department: Department;
  schedule: Schedule | null;
  /** Own people plus anyone borrowed for the week. */
  employees: Employee[];
  shifts: Shift[];
};

export function SchedulePrintSheet({
  weekStart,
  departments,
  allDepartments,
  absenceTypes,
  selected,
}: {
  weekStart: string;
  departments: PrintDepartment[];
  allDepartments: Department[];
  /** So a day off for a reason prints its code, PTO or HOL, instead of OFF. */
  absenceTypes: AbsenceType[];
  /** Department id, or "all". */
  selected: string;
}) {
  const router = useRouter();
  const dates = weekDates(weekStart);
  const codeOf = new Map(absenceTypes.map((t) => [t.id, t.code]));
  const label = `${monthDay(weekStart)} – ${monthDay(addDays(weekStart, 6))}`;
  const nameOfDept = (id: string | null) => allDepartments.find((d) => d.id === id)?.name ?? "";

  return (
    <div className="min-h-full bg-muted/50">
      <div className="sticky top-(--app-bar-height) z-30 flex flex-wrap items-center gap-2 border-b-2 border-b-brand/25 bg-background/95 px-3 py-2 backdrop-blur print:hidden sm:px-4">
        <Link
          href={`/hr/schedule?dept=${selected !== "all" ? selected : ""}&from=${weekStart}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-card px-2.5 text-sm text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Weekly schedule</h1>
          <p className="truncate text-xs text-muted-foreground">{label} · landscape, one department per page</p>
        </div>
        <select
          value={selected}
          onChange={(event) => router.push(`/hr/schedule/print?week=${weekStart}&dept=${event.target.value}`)}
          aria-label="Department"
          className="h-8 rounded-sm bg-card px-2 text-sm ring-1 ring-foreground/10"
        >
          <option value="all">Every department</option>
          {allDepartments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Printer className="size-3.5" />
          Print
        </button>
      </div>

      <div className="flex justify-center px-2 py-4 print:p-0">
        {/* The id the global print stylesheet shows; landscape is asked for on the same box. */}
        <div
          id="production-print"
          data-print-landscape
          className="w-full max-w-[11in] bg-white p-6 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
          style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
        >
          {departments.map(({ department, schedule, employees, shifts }, index) => {
            const byKey = new Map(shifts.map((s) => [`${s.employeeId}|${s.workDate}`, s]));
            const perDay = dates.map((date) => employees.filter((e) => !isOff(byKey.get(`${e.id}|${date}`))).length);
            return (
              <section key={department.id} className={cn(index > 0 && "print-break-before mt-10 print:mt-0")}>
                <header className="mb-1.5 flex items-end justify-between gap-4 border-b-[3px] border-[#1e3a5f] pb-1">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-[#1e3a5f] uppercase">{department.name}</h2>
                    <p className="text-xs text-neutral-600">
                      Avatar Foods · Weekly schedule
                      {department.line && ` · ${department.line}`}
                      {department.breakHours > 0 && ` · ${department.breakHours} h unpaid break, take it during the shift`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-[#1e3a5f] tabular-nums">{label}</p>
                    <p className="text-[0.625rem] text-neutral-600">
                      {schedule
                        ? `Approved${
                            schedule.approvals.length > 0
                              ? ` by ${schedule.approvals.map((a) => a.approvedByName ?? "?").join(", ")}`
                              : schedule.approvedByName
                                ? ` by ${schedule.approvedByName}`
                                : ""
                          }${
                            schedule.approvedAt
                              ? ` · ${new Date(schedule.approvedAt).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })}`
                              : ""
                          }`
                        : "NOT APPROVED - nothing to post"}
                    </p>
                  </div>
                </header>

                <table className="w-full table-fixed border-collapse text-[0.6875rem] leading-tight">
                  <colgroup>
                    <col style={{ width: "22%" }} />
                    {dates.map((date) => (
                      <col key={date} style={{ width: "10.2%" }} />
                    ))}
                    <col style={{ width: "6.6%" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#dfe7f1] text-[#1e3a5f]">
                      <th className="border border-[#9fb3c8] px-2 py-1 text-left text-[0.625rem] font-bold tracking-wider uppercase">Name</th>
                      {dates.map((date, i) => (
                        <th key={date} className={cn("border border-[#9fb3c8] px-1 py-1 text-center", i >= 5 && "bg-[#cfd9e6]")}>
                          <span className="block text-[0.625rem] font-bold tracking-wider uppercase">{DAY_NAMES[i].slice(0, 3)}</span>
                          <span className="block text-xs font-bold tabular-nums">{monthDay(date)}</span>
                        </th>
                      ))}
                      <th className="border border-[#9fb3c8] px-1 py-1 text-right text-[0.625rem] font-bold tracking-wider uppercase">Hrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e, row) => {
                      const hours = dates.reduce((sum, date) => {
                        const s = byKey.get(`${e.id}|${date}`);
                        return sum + (s ? shiftHours(s, department.breakHours) : 0);
                      }, 0);
                      const foreign = e.departmentId !== department.id;
                      return (
                        <tr key={e.id} className={cn("print-keep", row % 2 === 1 && "bg-neutral-50")}>
                          <td className="border border-neutral-400 px-2 py-0.5 align-middle">
                            <span className="block truncate text-[0.75rem] font-semibold">
                              {e.lastName}, {e.preferredName || e.firstName}
                            </span>
                            {foreign && <span className="block text-[0.625rem] text-[#1e3a5f]">from {nameOfDept(e.departmentId)}</span>}
                          </td>
                          {dates.map((date, i) => {
                            const s = byKey.get(`${e.id}|${date}`);
                            const off = isOff(s);
                            return (
                              <td
                                key={date}
                                className={cn(
                                  "border border-neutral-400 px-1 py-0.5 text-center align-middle tabular-nums",
                                  i >= 5 && "bg-neutral-100"
                                )}
                              >
                                {off || !s?.startTime || !s?.endTime ? (
                                  <span className={cn("text-xs font-black tracking-wider", s?.absenceTypeId ? "text-[#1e3a5f]" : "text-neutral-500")}>
                                    {(s?.absenceTypeId && codeOf.get(s.absenceTypeId)) || "OFF"}
                                  </span>
                                ) : (
                                  <span className="flex flex-col leading-tight">
                                    <span className="text-[0.75rem] font-bold">{displayTime(s.startTime)}</span>
                                    <span className="text-[0.6875rem] text-neutral-700">{displayTime(s.endTime)}</span>
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="border border-neutral-400 px-1 py-0.5 text-right align-middle font-semibold tabular-nums">
                            {hours > 0 ? hours.toFixed(1) : ""}
                          </td>
                        </tr>
                      );
                    })}
                    {employees.length === 0 && (
                      <tr>
                        <td colSpan={9} className="border border-neutral-400 px-2 py-6 text-center text-neutral-500">
                          Nobody in this department.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#dfe7f1] text-[#1e3a5f]">
                      <td className="border border-[#9fb3c8] px-2 py-1 text-[0.625rem] font-bold tracking-wider uppercase">People in</td>
                      {perDay.map((count, i) => (
                        <td key={dates[i]} className="border border-[#9fb3c8] px-1 py-0.5 text-center text-xs font-bold tabular-nums">
                          {count > 0 ? count : "—"}
                        </td>
                      ))}
                      <td className="border border-[#9fb3c8]" />
                    </tr>
                  </tfoot>
                </table>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
