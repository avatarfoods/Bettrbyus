"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, DollarSign, LayoutGrid, Users, X } from "lucide-react";
import {
  DAY_NAMES,
  addDays,
  dateRange,
  displayName,
  displayTime,
  isOff,
  longDate,
  money,
  monthDay,
  shiftHours,
  sumCosts,
  timeToHours,
  weekCost,
  weekStartOf,
  paidAbsenceMap,
  type AbsenceType,
  type ApprovalStep,
  type Department,
  type Employee,
  type PaySettings,
  type Schedule,
  type Shift,
} from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { Hint } from "@/components/production/settings/shared";
import { StaffingTab } from "@/components/hr/staffing-tab";
import { cn } from "@/lib/utils";

/**
 * The plant, laid out like the production dashboard.
 *
 * One centred control bar - Day, Week or Range; which line; which department -
 * then the days as tiles you can tap, then the work. Two tabs: Overview, which
 * everyone gets and never shows money, and Cost, which only people allowed to
 * see money get. Approved schedules only. A draft is somebody thinking, and
 * the dashboard does not report thinking.
 */
export function HrDashboard({
  span,
  from,
  to,
  day,
  today,
  departments,
  allDepartments,
  employees,
  schedules,
  shifts,
  settings,
  seesCost,
  approvalSteps,
  canEditStaffing,
  absenceTypes,
}: {
  /** Week or range - what the dates mean. A day sits on top of either. */
  span: "week" | "range";
  from: string;
  to: string;
  /** Set when looking at one day. */
  day: string | null;
  today: string;
  /** Departments this person may see. */
  departments: Department[];
  /** Every department, so colour indexes stay stable. */
  allDepartments: Department[];
  employees: Employee[];
  schedules: Schedule[];
  shifts: Shift[];
  settings: PaySettings;
  seesCost: boolean;
  approvalSteps: ApprovalStep[];
  canEditStaffing: boolean;
  absenceTypes: AbsenceType[];
}) {
  const router = useRouter();
  const paidAbsence = useMemo(() => paidAbsenceMap(absenceTypes), [absenceTypes]);
  const days = useMemo(() => dateRange(from, to), [from, to]);
  const isWeek = span === "week";
  /** The URL says what the dates mean; a picked day sits on top. */
  const mode: "day" | "week" | "range" = day ? "day" : span;
  const picked = day && days.includes(day) ? day : days.includes(today) ? today : days[0];

  const view = useSyncExternalStore(subscribeView, readView, serverView);
  const tab: "overview" | "cost" | "staffing" =
    view.tab === "cost" ? (seesCost ? "cost" : "overview") : view.tab === "staffing" ? "staffing" : "overview";
  const setLine = (next: string) => writeView({ ...view, line: next, dept: "" });
  const setDept = (next: string) => writeView({ ...view, dept: next });
  const setTab = (next: "overview" | "cost" | "staffing") => writeView({ ...view, tab: next });

  const go = (nextFrom: string, nextTo: string, nextDay: string | null, nextSpan: "week" | "range" = span) =>
    router.push(
      `/hr?span=${nextSpan}&from=${nextFrom}&to=${nextTo < nextFrom ? nextFrom : nextTo}${nextDay ? `&day=${nextDay}` : ""}`
    );

  /** Switching mode keeps the day you were looking at as the anchor. */
  const setMode = (next: "day" | "week" | "range") => {
    const anchor = picked;
    const ws = weekStartOf(anchor);
    if (next === "day") go(from, to, anchor);
    else if (next === "week") go(ws, addDays(ws, 6), null, "week");
    else go(from, to, null, "range");
  };

  const step = (direction: 1 | -1) => {
    if (mode === "day") {
      const next = addDays(picked, direction);
      if (days.includes(next)) go(from, to, next);
      else if (isWeek) go(weekStartOf(next), addDays(weekStartOf(next), 6), next);
      else go(addDays(from, direction * days.length), addDays(to, direction * days.length), next);
    } else {
      const length = days.length;
      go(addDays(from, direction * length), addDays(to, direction * length), null);
    }
  };

  const lines = useMemo(
    () => [...new Set(departments.map((d) => d.line).filter(Boolean) as string[])].sort(),
    [departments]
  );
  const deptChoices = useMemo(() => departments.filter((d) => !view.line || d.line === view.line), [departments, view.line]);
  const shown = useMemo(() => deptChoices.filter((d) => !view.dept || d.id === view.dept), [deptChoices, view.dept]);

  const look = (d: Department) => departmentColor(d.color, allDepartments.indexOf(d));
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  /** Everything worked out once per department, for the range. */
  const rows = useMemo(() => {
    const inRange = new Set(days);
    const shiftsBySchedule = new Map<string, Shift[]>();
    for (const shift of shifts) {
      if (!inRange.has(shift.workDate)) continue;
      const list = shiftsBySchedule.get(shift.scheduleId) ?? [];
      list.push(shift);
      shiftsBySchedule.set(shift.scheduleId, list);
    }
    return shown.map((department) => {
      const home = employees.filter((e) => e.departmentId === department.id);
      const deptSchedules = schedules.filter((s) => s.departmentId === department.id);
      const deptShifts = deptSchedules.flatMap((s) => shiftsBySchedule.get(s.id) ?? []);

      // Cost is per person per week, then summed - salary is a weekly thing.
      const costs = deptSchedules.flatMap((schedule) => {
        const mine = shiftsBySchedule.get(schedule.id) ?? [];
        const byEmployee = new Map<string, Shift[]>();
        for (const shift of mine) {
          const list = byEmployee.get(shift.employeeId) ?? [];
          list.push(shift);
          byEmployee.set(shift.employeeId, list);
        }
        return [...byEmployee.entries()].map(([id, list]) => {
          const person = empById.get(id);
          return person
            ? weekCost(person, list, settings, department.breakHours, paidAbsence)
            : weekCost({ id, payType: "hourly", payRate: null }, list, settings, department.breakHours, paidAbsence);
        });
      });
      const total = sumCosts(costs);
      const peopleScheduled = new Set(deptShifts.filter((s) => !isOff(s)).map((s) => s.employeeId)).size;

      const perDay = days.map((date) => {
        const onDay = deptShifts
          .filter((s) => s.workDate === date && !isOff(s))
          .sort((a, b) => timeToHours(a.startTime!) - timeToHours(b.startTime!));
        return {
          date,
          shifts: onDay,
          people: onDay.length,
          hours: onDay.reduce((sum, s) => sum + shiftHours(s, department.breakHours), 0),
        };
      });

      // Weeks in range that have an approved schedule, out of weeks in range.
      const weeksInRange = new Set(days.map(weekStartOf)).size;
      return { department, home, schedules: deptSchedules, approvedWeeks: deptSchedules.length, weeksInRange, total, peopleScheduled, perDay };
    });
  }, [shown, employees, schedules, shifts, settings, days, empById, paidAbsence]);

  const plant = rows.reduce(
    (sum, row) => ({
      total: sum.total + row.total.total,
      wages: sum.wages + row.total.wages,
      burden: sum.burden + row.total.burden,
      hours: sum.hours + row.total.hours,
      overtime: sum.overtime + row.total.overtimeHours,
      people: sum.people + row.peopleScheduled,
      headcount: sum.headcount + row.home.length,
      approved: sum.approved + (row.approvedWeeks >= row.weeksInRange ? 1 : 0),
    }),
    { total: 0, wages: 0, burden: 0, hours: 0, overtime: 0, people: 0, headcount: 0, approved: 0 }
  );
  const plantPerDay = days.map((_, i) => rows.reduce((sum, row) => sum + row.perDay[i].people, 0));

  const dayIndex = days.indexOf(picked);
  const dayRows = rows.filter((row) => row.perDay[dayIndex]?.people > 0);
  const dayPeople = plantPerDay[dayIndex] ?? 0;
  const dayHours = rows.reduce((sum, row) => sum + (row.perDay[dayIndex]?.hours ?? 0), 0);

  const rangeLabel =
    mode === "day"
      ? longDate(picked)
      : mode === "week"
        ? `Week of ${longDate(from)}`
        : `${longDate(from)} — ${longDate(to)}`;

  return (
    <div className="flex min-h-full flex-col gap-2.5">
      {/* One bar, centred: when, what. */}
      <div className="flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-sm bg-card px-2 py-1.5 ring-1 ring-foreground/10">
          {/* Three plain buttons, not a dropdown: what you are looking at
              should be readable from across the room. */}
          <div className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
            {(
              [
                ["day", "Day"],
                ["week", "Week"],
                ["range", "Range"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={cn(
                  "h-7 px-2.5 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
                  mode === id ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <button type="button" onClick={() => step(-1)} aria-label="Earlier" className={STEP}>
            <ChevronLeft className="size-4" />
          </button>

          {mode === "day" && (
            <input
              type="date"
              value={picked}
              aria-label="Day"
              onChange={(event) => {
                const next = event.target.value;
                if (!next) return;
                if (days.includes(next)) go(from, to, next);
                else go(weekStartOf(next), addDays(weekStartOf(next), 6), next);
              }}
              className={DATE}
            />
          )}
          {mode === "week" && (
            <span className="px-1 text-xs font-semibold tabular-nums">
              {monthDay(from)} – {monthDay(to)}
            </span>
          )}
          {mode === "range" && (
            <>
              <input
                type="date"
                value={from}
                max={to}
                aria-label="From"
                onChange={(event) => event.target.value && go(event.target.value, to, null, "range")}
                className={DATE}
              />
              <span className="text-xs text-muted-foreground">&rarr;</span>
              <input
                type="date"
                value={to}
                min={from}
                aria-label="To"
                onChange={(event) => event.target.value && go(from, event.target.value, null, "range")}
                className={DATE}
              />
            </>
          )}

          <button type="button" onClick={() => step(1)} aria-label="Later" className={STEP}>
            <ChevronRight className="size-4" />
          </button>

          {mode !== "day" && <span className="text-[0.625rem] text-muted-foreground tabular-nums">{days.length}d</span>}


          {!days.includes(today) && (
            <button
              type="button"
              onClick={() => go(weekStartOf(today), addDays(weekStartOf(today), 6), mode === "day" ? today : null, "week")}
              className="h-7 rounded-sm px-1.5 text-[0.6875rem] font-semibold text-primary hover:bg-muted"
            >
              Today
            </button>
          )}

          <Divider />

          <select
            value={view.line}
            onChange={(event) => setLine(event.target.value)}
            aria-label="Line"
            className={cn(SELECT, view.line && "font-semibold text-foreground")}
          >
            <option value="">All lines</option>
            {lines.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />

          <span className="flex items-center gap-1.5">
            {view.dept &&
              (() => {
                const d = departments.find((x) => x.id === view.dept);
                return d ? <span className={cn("block h-3.5 w-1 shrink-0", look(d).dot)} /> : null;
              })()}
            <select
              value={view.dept}
              onChange={(event) => setDept(event.target.value)}
              aria-label="Department"
              className={cn(SELECT, view.dept && "font-semibold text-foreground")}
            >
              <option value="">All departments</option>
              {deptChoices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      {/* Tabs. Cost exists only for people allowed to see money. */}
      <div className="flex flex-wrap items-end gap-1 border-b-2 border-b-foreground/15">
        <Tab active={tab === "overview"} onClick={() => setTab("overview")} icon={<LayoutGrid />} label="Overview" />
        <Tab active={tab === "staffing"} onClick={() => setTab("staffing")} icon={<Users />} label="Staffing" />
        {seesCost && <Tab active={tab === "cost"} onClick={() => setTab("cost")} icon={<DollarSign />} label="Cost" />}
        <span className="ml-auto flex items-center gap-2 pb-1 text-xs">
          <span className="text-sm font-bold">{rangeLabel}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wider uppercase",
              plant.approved === rows.length && rows.length > 0 ? "bg-success text-white" : "bg-warning-muted text-warning-foreground"
            )}
          >
            {plant.approved === rows.length && rows.length > 0 ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />}
            {plant.approved} of {rows.length} approved
          </span>
        </span>
      </div>

      {tab === "staffing" ? (
        <StaffingTab
          departments={shown}
          allDepartments={allDepartments}
          employees={employees}
          approvalSteps={approvalSteps}
          canEdit={canEditStaffing}
        />
      ) : tab === "cost" ? (
        <CostTab rows={rows} plant={plant} look={look} from={from} to={to} settings={settings} />
      ) : (
        <>
          {/* What is being looked at, said once: the whole span. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <Total value={plant.people} unit={`of ${plant.headcount} scheduled`} />
            <Total value={Math.round(plant.hours)} unit="hours" />
            {plant.overtime > 0.01 && (
              <span className="text-xs font-semibold text-warning-foreground tabular-nums">{plant.overtime.toFixed(1)} h overtime</span>
            )}
            <span className="ml-auto flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
              Tap a date or a number to see who is in
              <Hint text="The table is the dashboard. Tapping a date at the top, or a number under it, opens that day under the table - who is in, by shift. Tap it again to close." />
            </span>
          </div>

          {rows.length === 0 ? (
            <Empty text="No departments to show." />
          ) : (
            <DepartmentTable />
          )}

          {/* The picked day, under the table, not instead of it. */}
          {mode === "day" && rows.length > 0 && (
            <section className="flex flex-col gap-2 border-t-2 border-primary/40 pt-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h3 className="text-sm font-bold">{longDate(picked)}</h3>
                <Total value={dayPeople} unit="people in" />
                <Total value={Math.round(dayHours)} unit="hours" />
                <button
                  type="button"
                  onClick={() => go(from, to, null)}
                  className="ml-auto inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                  Close day
                </button>
              </div>
              {dayRows.length === 0 ? (
                <Empty text={`Nobody is scheduled on ${longDate(picked)}${view.dept || view.line ? " in this selection" : ""}.`} />
              ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {dayRows.map(({ department, perDay }) => {
                  const style = look(department);
                  const d = perDay[dayIndex];
                  return (
                    <section key={department.id} className="relative overflow-hidden rounded-sm bg-card ring-1 ring-foreground/10">
                      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", style.dot)} />
                      <header className={cn("flex items-baseline justify-between gap-2 py-1 pr-2 pl-3", style.tint)}>
                        <Link href={`/hr/schedule?dept=${department.id}&week=${weekStartOf(picked)}`} className="min-w-0 truncate text-[0.6875rem] font-bold tracking-wide uppercase hover:underline">
                          {department.name}
                        </Link>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {d.people}
                          <span className="ml-0.5 text-[0.5625rem] font-normal">people</span>
                          <span className="ml-2 text-xs font-semibold">{d.hours.toFixed(0)} h</span>
                        </span>
                      </header>
                      {/* The day by shift: first shift, its time and headcount,
                          then the second, and who is on each. */}
                      <ul className="flex flex-col">
                        {groupByShift(d.shifts).map((group, index) => (
                          <li key={`${group.start}-${group.end}`} className="border-b border-border/40 last:border-b-0">
                            <p className="flex items-baseline gap-2 bg-surface-sunk py-0.5 pr-2 pl-3 text-[0.625rem]">
                              <span className="font-semibold tracking-wider text-muted-foreground uppercase">
                                {ordinal(index)} shift
                              </span>
                              <span className="font-bold tabular-nums">
                                {displayTime(group.start)}
                                <span className="mx-1 font-normal text-muted-foreground">–</span>
                                {displayTime(group.end)}
                              </span>
                              <span className="ml-auto font-bold tabular-nums">
                                {group.shifts.length}
                                <span className="ml-0.5 font-normal text-muted-foreground">people</span>
                              </span>
                            </p>
                            <ul className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                              {group.shifts.map((s) => {
                                const person = empById.get(s.employeeId);
                                const foreign = person && person.departmentId !== department.id;
                                return (
                                  <li key={s.id} className="truncate py-0.5 pr-2 pl-3 text-xs">
                                    {person ? displayName(person) : "?"}
                                    {foreign && (
                                      <span className="ml-1 text-[0.5625rem] font-semibold text-primary">
                                        from {allDepartments.find((x) => x.id === person.departmentId)?.name ?? "elsewhere"}
                                        {s.isFloat && !s.floatApprovedAt && " ?"}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
              )}
            </section>
          )}
        </>
      )}

      <p className="mt-auto flex items-center gap-2 pt-2 text-[0.6875rem] text-muted-foreground">
        <Users className="size-3.5 shrink-0" />
        Approved schedules only. Drafts are not shown here.
        <Link href="/hr/schedule" className="ml-auto text-primary hover:underline">
          Open the schedule
        </Link>
      </p>
    </div>
  );

  /** The department rows across the days on screen. Defined inside so it shares the page's state. */
  function DepartmentTable() {
    return (
            <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
              <table className="w-full border-collapse text-sm" style={{ minWidth: `${28 + days.length * 3.5}rem` }}>
                <thead>
                  <tr className="bg-surface-sunk">
                    <th className="sticky left-0 z-10 bg-surface-sunk px-3 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">Department</th>
                    <th className="px-2 py-1.5 text-right text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">People</th>
                    {days.map((date, i) => {
                      const active = mode === "day" && date === picked;
                      const isToday = date === today;
                      return (
                        <th key={date} className={cn("border-l border-border/60 p-0 text-center", isWeekend(date) && "bg-surface-sunk/60", isToday && "bg-brand-muted")}>
                          {/* The date is the button: tap to open the day under the table, tap again to close. */}
                          <button
                            type="button"
                            onClick={() => go(from, to, active ? null : date)}
                            aria-pressed={active}
                            title={active ? "Close the day" : `Who is in on ${longDate(date)}`}
                            className={cn(
                              "flex w-full flex-col items-center px-1 py-1 transition-colors hover:bg-brand-muted",
                              active && "bg-primary text-primary-foreground hover:bg-primary"
                            )}
                          >
                            <span className={cn("text-[0.5625rem] font-semibold tracking-wider uppercase", active ? "text-primary-foreground/80" : isToday ? "text-primary" : "text-muted-foreground")}>
                              {isToday ? "Today" : DAY_NAMES[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7].slice(0, 3)}
                            </span>
                            <span className="text-xs font-bold tabular-nums">{monthDay(date)}</span>
                            <span className={cn("text-[0.5625rem] tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                              {plantPerDay[i] > 0 ? `${plantPerDay[i]} in` : "—"}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                    <th className="border-l border-border px-2 py-1.5 text-right text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">Hours</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ department, home, approvedWeeks, weeksInRange, total, peopleScheduled, perDay }) => {
                    const style = look(department);
                    return (
                      <tr key={department.id} className="group border-b border-border/50 last:border-b-0 hover:bg-muted/40">
                        <td className="sticky left-0 z-10 bg-card py-1 pr-3 pl-0 group-hover:bg-muted/40">
                          <Link href={`/hr/schedule?dept=${department.id}&week=${weekStartOf(from)}`} className="flex items-center gap-2">
                            {/* The department's colour, full height, so a column of rows reads as areas. */}
                            <span className={cn("block h-7 w-1.5 shrink-0", style.dot)} />
                            <span className="flex min-w-0 flex-col leading-tight">
                              <span className="truncate text-xs font-semibold">{department.name}</span>
                              <span className="flex items-center gap-1 text-[0.5625rem] text-muted-foreground">
                                {department.line}
                                <span
                                  aria-hidden
                                  className={cn("inline-block size-1.5 rounded-[1px]", approvedWeeks >= weeksInRange ? "bg-success" : "bg-warning-foreground")}
                                />
                                {approvedWeeks >= weeksInRange ? "approved" : approvedWeeks === 0 ? "not approved" : `${approvedWeeks} of ${weeksInRange} weeks`}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-2 py-1 text-right text-xs tabular-nums">
                          <span className="font-semibold">{peopleScheduled}</span>
                          <span className="text-muted-foreground"> / {home.length}</span>
                          {/* How much of the department is in, as a bar. */}
                          <span className="mt-0.5 block h-1 w-full rounded-sm bg-muted">
                            <span className={cn("block h-1 rounded-sm", style.dot)} style={{ width: `${home.length ? Math.min(100, (peopleScheduled / home.length) * 100) : 0}%` }} />
                          </span>
                        </td>
                        {perDay.map((d) => (
                          <td
                            key={d.date}
                            title={d.hours > 0 ? `${d.hours.toFixed(1)} hours` : undefined}
                            className={cn(
                              "border-l border-border/60 px-1 py-1 text-center text-xs tabular-nums",
                              isWeekend(d.date) && "bg-surface-sunk/60",
                              d.date === today && "bg-brand-muted/50",
                              mode === "day" && d.date === picked && "bg-brand-muted",
                              d.people === 0 && "text-muted-foreground/40"
                            )}
                          >
                            {d.people > 0 ? (
                              <button
                                type="button"
                                // Tap to open the day underneath; tap again to close it.
                                onClick={() => go(from, to, mode === "day" && picked === d.date ? null : d.date)}
                                title={mode === "day" && picked === d.date ? "Close the day" : `Who is in on ${longDate(d.date)}`}
                                className={cn(
                                  "inline-block min-w-6 rounded-sm px-1 font-semibold hover:ring-1 hover:ring-primary",
                                  style.tint,
                                  mode === "day" && picked === d.date && "ring-2 ring-primary"
                                )}
                              >
                                {d.people}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        ))}
                        <td className="border-l border-border px-2 py-1 text-right text-xs tabular-nums">
                          {total.hours > 0 ? total.hours.toFixed(0) : ""}
                          {total.overtimeHours > 0.01 && (
                            <span className="ml-1 text-[0.5625rem] font-semibold text-warning-foreground">+{total.overtimeHours.toFixed(1)} OT</span>
                          )}
                        </td>
                        <td className="px-1 py-1 text-right">
                          <Link href={`/hr/schedule?dept=${department.id}&week=${weekStartOf(from)}`} aria-label={`Open ${department.name}`} className="inline-flex text-primary">
                            <ChevronRight className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-t-foreground/20 bg-surface-sunk text-xs">
                    <td className="sticky left-0 z-10 bg-surface-sunk px-3 py-1 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                      {view.line || view.dept ? "Selection" : "Whole plant"}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums">
                      {plant.people}
                      <span className="font-normal text-muted-foreground"> / {plant.headcount}</span>
                    </td>
                    {plantPerDay.map((count, i) => (
                      <td key={days[i]} className="border-l border-border/60 px-1 py-1 text-center font-semibold tabular-nums">
                        {count > 0 ? count : <span className="text-muted-foreground/40">—</span>}
                      </td>
                    ))}
                    <td className="border-l border-border px-2 py-1 text-right font-semibold tabular-nums">{plant.hours.toFixed(0)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
    );
  }
}

/* ---------------- the cost tab ---------------- */

type Row = {
  department: Department;
  home: Employee[];
  approvedWeeks: number;
  weeksInRange: number;
  total: ReturnType<typeof sumCosts>;
  peopleScheduled: number;
};

function CostTab({
  rows,
  plant,
  look,
  from,
  to,
  settings,
}: {
  rows: Row[];
  plant: { total: number; wages: number; burden: number; hours: number; overtime: number; people: number; headcount: number };
  look: (d: Department) => ReturnType<typeof departmentColor>;
  from: string;
  to: string;
  settings: PaySettings;
}) {
  const biggest = Math.max(1, ...rows.map((r) => r.total.total));
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
        <Big label="costs the company" value={money(plant.total)} hint="Wages plus employer taxes, for every approved week in the range. Salaried people count by the week." />
        <Big label="wages" value={money(plant.wages)} />
        <Big label="employer taxes" value={money(plant.burden)} />
        <Big label="hours" value={plant.hours.toFixed(0)} />
        {plant.overtime > 0.01 && <Big label="overtime" value={`${plant.overtime.toFixed(1)} h`} warn />}
        <Big label="people" value={`${plant.people} of ${plant.headcount}`} />
        <span className="ml-auto text-[0.6875rem] text-muted-foreground">
          {monthDay(from)} – {monthDay(to)} · overtime after {settings.weeklyOvertimeAfter} h
        </span>
      </div>

      <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-sunk text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              <th className="px-3 py-1.5 text-left">Department</th>
              <th className="px-2 py-1.5 text-right">People</th>
              <th className="px-2 py-1.5 text-right">Hours</th>
              <th className="px-2 py-1.5 text-right">Overtime</th>
              <th className="px-2 py-1.5 text-right">Wages</th>
              <th className="px-2 py-1.5 text-right">Employer taxes</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="w-40 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => b.total.total - a.total.total)
              .map(({ department, home, total, peopleScheduled }) => {
                const style = look(department);
                return (
                  <tr key={department.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/40">
                    <td className="px-3 py-1">
                      <Link href={`/hr/schedule?dept=${department.id}&week=${weekStartOf(from)}`} className="flex items-center gap-2 text-xs font-semibold hover:underline">
                        <span className={cn("block h-4 w-1 shrink-0", style.dot)} />
                        {department.name}
                      </Link>
                    </td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums">
                      {peopleScheduled}
                      <span className="text-muted-foreground"> / {home.length}</span>
                    </td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums">{total.hours.toFixed(0)}</td>
                    <td className={cn("px-2 py-1 text-right text-xs tabular-nums", total.overtimeHours > 0.01 && "font-semibold text-warning-foreground")}>
                      {total.overtimeHours > 0.01 ? total.overtimeHours.toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums">{money(total.wages)}</td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground">{money(total.burden)}</td>
                    <td className="px-2 py-1 text-right text-xs font-bold tabular-nums">{money(total.total)}</td>
                    <td className="px-2 py-1">
                      <span className="block h-2 rounded-sm bg-muted">
                        <span className={cn("block h-2 rounded-sm", style.dot)} style={{ width: `${(total.total / biggest) * 100}%` }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">No departments to show.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-t-foreground/20 bg-surface-sunk text-xs font-semibold">
              <td className="px-3 py-1 text-[0.5625rem] tracking-wider text-muted-foreground uppercase">Total</td>
              <td className="px-2 py-1 text-right tabular-nums">{plant.people}</td>
              <td className="px-2 py-1 text-right tabular-nums">{plant.hours.toFixed(0)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{plant.overtime > 0.01 ? plant.overtime.toFixed(1) : "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums">{money(plant.wages)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{money(plant.burden)}</td>
              <td className="px-2 py-1 text-right font-bold tabular-nums">{money(plant.total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ---------------- pieces ---------------- */

/** A day's shifts bunched by start and end, earliest start first. */
function groupByShift(shifts: Shift[]): { start: string; end: string; shifts: Shift[] }[] {
  const groups = new Map<string, { start: string; end: string; shifts: Shift[] }>();
  for (const s of shifts) {
    if (!s.startTime || !s.endTime) continue;
    const key = `${s.startTime}|${s.endTime}`;
    const group = groups.get(key) ?? { start: s.startTime, end: s.endTime, shifts: [] };
    group.shifts.push(s);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => timeToHours(a.start) - timeToHours(b.start) || timeToHours(a.end) - timeToHours(b.end)
  );
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function ordinal(index: number): string {
  return ["First", "Second", "Third", "Fourth", "Fifth"][index] ?? `${index + 1}th`;
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "-mb-0.5 inline-flex h-8 items-center gap-1.5 border-b-2 px-3 text-xs font-semibold transition-colors [&>svg]:size-3.5",
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Big({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={cn("text-lg font-bold tabular-nums", warn && "text-warning-foreground")}>{value}</span>
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        {label}
        {hint && <Hint text={hint} />}
      </span>
    </span>
  );
}

function Total({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="text-xs">
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className="ml-1 text-[0.625rem] text-muted-foreground">{unit}</span>
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="flex flex-col items-center gap-1 rounded-sm bg-card px-3 py-10 text-center ring-1 ring-foreground/10">
      <Users className="size-5 text-muted-foreground/40" />
      <span className="text-xs text-muted-foreground">{text}</span>
    </p>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

const STEP = "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-primary transition-colors hover:bg-muted";
const SELECT = "h-7 max-w-40 rounded-sm border-none bg-transparent px-1 text-xs text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none";
const DATE = "h-7 rounded-sm border border-border bg-card px-1.5 text-xs tabular-nums focus:ring-1 focus:ring-primary focus:outline-none";

/* Saved view: this person's, in their browser, like the production dashboard. */
type SavedView = { line: string; dept: string; tab: "overview" | "cost" | "staffing" };
const VIEW_KEY = "bettrbyus:hr-dashboard-view";
const DEFAULT_VIEW: SavedView = { line: "", dept: "", tab: "overview" };
let snapshot: SavedView | null = null;
const listeners = new Set<() => void>();

function subscribeView(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function serverView(): SavedView {
  return DEFAULT_VIEW;
}
function readView(): SavedView {
  if (snapshot) return snapshot;
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SavedView>) : {};
    snapshot = {
      line: typeof parsed.line === "string" ? parsed.line : "",
      dept: typeof parsed.dept === "string" ? parsed.dept : "",
      tab: parsed.tab === "cost" ? "cost" : parsed.tab === "staffing" ? "staffing" : "overview",
    };
  } catch {
    snapshot = DEFAULT_VIEW;
  }
  return snapshot;
}
function writeView(next: SavedView): void {
  snapshot = next;
  try {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage off: the view still works for this visit.
  }
  for (const listener of listeners) listener();
}
