"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  GripVertical,
  LayoutGrid,
  Loader2,
  Save,
  Users,
} from "lucide-react";
import { saveDepartmentOrder } from "@/lib/hr/actions";
import {
  DAY_NAMES,
  addDays,
  dateRange,
  daySpan,
  displayName,
  displayTime,
  isOff,
  longDate,
  money,
  monthDay,
  shiftHours,
  sortPeople,
  sumCosts,
  timeToHours,
  weekCost,
  weekStartOf,
  paidAbsenceMap,
  type AbsenceType,
  type Department,
  type Employee,
  type PaySettings,
  type Schedule,
  type Shift,
} from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { beginDrag, dataOf, moveItem } from "@/components/hr/drag";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/production/settings/shared";
import { StaffingTab } from "@/components/hr/staffing-tab";
import { PayrollTable } from "@/components/hr/payroll-table";
import { cn } from "@/lib/utils";

/**
 * The plant, laid out like the production dashboard.
 *
 * One centred control bar - Day, Week or Range; which line; which department -
 * then the departments as rows across the days. The table is the front page.
 * Tap a department's number under a date and the table gives way to that
 * department alone: its people down, the dates across, the day you tapped lit
 * up. Tap a date at the top and it gives way to that day for the whole plant,
 * by shift. Both have Back. With twenty departments, one thing at a time.
 *
 * Three tabs: Overview, which everyone gets and never shows money; Staffing,
 * the headcount sheet; and Cost, only for people allowed to see money.
 * Approved schedules only - a draft is somebody thinking.
 */
export function HrDashboard({
  span,
  from,
  to,
  day,
  dept,
  today,
  departments,
  allDepartments,
  employees,
  allPeople,
  schedules,
  shifts,
  settings,
  seesCost,
  canEditStaffing,
  canArrange,
  absenceTypes,
}: {
  /** Week or range - what the dates mean. A day sits on top of either. */
  span: "week" | "range";
  from: string;
  to: string;
  /** Set when looking at one day. */
  day: string | null;
  /** Set when looking at one department. */
  dept: string | null;
  today: string;
  /** Departments this person may see. */
  departments: Department[];
  /** Every department, so colour indexes stay stable. */
  allDepartments: Department[];
  /** People on the schedule: active, switched on, not contractors. */
  employees: Employee[];
  /** Every active person, for choosing a supervisor. */
  allPeople: Employee[];
  schedules: Schedule[];
  shifts: Shift[];
  settings: PaySettings;
  seesCost: boolean;
  canEditStaffing: boolean;
  /** May drag departments into a new order. Administrators. */
  canArrange: boolean;
  absenceTypes: AbsenceType[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const paidAbsence = useMemo(() => paidAbsenceMap(absenceTypes), [absenceTypes]);
  const codeOf = useMemo(() => new Map(absenceTypes.map((t) => [t.id, t])), [absenceTypes]);
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

  const go = (
    nextFrom: string,
    nextTo: string,
    nextDay: string | null,
    nextSpan: "week" | "range" = span,
    nextDept: string | null = dept
  ) =>
    router.push(
      `/hr?span=${nextSpan}&from=${nextFrom}&to=${nextTo < nextFrom ? nextFrom : nextTo}${nextDay ? `&day=${nextDay}` : ""}${
        nextDept ? `&dept=${nextDept}` : ""
      }`
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
  const shownIds = useMemo(
    () => new Set(deptChoices.filter((d) => !view.dept || d.id === view.dept).map((d) => d.id)),
    [deptChoices, view.dept]
  );

  const look = (d: Department) => departmentColor(d.color, d.colorIndex);
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  /** Everything worked out once per department, for the range. */
  const allRows = useMemo(() => {
    const inRange = new Set(days);
    const shiftsBySchedule = new Map<string, Shift[]>();
    for (const shift of shifts) {
      if (!inRange.has(shift.workDate)) continue;
      const list = shiftsBySchedule.get(shift.scheduleId) ?? [];
      list.push(shift);
      shiftsBySchedule.set(shift.scheduleId, list);
    }
    return departments.map((department) => {
      const home = employees.filter((e) => e.departmentId === department.id);
      const deptSchedules = schedules.filter((s) => s.departmentId === department.id);
      const deptShifts = deptSchedules.flatMap((s) => shiftsBySchedule.get(s.id) ?? []);

      // Cost is per person per week, then summed - salary is a weekly thing.
      // Each person's week is then spread over the days they worked (a paid
      // day off counts) in proportion to hours, so the days add up to the
      // week exactly and a salaried person's pay lands on their days.
      const dayCost = new Map<string, number>();
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
          const cost = person
            ? weekCost(person, list, settings, department.breakHours, paidAbsence)
            : weekCost({ id, payType: "hourly", payRate: null }, list, settings, department.breakHours, paidAbsence);
          const weights = list.map((s) => ({
            date: s.workDate,
            weight: !isOff(s) ? shiftHours(s, department.breakHours) : s.absenceTypeId ? (paidAbsence.get(s.absenceTypeId) ?? 0) : 0,
          }));
          let sum = weights.reduce((a, w) => a + w.weight, 0);
          if (sum <= 0 && cost.total > 0) {
            for (const w of weights) w.weight = 1;
            sum = weights.length;
          }
          if (sum > 0) {
            for (const w of weights) dayCost.set(w.date, (dayCost.get(w.date) ?? 0) + (cost.total * w.weight) / sum);
          }
          return cost;
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
          cost: dayCost.get(date) ?? 0,
        };
      });

      // Weeks in range that have an approved schedule, out of weeks in range.
      const weeksInRange = new Set(days.map(weekStartOf)).size;
      return { department, home, schedules: deptSchedules, deptShifts, approvedWeeks: deptSchedules.length, weeksInRange, total, peopleScheduled, perDay };
    });
  }, [departments, employees, schedules, shifts, settings, days, empById, paidAbsence]);

  const rows = useMemo(() => allRows.filter((row) => shownIds.has(row.department.id)), [allRows, shownIds]);

  /* ---- arranging: drag departments into a new order, then save ---- */
  const [arranging, setArranging] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const orderedRows = useMemo(() => {
    if (!arranging || !order) return rows;
    const byId = new Map(rows.map((r) => [r.department.id, r]));
    return order.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
  }, [arranging, order, rows]);

  function startArranging() {
    setOrder(rows.map((r) => r.department.id));
    setArranging(true);
  }
  function stopArranging() {
    setArranging(false);
    setOrder(null);
    setDropOn(null);
  }
  function dragDepartment(event: React.PointerEvent<HTMLElement>, id: string) {
    const cell = (event.currentTarget as HTMLElement).closest("td") as HTMLElement | null;
    beginDrag(event, {
      hit: "[data-dept-row]",
      ghost: cell,
      onMove: (target) => setDropOn(dataOf(target, "deptRow")),
      onDrop: (target) => {
        const to = dataOf(target, "deptRow");
        if (!to || to === id || !order) return;
        setOrder(moveItem(order, order.indexOf(id), order.indexOf(to)));
      },
      onEnd: () => setDropOn(null),
    });
  }
  function saveArrangement() {
    if (!order) return;
    // The rows on screen may be a selection: they take their new order in the
    // slots they already occupy, and every other department keeps its place.
    const queue = [...order];
    const ids = allDepartments.map((d) => (shownIds.has(d.id) ? (queue.shift() ?? d.id) : d.id));
    startTransition(async () => {
      const result = await saveDepartmentOrder({ ids });
      if (!result.ok) {
        await confirm({ title: result.message, cancelLabel: false });
        return;
      }
      stopArranging();
      router.refresh();
    });
  }

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

  const deptRow = dept ? allRows.find((row) => row.department.id === dept) ?? null : null;

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
      </div>

      {tab === "staffing" ? (
        <StaffingTab departments={rows.map((r) => r.department)} employees={allPeople} canEdit={canEditStaffing} />
      ) : tab === "cost" ? (
        <CostTab rows={rows} plant={plant} look={look} from={from} to={to} days={days} today={today} settings={settings} people={allPeople} />
      ) : deptRow ? (
        <DepartmentPage row={deptRow} />
      ) : mode === "day" ? (
        <DayPage />
      ) : (
        <>
          {/* What is being looked at, said once: the whole span, in the same card every tab starts with. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
            <Big label="scheduled" value={`${plant.people} of ${plant.headcount}`} tone="blue" />
            <Big label="hours" value={String(Math.round(plant.hours))} tone="green" />
            {plant.overtime > 0.01 && <Big label="overtime" value={`${plant.overtime.toFixed(1)} h`} warn />}
            <Big
              label="approved"
              value={`${plant.approved} of ${rows.length}`}
              tone={plant.approved === rows.length && rows.length > 0 ? "green" : "amber"}
            />
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
                {arranging ? "Drag a department by its grip, then Save order" : "Tap a number to open a department, a date to open the day"}
                <Hint text="A number under a date opens that department alone: its people down, the dates across, that day lit up. A date at the top opens the whole plant for that day, by shift. Back returns here." />
              </span>
              {canArrange && rows.length > 1 && (
                arranging ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={saveArrangement}
                      className="inline-flex h-6 items-center gap-1 rounded-sm bg-success px-2 text-[0.6875rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {pending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                      Save order
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={stopArranging}
                      className="inline-flex h-6 items-center rounded-sm px-2 text-[0.6875rem] text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={startArranging}
                    title="Drag departments into the order you want. It holds everywhere: here, staffing, the schedule's list."
                    className="inline-flex h-6 items-center gap-1 rounded-sm bg-card px-2 text-[0.6875rem] font-semibold ring-1 ring-foreground/15 hover:bg-muted"
                  >
                    <GripVertical className="size-3" />
                    Arrange
                  </button>
                )
              )}
            </span>
          </div>

          {rows.length === 0 ? <Empty text="No departments to show." /> : <DepartmentTable />}
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
      <div className={cn("overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10", arranging && "select-none [-webkit-touch-callout:none] ring-2 ring-primary/40")}>
        <table className="w-full border-collapse text-sm" style={{ minWidth: `${22 + days.length * 5}rem` }}>
          <thead>
            <tr className="bg-brand-muted">
              <th className="sticky left-0 z-10 w-40 bg-brand-muted px-3 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">Department</th>
              <th className="px-2 py-1.5 text-right text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">People</th>
              {days.map((date, i) => {
                const isToday = date === today;
                return (
                  <th key={date} className={cn("border-l border-border/60 p-0 text-center", isWeekend(date) && "bg-surface-sunk/60", isToday && "bg-brand-muted")}>
                    {/* The date is the button: tap to open the day for the whole plant. */}
                    <button
                      type="button"
                      disabled={arranging}
                      onClick={() => go(from, to, date)}
                      title={`Who is in on ${longDate(date)}`}
                      className="flex w-full flex-col items-center px-1 py-1 transition-colors hover:bg-brand-muted disabled:hover:bg-transparent"
                    >
                      <span className={cn("text-[0.5625rem] font-semibold tracking-wider uppercase", isToday ? "text-primary" : "text-muted-foreground")}>
                        {isToday ? "Today" : dayShort(date)}
                      </span>
                      <span className="text-xs font-bold tabular-nums">{monthDay(date)}</span>
                      <span className="text-[0.5625rem] text-muted-foreground tabular-nums">{plantPerDay[i] > 0 ? `${plantPerDay[i]} in` : "—"}</span>
                    </button>
                  </th>
                );
              })}
              <th className="border-l border-border px-2 py-1.5 text-right text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">Hours</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {groupByLine(orderedRows).flatMap((group) => [
              <tr key={`line-${group.line}`} className="border-y border-primary/15 bg-brand-muted/40">
                <td className="sticky left-0 z-10 bg-brand-muted/40 px-3 py-0.5 text-[0.5625rem] font-bold tracking-wider text-primary uppercase">
                  {group.line}
                </td>
                <td className="px-2 py-0.5 text-right text-[0.625rem] font-semibold text-primary tabular-nums">
                  {group.rows.reduce((sum, r) => sum + r.peopleScheduled, 0)}
                  <span className="font-normal text-primary/60"> / {group.rows.reduce((sum, r) => sum + r.home.length, 0)}</span>
                </td>
                {days.map((date, i) => {
                  const count = group.rows.reduce((sum, r) => sum + (r.perDay[i]?.people ?? 0), 0);
                  return (
                    <td key={date} className="border-l border-primary/10 px-1 py-0.5 text-center text-[0.625rem] font-semibold text-primary tabular-nums">
                      {count > 0 ? count : <span className="text-primary/30">—</span>}
                    </td>
                  );
                })}
                <td className="border-l border-primary/10 px-2 py-0.5 text-right text-[0.625rem] font-semibold text-primary tabular-nums">
                  {Math.round(group.rows.reduce((sum, r) => sum + r.total.hours, 0)) || ""}
                </td>
                <td />
              </tr>,
              ...group.rows.map(({ department, home, approvedWeeks, weeksInRange, total, peopleScheduled, perDay }) => {
              const style = look(department);
              const isDrop = arranging && dropOn === department.id;
              return (
                <tr
                  key={department.id}
                  data-dept-row={arranging ? department.id : undefined}
                  className={cn("group border-b border-border/50 last:border-b-0 hover:bg-muted/40", isDrop && "border-t-2 border-t-primary bg-brand-muted")}
                >
                  <td className={cn("sticky left-0 z-10 py-1 pr-3 pl-0", isDrop ? "bg-brand-muted" : "bg-card group-hover:bg-muted/40")}>
                    {arranging ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          role="button"
                          aria-label={`Move ${department.name}`}
                          title="Drag to change the order"
                          onPointerDown={(event) => dragDepartment(event, department.id)}
                          className="inline-flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" />
                        </span>
                        <span className={cn("block h-7 w-1.5 shrink-0", style.dot)} />
                        <span className="truncate text-xs font-semibold">{department.name}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => go(from, to, null, span, department.id)}
                        title={`Open ${department.name}: its people across these dates`}
                        className="flex w-full items-center gap-2 text-left hover:underline"
                      >
                        {/* The department's colour, full height, so a column of rows reads as areas. */}
                        <span className={cn("block h-7 w-1.5 shrink-0", style.dot)} />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-xs font-semibold">{department.name}</span>
                          <span className="flex min-w-0 items-center gap-1 truncate text-[0.5625rem] text-muted-foreground">
                            <span
                              aria-hidden
                              className={cn("inline-block size-1.5 shrink-0 rounded-[1px]", approvedWeeks >= weeksInRange ? "bg-success" : "bg-warning-foreground")}
                            />
                            {approvedWeeks >= weeksInRange ? "approved" : approvedWeeks === 0 ? "not approved" : `${approvedWeeks} of ${weeksInRange} wk`}
                          </span>
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right text-xs tabular-nums">
                    <span className="font-semibold">{peopleScheduled}</span>
                    <span className="text-muted-foreground"> / {home.length}</span>
                  </td>
                  {perDay.map((d) => (
                    <td
                      key={d.date}
                      title={d.hours > 0 ? `${d.hours.toFixed(1)} hours` : undefined}
                      className={cn(
                        "border-l border-border/60 p-0.5 text-center text-xs tabular-nums",
                        isWeekend(d.date) && "bg-surface-sunk/60",
                        d.date === today && "bg-brand-muted/50"
                      )}
                    >
                      {d.people > 0 ? (
                        <button
                          type="button"
                          disabled={arranging}
                          // The number opens the department with this day lit up.
                          onClick={() => go(from, to, d.date, span, department.id)}
                          title={`${department.name} on ${longDate(d.date)}: who is in`}
                          className={cn("flex w-full flex-col items-center rounded-sm px-1 py-0.5 leading-tight hover:ring-1 hover:ring-primary", style.tint)}
                        >
                          <span className="text-xs font-bold whitespace-nowrap">
                            {d.people} <span className="text-[0.625rem] font-medium">{d.people === 1 ? "person" : "people"}</span>
                          </span>
                          <span className="text-[0.5625rem] font-medium text-foreground/70 whitespace-nowrap">{daySpan(d.shifts)}</span>
                        </button>
                      ) : (
                        <span className="block py-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground/40">OFF</span>
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
                    <Link href={`/hr/schedule?dept=${department.id}&from=${weekStartOf(from)}`} aria-label={`Open ${department.name} in the schedule`} title="Open in the schedule" className="inline-flex text-primary">
                      <ChevronRight className="size-4" />
                    </Link>
                  </td>
                </tr>
              );
            }),
            ])}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-t-success/40 bg-success/10 text-xs">
              <td className="sticky left-0 z-10 bg-success/10 px-3 py-1 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
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

  /** One day, the whole plant, by shift. The second page inside Overview. */
  function DayPage() {
    return (
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <BackButton label="All departments" onClick={() => go(from, to, null, span, null)} />
          <h3 className="text-sm font-bold">{longDate(picked)}</h3>
          <Total value={dayPeople} unit="people in" />
          <Total value={Math.round(dayHours)} unit="hours" />
          <span className="ml-auto flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
            Tap a department to see its week
            <Hint text="Each card is one department on this day, grouped by shift. The department's name opens it across the dates, with this day lit up." />
          </span>
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
                    <button
                      type="button"
                      onClick={() => go(from, to, picked, span, department.id)}
                      className="min-w-0 truncate text-left text-[0.6875rem] font-bold tracking-wide uppercase hover:underline"
                    >
                      {department.name}
                    </button>
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
                        <p className="flex items-baseline gap-2 bg-brand-muted/40 py-0.5 pr-2 pl-3 text-[0.625rem]">
                          <span className="font-semibold tracking-wider text-muted-foreground uppercase">{ordinal(index)} shift</span>
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
    );
  }

  /**
   * One department across the dates on screen: its people down, the days
   * across, a tapped day lit up. What the schedule shows, read-only, without
   * leaving the dashboard.
   */
  function DepartmentPage({ row }: { row: (typeof allRows)[number] }) {
    const { department, home, deptShifts, perDay, peopleScheduled, total, approvedWeeks, weeksInRange } = row;
    const style = look(department);
    const byKey = new Map(deptShifts.map((s) => [`${s.employeeId}|${s.workDate}`, s]));
    const homeIds = new Set(home.map((e) => e.id));
    const foreign = [...new Set(deptShifts.filter((s) => !homeIds.has(s.employeeId) && !isOff(s)).map((s) => s.employeeId))]
      .map((id) => empById.get(id))
      .filter(Boolean) as Employee[];
    const people = [...sortPeople(home), ...foreign];
    const dayGroups = day ? groupByShift(perDay[dayIndex]?.shifts ?? []) : [];

    return (
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <BackButton label="All departments" onClick={() => go(from, to, null, span, null)} />
          <span className={cn("inline-flex items-center gap-1.5 rounded-sm py-0.5 pr-2 pl-1.5 text-xs font-bold tracking-wide uppercase", style.tint)}>
            <span className={cn("block h-4 w-1", style.dot)} />
            {department.name}
          </span>
          <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
            {department.line}
            <span aria-hidden className={cn("inline-block size-1.5 rounded-[1px]", approvedWeeks >= weeksInRange ? "bg-success" : "bg-warning-foreground")} />
            {approvedWeeks >= weeksInRange ? "approved" : approvedWeeks === 0 ? "not approved" : `${approvedWeeks} of ${weeksInRange} weeks`}
          </span>
          <Total value={peopleScheduled} unit={`of ${home.length} scheduled`} />
          <Total value={Math.round(total.hours)} unit="hours" />
          <Link
            href={`/hr/schedule?dept=${department.id}&from=${weekStartOf(day ?? from)}`}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary/10"
          >
            Open in the schedule
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {day && dayGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem]">
            <span className="font-semibold">{longDate(day)}:</span>
            {dayGroups.map((group, index) => (
              <span key={`${group.start}-${group.end}`} className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5", style.tint)}>
                <span className="font-semibold tracking-wider text-muted-foreground uppercase">{ordinal(index)} shift</span>
                <span className="font-bold tabular-nums">
                  {displayTime(group.start)} – {displayTime(group.end)}
                </span>
                <span className="tabular-nums">· {group.shifts.length} people</span>
              </span>
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
          <table className="w-full border-collapse text-xs" style={{ minWidth: `${14 + days.length * 6}rem` }}>
            <thead>
              <tr className="bg-brand-muted">
                <th className="sticky left-0 z-10 w-44 bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">Person</th>
                {days.map((date, i) => {
                  const lit = date === day;
                  const isToday = date === today;
                  return (
                    <th key={date} className={cn("border-l border-border/60 p-0 text-center", isWeekend(date) && "bg-surface-sunk/60", isToday && !lit && "bg-brand-muted")}>
                      <button
                        type="button"
                        onClick={() => go(from, to, lit ? null : date, span, department.id)}
                        aria-pressed={lit}
                        title={lit ? "Unlight the day" : `Light up ${longDate(date)}`}
                        className={cn("flex w-full flex-col items-center px-1 py-1 transition-colors hover:bg-brand-muted", lit && "bg-primary text-primary-foreground hover:bg-primary")}
                      >
                        <span className={cn("text-[0.5625rem] font-semibold tracking-wider uppercase", lit ? "text-primary-foreground/80" : isToday ? "text-primary" : "text-muted-foreground")}>
                          {isToday ? "Today" : dayShort(date)}
                        </span>
                        <span className="text-xs font-bold tabular-nums">{monthDay(date)}</span>
                        <span className={cn("text-[0.5625rem] tabular-nums", lit ? "text-primary-foreground/80" : "text-muted-foreground")}>
                          {perDay[i].people > 0 ? `${perDay[i].people} in` : "—"}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th className="w-16 border-l border-border px-2 py-1.5 text-right text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">Hours</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const away = person.departmentId !== department.id;
                const hours = days.reduce((sum, date) => {
                  const s = byKey.get(`${person.id}|${date}`);
                  return sum + (s ? shiftHours(s, department.breakHours) : 0);
                }, 0);
                return (
                  <tr key={person.id} className="group border-b border-border/50 last:border-b-0 hover:bg-muted/40">
                    <td className="sticky left-0 z-10 bg-card px-2 py-0.5 group-hover:bg-muted/40">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("block h-3.5 w-0.5 shrink-0", style.dot)} />
                        <span className="min-w-0 truncate font-medium">{displayName(person)}</span>
                        {away && (
                          <span className="shrink-0 text-[0.5625rem] font-semibold text-primary">
                            from {allDepartments.find((x) => x.id === person.departmentId)?.name ?? "elsewhere"}
                          </span>
                        )}
                      </span>
                    </td>
                    {days.map((date) => {
                      const s = byKey.get(`${person.id}|${date}`);
                      const off = isOff(s);
                      const absence = s?.absenceTypeId ? codeOf.get(s.absenceTypeId) : undefined;
                      const absenceLook = absence ? departmentColor(absence.color, absenceTypes.indexOf(absence)) : null;
                      return (
                        <td
                          key={date}
                          className={cn(
                            "border-l border-border/60 p-0.5 text-center tabular-nums",
                            isWeekend(date) && "bg-surface-sunk/60",
                            date === day && "bg-brand-muted"
                          )}
                        >
                          <span
                            className={cn(
                              "flex min-h-7 flex-col items-center justify-center rounded-sm px-1 text-[0.6875rem] leading-tight",
                              !off && cn("font-semibold", style.tint),
                              off && absenceLook?.tint
                            )}
                          >
                            {off ? (
                              absence ? (
                                <span title={absence.name} className="font-black tracking-wider">
                                  {absence.code}
                                </span>
                              ) : (
                                <span className="font-semibold text-muted-foreground/50">OFF</span>
                              )
                            ) : (
                              <>
                                <span>{displayTime(s!.startTime!)}</span>
                                <span className="font-medium opacity-80">{displayTime(s!.endTime!)}</span>
                              </>
                            )}
                          </span>
                        </td>
                      );
                    })}
                    <td className="border-l border-border px-2 py-0.5 text-right font-semibold tabular-nums">{hours > 0 ? hours.toFixed(1) : ""}</td>
                  </tr>
                );
              })}
              {people.length === 0 && (
                <tr>
                  <td colSpan={days.length + 2} className="px-3 py-8 text-center text-muted-foreground">
                    Nobody in {department.name}{approvedWeeks === 0 ? ", or nothing approved for these dates" : ""}.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-t-success/40 bg-success/10">
                <td className="sticky left-0 z-10 bg-success/10 px-2 py-1 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">People in</td>
                {perDay.map((d) => (
                  <td key={d.date} className={cn("border-l border-border/60 px-1 py-1 text-center font-semibold tabular-nums", d.date === day && "bg-brand-muted")}>
                    {d.people > 0 ? d.people : <span className="text-muted-foreground/40">—</span>}
                  </td>
                ))}
                <td className="border-l border-border px-2 py-1 text-right font-semibold tabular-nums">{total.hours.toFixed(0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
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
  perDay: { date: string; people: number; hours: number; cost: number }[];
};

function CostTab({
  rows,
  plant,
  look,
  from,
  to,
  days,
  today,
  settings,
  people,
}: {
  rows: Row[];
  plant: { total: number; wages: number; burden: number; hours: number; overtime: number; people: number; headcount: number };
  look: (d: Department) => ReturnType<typeof departmentColor>;
  from: string;
  to: string;
  days: string[];
  today: string;
  settings: PaySettings;
  /** Everyone active, for payroll on the books. */
  people: Employee[];
}) {
  const [view, setView] = useState<"byday" | "scheduled" | "payroll">("byday");
  const biggest = Math.max(1, ...rows.map((r) => r.total.total));
  const toggle = (
    <div className="flex overflow-hidden rounded-sm ring-1 ring-foreground/15">
      {(
        [
          ["byday", "By day"],
          ["scheduled", "Totals"],
          ["payroll", "Payroll on the books"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          className={cn(
            "h-7 px-2.5 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors",
            view === id ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
  if (view === "byday") {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
          {toggle}
          <span className="ml-auto flex flex-wrap items-center gap-x-4">
            <Big label={days.length === 1 ? "this day" : days.length === 7 ? "this week" : `these ${days.length} days`} value={money(plant.total)} />
            {days.length > 1 && <Big label="a day, on average" value={money(plant.total / days.length)} />}
            {plant.overtime > 0.01 && <Big label="overtime" value={`${plant.overtime.toFixed(1)} h`} warn />}
            <Hint text="What each department costs each day: wages plus employer taxes from the approved weeks on screen. Each person's week is spread over the days they worked in proportion to hours, so the days add up to the week exactly - salaried people land on their days, overtime on the days that made it." />
          </span>
        </div>
        <CostGrid rows={rows} days={days} today={today} look={look} />
      </div>
    );
  }
  if (view === "payroll") {
    return (
      <div className="flex flex-col gap-2.5">
        <PayrollTable departments={rows.map((r) => r.department)} people={people} settings={settings} look={look} leading={toggle} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm bg-card px-3 py-2 ring-1 ring-foreground/10">
        {toggle}
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
            <tr className="bg-brand-muted text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
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
                      <Link href={`/hr/schedule?dept=${department.id}&from=${weekStartOf(from)}`} className="flex items-center gap-2 text-xs font-semibold hover:underline">
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
                    <td className="px-2 py-1 text-right text-xs text-muted-foreground tabular-nums">{money(total.burden)}</td>
                    <td className="px-2 py-1 text-right text-xs font-bold tabular-nums">{money(total.total)}</td>
                    <td className="px-2 py-1">
                      <span className="block h-2 rounded-sm bg-muted">
                        <span className={cn("block h-2 rounded-sm", style.soft)} style={{ width: `${(total.total / biggest) * 100}%` }} />
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
            <tr className="border-t-2 border-t-success/40 bg-success/10 text-xs font-semibold">
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

/** Money across the days: a department per row, a date per column, the total at the end. */
function CostGrid({
  rows,
  days,
  today,
  look,
}: {
  rows: Row[];
  days: string[];
  today: string;
  look: (d: Department) => ReturnType<typeof departmentColor>;
}) {
  const perDayTotal = days.map((_, i) => rows.reduce((sum, r) => sum + (r.perDay[i]?.cost ?? 0), 0));
  const grand = rows.reduce((sum, r) => sum + r.total.total, 0);
  return (
    <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
      <table className="w-full border-collapse text-sm" style={{ minWidth: `${22 + days.length * 5.5}rem` }}>
        <thead>
          <tr className="bg-brand-muted">
            <th className="sticky left-0 z-10 w-40 bg-brand-muted px-3 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">Department</th>
            {days.map((date, i) => (
              <th key={date} className={cn("border-l border-border/60 px-1 py-1 text-center", isWeekend(date) && "bg-surface-sunk/60", date === today && "bg-brand-muted")}>
                <span className={cn("block text-[0.5625rem] font-semibold tracking-wider uppercase", date === today ? "text-primary" : "text-muted-foreground")}>
                  {date === today ? "Today" : dayShort(date)}
                </span>
                <span className="block text-xs font-bold tabular-nums">{monthDay(date)}</span>
                <span className="block text-[0.5625rem] font-semibold text-muted-foreground tabular-nums">{perDayTotal[i] > 0 ? money(perDayTotal[i]) : "—"}</span>
              </th>
            ))}
            <th className="border-l border-border px-2 py-1.5 text-right text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">Total</th>
          </tr>
        </thead>
        <tbody>
          {groupByLine(rows).flatMap((group) => [
            <tr key={`line-${group.line}`} className="border-y border-primary/15 bg-brand-muted/40">
              <td className="sticky left-0 z-10 bg-brand-muted/40 px-3 py-0.5 text-[0.5625rem] font-bold tracking-wider text-primary uppercase">
                {group.line}
              </td>
              {days.map((date, i) => {
                const cost = group.rows.reduce((sum, r) => sum + (r.perDay[i]?.cost ?? 0), 0);
                return (
                  <td key={date} className="border-l border-primary/10 px-1 py-0.5 text-center text-[0.625rem] font-semibold text-primary tabular-nums">
                    {cost > 0 ? money(cost) : <span className="text-primary/30">—</span>}
                  </td>
                );
              })}
              <td className="border-l border-primary/10 px-2 py-0.5 text-right text-[0.625rem] font-semibold text-primary tabular-nums">
                {money(group.rows.reduce((sum, r) => sum + r.total.total, 0))}
              </td>
            </tr>,
            ...group.rows.map(({ department, perDay, total }) => {
            const style = look(department);
            return (
              <tr key={department.id} className="group border-b border-border/50 last:border-b-0 hover:bg-muted/40">
                <td className="sticky left-0 z-10 bg-card py-1 pr-3 pl-0 group-hover:bg-muted/40">
                  <span className="flex items-center gap-2">
                    <span className={cn("block h-7 w-1.5 shrink-0", style.dot)} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-xs font-semibold">{department.name}</span>
                      <span className="truncate text-[0.5625rem] text-muted-foreground">{department.line}</span>
                    </span>
                  </span>
                </td>
                {perDay.map((d) => (
                  <td
                    key={d.date}
                    className={cn("border-l border-border/60 p-0.5 text-center tabular-nums", isWeekend(d.date) && "bg-surface-sunk/60", d.date === today && "bg-brand-muted/50")}
                  >
                    {d.cost > 0 ? (
                      <span className={cn("flex flex-col items-center rounded-sm px-1 py-0.5 leading-tight", style.tint)}>
                        <span className="text-xs font-bold whitespace-nowrap">{money(d.cost)}</span>
                        <span className="text-[0.5625rem] text-foreground/70 whitespace-nowrap">
                          {d.hours.toFixed(0)} h · {d.people} {d.people === 1 ? "person" : "people"}
                        </span>
                      </span>
                    ) : (
                      <span className="block py-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground/40">OFF</span>
                    )}
                  </td>
                ))}
                <td className="border-l border-border px-2 py-1 text-right text-xs font-bold tabular-nums">
                  {total.total > 0 ? money(total.total) : ""}
                  {total.overtimeHours > 0.01 && (
                    <span className="block text-[0.5625rem] font-semibold text-warning-foreground">{total.overtimeHours.toFixed(1)} h OT</span>
                  )}
                </td>
              </tr>
            );
          }),
          ])}
          {rows.length === 0 && (
            <tr>
              <td colSpan={days.length + 2} className="px-3 py-10 text-center text-sm text-muted-foreground">No departments to show.</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-t-success/40 bg-success/10 text-xs font-semibold">
            <td className="sticky left-0 z-10 bg-success/10 px-3 py-1 text-[0.5625rem] tracking-wider text-muted-foreground uppercase">Total</td>
            {perDayTotal.map((c, i) => (
              <td key={days[i]} className="border-l border-border/60 px-1 py-1 text-center tabular-nums">
                {c > 0 ? money(c) : <span className="text-muted-foreground/40">—</span>}
              </td>
            ))}
            <td className="border-l border-border px-2 py-1 text-right font-bold tabular-nums">{money(grand)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---------------- pieces ---------------- */

/** Rows bunched under their line - Bettr Bowl, Pizza, Warehouse... - in the order they come. */
function groupByLine<T extends { department: Department }>(rows: T[]): { line: string; rows: T[] }[] {
  const groups: { line: string; rows: T[] }[] = [];
  for (const row of rows) {
    const line = row.department.line ?? "Other";
    const group = groups.find((g) => g.line === line);
    if (group) group.rows.push(row);
    else groups.push({ line, rows: [row] });
  }
  return groups;
}

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

function dayShort(date: string): string {
  return DAY_NAMES[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7].slice(0, 3);
}

function ordinal(index: number): string {
  return ["First", "Second", "Third", "Fourth", "Fifth"][index] ?? `${index + 1}th`;
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-sm bg-card px-2 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {label}
    </button>
  );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "-mb-0.5 inline-flex h-7 items-center gap-1 border-b-2 px-2.5 text-[0.6875rem] font-semibold transition-colors [&>svg]:size-3",
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Big({
  label,
  value,
  hint,
  warn,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
  tone?: "blue" | "green" | "amber";
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span
        className={cn(
          "text-lg font-bold tabular-nums",
          warn && "text-warning-foreground",
          tone === "blue" && "text-primary",
          tone === "green" && "text-success",
          tone === "amber" && "text-warning-foreground"
        )}
      >
        {value}
      </span>
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
