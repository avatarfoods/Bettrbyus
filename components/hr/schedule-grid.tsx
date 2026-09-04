"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, CheckCircle2, GripVertical, Loader2, MailX, Trash2, X } from "lucide-react";
import { approveFloats, clearShifts, removeFloater, saveEmployeeOrder, saveShifts } from "@/lib/hr/actions";
import type { AwayShift, WeekOnScreen } from "@/lib/hr/fetch";
import {
  DAY_NAMES,
  commonShifts,
  displayName,
  displayTime,
  isOff,
  money,
  monthDay,
  paidAbsenceMap,
  sendTo,
  shiftHours,
  shiftLabel,
  sumCosts,
  timeOptions,
  weekCost,
  weekDates,
  weekStartOf,
  type AbsenceType,
  type Department,
  type Employee,
  type PaySettings,
  type Shift,
} from "@/lib/hr/model";
import { departmentColor } from "@/lib/hr/colors";
import { beginDrag, dataOf, moveItem } from "@/lib/drag";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/production/settings/shared";
import { cn } from "@/lib/utils";

/**
 * The schedule, one row per person, one column per day.
 *
 * Built from the workbook people already read - people down, days across,
 * START and END in each day, OFF where there is nothing - and made for people
 * who do not much like computers: a day is a button, tapping it opens one
 * card with big choices, and the card writes the day the moment Save is
 * pressed. Arrow keys walk the grid; Enter opens a day; Delete makes it OFF.
 *
 * While editing, a day with hours on it can be picked up and dropped on
 * another day, or on another person, and the hours move there. Rows can be
 * picked up by the grip beside the name and dropped where they belong, so
 * the grid sits in the order the floor does.
 *
 * Locked until Edit is pressed, like the production plan. Tapping a locked
 * day says so instead of doing nothing.
 */
export function ScheduleGrid({
  departmentId,
  departmentName,
  departmentColorKey,
  departmentIndex,
  dates,
  weeks,
  employees,
  floaters,
  departments,
  shifts,
  away,
  settings,
  breakHours,
  absenceTypes,
  editing,
  seesCost,
  canApproveFloat,
  canArrange,
}: {
  departmentId: string;
  departmentName: string;
  departmentColorKey: string | null;
  departmentIndex: number;
  /** The days on screen: one, a week, or a range. */
  dates: string[];
  /** The weeks those days fall in, with what is on screen for each. */
  weeks: WeekOnScreen[];
  /** This department's own people, in their order. */
  employees: Employee[];
  /** People from other departments with a shift in what is on screen. */
  floaters: Employee[];
  departments: Department[];
  shifts: Shift[];
  /** Own people working elsewhere. */
  away: AwayShift[];
  settings: PaySettings;
  breakHours: number;
  /** Reasons a day can be off, for the card and the cell. */
  absenceTypes: AbsenceType[];
  editing: boolean;
  seesCost: boolean;
  canApproveFloat: boolean;
  /** May drag rows into a new order. Administrators. */
  canArrange: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();
  const look = departmentColor(departmentColorKey, departmentIndex);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const weekByStart = useMemo(() => new Map(weeks.map((w) => [w.weekStart, w])), [weeks]);
  const absenceById = useMemo(() => new Map(absenceTypes.map((t) => [t.id, t])), [absenceTypes]);
  const paidAbsence = useMemo(() => paidAbsenceMap(absenceTypes), [absenceTypes]);

  /*
    A row order arranged here, kept until the server comes back with the
    saved one. Tied to the employees array it was made from, so a refresh
    with a new list simply shows the server's order.
  */
  const [arranged, setArranged] = useState<{ base: Employee[]; ids: string[] } | null>(null);
  const ordered = useMemo(() => {
    if (!arranged || arranged.base !== employees) return employees;
    const byId = new Map(employees.map((e) => [e.id, e]));
    return arranged.ids.map((id) => byId.get(id)).filter(Boolean) as Employee[];
  }, [arranged, employees]);

  const byKey = useMemo(() => {
    const map = new Map<string, Shift>();
    for (const shift of shifts) map.set(`${shift.employeeId}|${shift.workDate}`, shift);
    return map;
  }, [shifts]);

  const awayByKey = useMemo(() => {
    const map = new Map<string, AwayShift>();
    for (const a of away) map.set(`${a.employeeId}|${a.workDate}`, a);
    return map;
  }, [away]);

  const everyone = useMemo(() => [...ordered, ...floaters], [ordered, floaters]);
  const usual = useMemo(() => commonShifts(shifts), [shifts]);

  /**
   * Each person, costed per week and summed over the weeks on screen.
   * Salary is a weekly thing, so a range is never costed as one long week.
   */
  const costs = useMemo(
    () =>
      everyone.map((employee) => {
        const perWeek = weeks.map((week) =>
          weekCost(
            employee,
            weekDates(week.weekStart)
              .map((date) => byKey.get(`${employee.id}|${date}`))
              .filter(Boolean) as Shift[],
            settings,
            breakHours,
            paidAbsence
          )
        );
        return sumCosts(perWeek);
      }),
    [everyone, weeks, byKey, settings, breakHours, paidAbsence]
  );
  const total = costs.reduce(
    (sum, c) => ({
      hours: sum.hours + c.hours,
      overtimeHours: sum.overtimeHours + c.overtimeHours,
      paidAbsenceHours: sum.paidAbsenceHours + c.paidAbsenceHours,
      wages: sum.wages + c.wages,
      burden: sum.burden + c.burden,
      total: sum.total + c.total,
      people: sum.people + (c.people > 0 ? 1 : 0),
    }),
    { hours: 0, overtimeHours: 0, paidAbsenceHours: 0, wages: 0, burden: 0, total: 0, people: 0 }
  );

  const dayHours = dates.map((date) =>
    everyone.reduce((sum, employee) => {
      const shift = byKey.get(`${employee.id}|${date}`);
      return sum + (shift ? shiftHours(shift, breakHours) : 0);
    }, 0)
  );
  const dayPeople = dates.map(
    (date) => everyone.filter((e) => !isOff(byKey.get(`${e.id}|${date}`))).length
  );

  /** Which day is open for editing: employee id and date. Nothing while locked. */
  const [openCell, setOpen] = useState<{ employeeId: string; date: string } | null>(null);
  const open = editing ? openCell : null;

  /* ---- dragging: the cell under the pointer, the row under the pointer ---- */
  const [dropCell, setDropCell] = useState<{ row: number; day: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<{ row: number; day: number } | null>(null);
  const [dropRow, setDropRow] = useState<string | null>(null);

  function cellOf(target: HTMLElement | null): { row: number; day: number } | null {
    const row = dataOf(target, "row");
    const day = dataOf(target, "day");
    return row !== null && day !== null ? { row: Number(row), day: Number(day) } : null;
  }

  /** Pick up a day's hours; drop them on another day or another person. */
  function dragCell(event: React.PointerEvent<HTMLElement>, row: number, day: number) {
    if (!editing) return;
    const employee = everyone[row];
    const date = dates[day];
    const shift = employee ? byKey.get(`${employee.id}|${date}`) : undefined;
    if (!employee || !shift || (isOff(shift) && !shift.absenceTypeId)) return;
    beginDrag(event, {
      hit: "[data-hr-cell]",
      onStart: () => {
        setOpen(null);
        setDragFrom({ row, day });
      },
      onMove: (target) => setDropCell(cellOf(target)),
      onDrop: (target) => {
        const to = cellOf(target);
        if (to && (to.row !== row || to.day !== day)) void moveShift(employee, date, shift, row >= ordered.length, to);
      },
      onEnd: () => {
        setDropCell(null);
        setDragFrom(null);
      },
    });
  }

  async function moveShift(employee: Employee, date: string, shift: Shift, fromFloat: boolean, to: { row: number; day: number }) {
    const target = everyone[to.row];
    const targetDate = dates[to.day];
    if (!target || !targetDate) return;
    const targetFloat = to.row >= ordered.length;
    const existing = byKey.get(`${target.id}|${targetDate}`);
    if (existing && !isOff(existing)) {
      const ok = await confirm({
        title: `Replace ${displayName(target)}'s ${dayName(targetDate)} ${monthDay(targetDate)}?`,
        description: `${shiftLabel(existing.startTime!, existing.endTime!)} is there now. It becomes ${
          shift.startTime && shift.endTime ? shiftLabel(shift.startTime, shift.endTime) : (absenceById.get(shift.absenceTypeId ?? "")?.name ?? "OFF")
        }, and ${displayName(employee)}'s ${dayName(date)} ${monthDay(date)} becomes OFF.`,
        confirmLabel: "Replace",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const placed = await saveShifts({
        departmentId,
        weekStart: weekStartOf(targetDate),
        employeeId: target.id,
        isFloat: targetFloat,
        days: [{ workDate: targetDate, startTime: shift.startTime, endTime: shift.endTime, absenceTypeId: shift.absenceTypeId ?? null }],
      });
      if (!placed.ok) {
        await confirm({ title: placed.message, cancelLabel: false });
        return;
      }
      const cleared = await saveShifts({
        departmentId,
        weekStart: weekStartOf(date),
        employeeId: employee.id,
        isFloat: fromFloat,
        days: [{ workDate: date, startTime: null, endTime: null, absenceTypeId: null }],
      });
      if (!cleared.ok) await confirm({ title: cleared.message, cancelLabel: false });
      router.refresh();
    });
  }

  /** Pick up a row by its grip; drop it where it should sit. */
  function dragRow(event: React.PointerEvent<HTMLElement>, employeeId: string) {
    if (!editing || !canArrange) return;
    const cell = (event.currentTarget as HTMLElement).closest("td") as HTMLElement | null;
    beginDrag(event, {
      hit: "[data-hr-row]",
      ghost: cell,
      onStart: () => setOpen(null),
      onMove: (target) => setDropRow(dataOf(target, "hrRow")),
      onDrop: (target) => {
        const to = dataOf(target, "hrRow");
        if (!to || to === employeeId) return;
        const ids = ordered.map((e) => e.id);
        const next = moveItem(ids, ids.indexOf(employeeId), ids.indexOf(to));
        setArranged({ base: employees, ids: next });
        startTransition(async () => {
          const result = await saveEmployeeOrder({ departmentId, ids: next });
          if (!result.ok) {
            setArranged(null);
            await confirm({ title: result.message, cancelLabel: false });
          }
          router.refresh();
        });
      },
      onEnd: () => setDropRow(null),
    });
  }

  const columns = 2 + dates.length + 1 + (seesCost ? 1 : 0);
  const multiWeek = weeks.length > 1;

  /** Everything in the draft for one week goes: every day, everyone. */
  async function clearWeek(weekStart: string) {
    const ok = await confirm({
      title: `Clear the whole week of ${monthDay(weekStart)} for ${departmentName}?`,
      description: "Every day for everyone in your draft becomes OFF. The approved week, if there is one, is not touched.",
      confirmLabel: "Clear the week",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await clearShifts({ departmentId, weekStart });
      if (!result.ok) await confirm({ title: result.message, cancelLabel: false });
      router.refresh();
    });
  }

  /** One date for everyone in the department. */
  async function clearDate(date: string) {
    const ok = await confirm({
      title: `Clear ${dayName(date)} ${monthDay(date)} for everyone in ${departmentName}?`,
      description: "That day becomes OFF for every person in your draft. Other days are not touched.",
      confirmLabel: "Clear the day",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await clearShifts({ departmentId, weekStart: weekStartOf(date), dates: [date] });
      if (!result.ok) await confirm({ title: result.message, cancelLabel: false });
      router.refresh();
    });
  }

  const rowProps = (employee: Employee, row: number, floater?: FloaterInfo) => ({
    rowIndex: row,
    employee,
    cost: costs[row],
    dates,
    byKey,
    awayByKey,
    deptById,
    weekByStart,
    departments,
    look,
    departmentId,
    editing,
    settings,
    seesCost,
    usual,
    absenceTypes,
    absenceById,
    open,
    setOpen,
    floater,
    dragCell,
    dragRow: canArrange && !floater ? dragRow : null,
    dropCell,
    dragFrom,
    isDropRow: dropRow === employee.id,
  });

  return (
    <div className="flex flex-col gap-2">
      {/* The span in one line: what it costs and who is in. */}
      <div className={cn("flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-sm px-3 py-1.5", look.tint)}>
        <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
          <span className={cn("block h-4 w-1", look.dot)} />
          {departmentName}
        </span>
        {seesCost && <Stat label={multiWeek ? "these weeks" : "this week"} value={money(total.total)} strong />}
        {seesCost && <Stat label="wages" value={money(total.wages)} />}
        {seesCost && <Stat label="employer taxes" value={money(total.burden)} />}
        <span className="flex items-center gap-1">
          <Stat label="hours" value={total.hours.toFixed(1)} />
          <Hint
            text={`Comes-in to leaves, less the department's break. Overtime is over ${settings.weeklyOvertimeAfter} hours in a week${
              settings.dailyOvertimeEnabled ? `, or over ${settings.dailyOvertimeAfter} in a day for anyone under ${money(settings.dailyOvertimeRateCeiling)}/hour` : ""
            }.${seesCost ? " Cost is wages plus employer taxes at the rates in Configuration, Pay rules. Salaried people are counted by the week the moment any day is scheduled." : ""}`}
          />
        </span>
        {total.overtimeHours > 0.01 && <Stat label="overtime" value={`${total.overtimeHours.toFixed(1)} h`} warn />}
        {total.paidAbsenceHours > 0.01 && <Stat label="paid time off" value={`${total.paidAbsenceHours.toFixed(0)} h`} />}
        <Stat label="people working" value={`${total.people} of ${everyone.length}`} />
        {breakHours > 0 && (
          <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
            {breakHours} h break/day
            <Hint text="Unpaid break set on the department, taken off every shift. Change it in Configuration, Departments." />
          </span>
        )}
        {!multiWeek && weeks[0]?.viewing?.status === "approved" && (
          <span className="ml-auto rounded-sm bg-success px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wider text-white uppercase">Approved</span>
        )}
        {!multiWeek && weeks[0]?.viewing?.status === "draft" && (
          <span className="ml-auto rounded-sm bg-warning-foreground px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wider text-white uppercase">Draft</span>
        )}
        {editing && !multiWeek && weeks[0] && (
          <button
            type="button"
            onClick={() => clearWeek(weeks[0].weekStart)}
            title="Every day for everyone becomes OFF in your draft"
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-[0.6875rem] font-semibold text-destructive hover:bg-destructive/10",
              weeks[0].viewing?.status !== "draft" && "ml-auto"
            )}
          >
            <Trash2 className="size-3" />
            Clear the whole week
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-sm bg-card ring-1 ring-foreground/10">
        <table
          className={cn("w-full border-collapse text-sm", editing && "select-none [-webkit-touch-callout:none]")}
          style={{ minWidth: `${22 + dates.length * 6.5}rem` }}
        >
          <thead>
            {/* Across more than one week, a band over each week says what it is. */}
            {multiWeek && (
              <tr className="bg-brand-muted">
                <th colSpan={2} className="sticky left-0 z-10 bg-brand-muted" />
                {weeks.map((week) => {
                  const span = dates.filter((d) => weekStartOf(d) === week.weekStart).length;
                  if (span === 0) return null;
                  return (
                    <th key={week.weekStart} colSpan={span} className="border-b border-l border-border/60 px-1 py-1 text-center">
                      <span className="flex items-center justify-center gap-1.5 text-[0.625rem]">
                        <span className="font-semibold tabular-nums">Week of {monthDay(week.weekStart)}</span>
                        <WeekBadge status={week.viewing?.status ?? null} editing={editing} />
                      </span>
                    </th>
                  );
                })}
                <th colSpan={columns - 2 - dates.length} className="border-b border-l border-border" />
              </tr>
            )}
            <tr className="bg-brand-muted">
              <th className="sticky left-0 z-10 w-12 border-b border-border bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
                ID
              </th>
              <th className="sticky left-12 z-10 w-40 border-b border-border bg-brand-muted px-2 py-1.5 text-left text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
                <span className="flex items-center gap-1.5">
                  Person
                  {editing && (
                    <Hint
                      text={
                        canArrange
                          ? "Tap a day to set it. Drag a day with hours onto another day or another person to move it. Drag the grip beside a name to change the order. On a phone, hold for a moment first. Arrow keys move, Enter opens, Delete makes it OFF."
                          : "Tap a day to set it. Drag a day with hours onto another day or another person to move it - on a phone, hold for a moment first. Arrow keys move, Enter opens, Delete makes it OFF."
                      }
                    />
                  )}
                </span>
              </th>
              {dates.map((date) => (
                <th key={date} className={cn("border-b border-l border-border/60 px-1 py-1 text-center", dates.length === 1 && "text-left")}>
                  <span className="block text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    {dayName(date)}
                  </span>
                  <span className="block text-xs font-bold tabular-nums">{monthDay(date)}</span>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => clearDate(date)}
                      aria-label={`Clear ${dayName(date)} ${monthDay(date)} for everyone`}
                      title="This day becomes OFF for everyone in the department"
                      className="mt-0.5 inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </th>
              ))}
              <th className="w-20 border-b border-l border-border px-2 py-1.5 text-right text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
                Hours
              </th>
              {seesCost && (
                <th className="w-24 border-b border-border px-2 py-1.5 text-right text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
                  Cost
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {ordered.map((employee, row) => (
              <PersonRow key={employee.id} {...rowProps(employee, row)} />
            ))}

            {floaters.length > 0 && (
              <tr>
                <td colSpan={columns} className="sticky left-0 border-y border-primary/15 bg-brand-muted/40 px-2 py-1 text-[0.5625rem] font-semibold tracking-wider text-primary uppercase">
                  <span className="flex items-center gap-1.5">
                    From other departments
                    <Hint text="People whose home is another department, working here. Their cost counts here. A ? means an approver of this department has not signed them off yet." />
                  </span>
                </td>
              </tr>
            )}
            {floaters.map((employee, index) => (
              <PersonRow
                key={employee.id}
                {...rowProps(employee, ordered.length + index, {
                  home: employee.departmentId ? deptById.get(employee.departmentId) : undefined,
                  homeIndex: (employee.departmentId ? deptById.get(employee.departmentId)?.colorIndex : undefined) ?? 0,
                  pending: dates.some((date) => {
                    const s = byKey.get(`${employee.id}|${date}`);
                    return s && s.isFloat && !s.floatApprovedAt && !isOff(s);
                  }),
                  canApprove: canApproveFloat,
                  scheduleIds: [...new Set(dates.map((d) => byKey.get(`${employee.id}|${d}`)?.scheduleId).filter(Boolean))] as string[],
                })}
              />
            ))}

            {everyone.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  Nobody in this department yet. Import from Paychex, or move people here in People.
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-t-success/40 bg-success/10 text-xs">
              <td colSpan={2} className="sticky left-0 z-10 bg-success/10 px-2 py-1 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                Per day
              </td>
              {dates.map((date, index) => (
                <td key={date} className="border-l border-border/60 px-1 py-1 text-center tabular-nums">
                  {dayHours[index] > 0 ? (
                    <>
                      <span className="font-semibold">{dayHours[index].toFixed(0)}h</span>
                      <span className="ml-1 text-[0.625rem] text-muted-foreground">{dayPeople[index]}p</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
              ))}
              <td className="border-l border-border px-2 py-1 text-right font-semibold tabular-nums">{total.hours.toFixed(1)}</td>
              {seesCost && <td className="px-2 py-1 text-right font-bold tabular-nums">{money(total.total)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  );
}

/* ---------------- pieces ---------------- */

function dayName(date: string): string {
  return DAY_NAMES[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7].slice(0, 3);
}

function WeekBadge({ status, editing }: { status: "draft" | "approved" | "archived" | null; editing: boolean }) {
  if (status === "approved") {
    return <span className="rounded-sm bg-success px-1 text-[0.5625rem] font-bold tracking-wider text-white uppercase">Approved</span>;
  }
  if (status === "draft") {
    return <span className="rounded-sm bg-warning-foreground px-1 text-[0.5625rem] font-bold tracking-wider text-white uppercase">Draft</span>;
  }
  return (
    <span className="rounded-sm bg-muted px-1 text-[0.5625rem] font-bold tracking-wider text-muted-foreground uppercase">
      {editing ? "Empty" : "Nothing yet"}
    </span>
  );
}

function Stat({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <span className="text-xs">
      <span className={cn("tabular-nums", strong ? "text-lg font-bold" : "font-semibold", warn && "text-warning-foreground")}>{value}</span>
      <span className="ml-1 text-[0.625rem] text-muted-foreground">{label}</span>
    </span>
  );
}

type FloaterInfo = {
  home: Department | undefined;
  homeIndex: number;
  pending: boolean;
  canApprove: boolean;
  scheduleIds: string[];
};

type Usual = ReturnType<typeof commonShifts>;
type OpenCell = { employeeId: string; date: string } | null;
type CellRef = { row: number; day: number } | null;

function PersonRow({
  rowIndex,
  employee,
  cost,
  dates,
  byKey,
  awayByKey,
  deptById,
  weekByStart,
  departments,
  look,
  departmentId,
  editing,
  settings,
  seesCost,
  usual,
  absenceTypes,
  absenceById,
  open,
  setOpen,
  floater,
  dragCell,
  dragRow,
  dropCell,
  dragFrom,
  isDropRow,
}: {
  rowIndex: number;
  employee: Employee;
  cost: ReturnType<typeof sumCosts>;
  dates: string[];
  byKey: Map<string, Shift>;
  awayByKey: Map<string, AwayShift>;
  deptById: Map<string, Department>;
  weekByStart: Map<string, WeekOnScreen>;
  departments: Department[];
  look: ReturnType<typeof departmentColor>;
  departmentId: string;
  editing: boolean;
  settings: PaySettings;
  seesCost: boolean;
  usual: Usual;
  absenceTypes: AbsenceType[];
  absenceById: Map<string, AbsenceType>;
  open: OpenCell;
  setOpen: (next: OpenCell) => void;
  floater?: FloaterInfo;
  dragCell: (event: React.PointerEvent<HTMLElement>, row: number, day: number) => void;
  /** Set when this row may be picked up and re-ordered. */
  dragRow: ((event: React.PointerEvent<HTMLElement>, employeeId: string) => void) | null;
  dropCell: CellRef;
  dragFrom: CellRef;
  isDropRow: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const homeLook = floater?.home ? departmentColor(floater.home.color, floater.homeIndex) : null;
  const noEmail = !sendTo(employee);
  const stickyBg = isDropRow ? "bg-brand-muted" : "bg-card group-hover:bg-muted/40";

  return (
    <tr
      data-hr-row={floater ? undefined : employee.id}
      className={cn("group border-b border-border/50 last:border-b-0", isDropRow && "border-t-2 border-t-primary bg-brand-muted")}
    >
      <td className={cn("sticky left-0 z-10 px-2 py-0 font-mono text-[0.625rem] text-muted-foreground", stickyBg)}>
        {employee.paychexId}
      </td>
      <td className={cn("sticky left-12 z-10 px-2 py-0", stickyBg)}>
        <span className="flex items-center gap-1.5">
          {editing && dragRow ? (
            <span
              role="button"
              aria-label={`Move ${displayName(employee)}`}
              title="Drag to change the order"
              onPointerDown={(event) => dragRow(event, employee.id)}
              className="-ml-1 inline-flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </span>
          ) : (
            <span className={cn("block h-3.5 w-0.5 shrink-0", floater && homeLook ? homeLook.dot : look.dot)} />
          )}
          <span className="min-w-0 truncate text-xs font-medium">{displayName(employee)}</span>
          {employee.payType === "salary" && (
            <span title="Salaried: paid by the week" className="shrink-0 rounded-sm bg-primary/15 px-1 text-[0.5625rem] font-bold text-primary">S</span>
          )}
          {employee.isSupervisor && <span className="shrink-0 text-[0.5625rem] font-semibold text-muted-foreground">SUP</span>}
          {noEmail && (
            <span title="No email on file. This person will not receive the schedule by email - print it for them." className="shrink-0 text-warning-foreground">
              <MailX className="size-3" />
            </span>
          )}
          {floater && (
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <span className={cn("rounded-sm px-1 text-[0.5625rem] font-semibold", homeLook?.tint)}>from {floater.home?.name ?? "elsewhere"}</span>
              {floater.pending ? (
                floater.canApprove && floater.scheduleIds.length > 0 ? (
                  <button
                    type="button"
                    disabled={pending}
                    title="Approve this person working here"
                    onClick={() =>
                      startTransition(async () => {
                        for (const scheduleId of floater.scheduleIds) {
                          const result = await approveFloats({ scheduleId, employeeId: employee.id });
                          if (!result.ok) await confirm({ title: result.message, cancelLabel: false });
                        }
                        router.refresh();
                      })
                    }
                    className="inline-flex h-5 items-center gap-0.5 rounded-sm bg-warning-muted px-1 text-[0.5625rem] font-bold text-warning-foreground hover:bg-success hover:text-white"
                  >
                    ? Approve
                  </button>
                ) : (
                  <span title="Waiting for an approver of this department to sign off" className="rounded-sm bg-warning-muted px-1 text-[0.5625rem] font-bold text-warning-foreground">?</span>
                )
              ) : (
                <CheckCircle2 className="size-3 text-success" aria-label="Approved" />
              )}
              {editing && floater.scheduleIds.length > 0 && (
                <button
                  type="button"
                  disabled={pending}
                  aria-label="Remove from this department"
                  title="Remove from this department"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Take ${displayName(employee)} off this department?`,
                      description: "Their days here are removed. Their home department is not touched.",
                      confirmLabel: "Remove",
                      cancelLabel: "Cancel",
                      tone: "danger",
                    });
                    if (!ok) return;
                    startTransition(async () => {
                      for (const scheduleId of floater.scheduleIds) {
                        await removeFloater({ scheduleId, employeeId: employee.id });
                      }
                      router.refresh();
                    });
                  }}
                  className="inline-flex size-5 items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </span>
          )}
        </span>
      </td>

      {dates.map((date, dayIndex) => (
        <DayCell
          key={date}
          rowIndex={rowIndex}
          dayIndex={dayIndex}
          departmentId={departmentId}
          employee={employee}
          date={date}
          shift={byKey.get(`${employee.id}|${date}`)}
          away={floater ? undefined : awayByKey.get(`${employee.id}|${date}`)}
          deptById={deptById}
          departments={departments}
          look={floater && homeLook ? homeLook : look}
          weekStatus={weekByStart.get(weekStartOf(date))?.viewing?.status ?? null}
          isFloat={!!floater}
          editing={editing}
          usual={usual}
          absenceTypes={absenceTypes}
          absenceById={absenceById}
          isOpen={open?.employeeId === employee.id && open.date === date}
          onOpen={() => setOpen({ employeeId: employee.id, date })}
          onClose={() => setOpen(null)}
          onDragStart={(event) => dragCell(event, rowIndex, dayIndex)}
          isDropTarget={dropCell?.row === rowIndex && dropCell.day === dayIndex}
          isDragSource={dragFrom?.row === rowIndex && dragFrom.day === dayIndex}
        />
      ))}

      <td className="border-l border-border px-2 py-0.5 text-right text-xs tabular-nums">
        {cost.hours > 0 ? cost.hours.toFixed(1) : ""}
        {cost.overtimeHours > 0.01 && (
          <span title={`${cost.overtimeHours.toFixed(1)} hours at ${settings.overtimeMultiplier}x`} className="ml-1 text-[0.5625rem] font-semibold text-warning-foreground">
            +{cost.overtimeHours.toFixed(1)} OT
          </span>
        )}
      </td>
      {seesCost && (
        <td
          title={employee.payRate === null && cost.hours > 0 ? "No rate from Paychex - counted as zero" : `${money(cost.wages)} wages + ${money(cost.burden)} employer taxes`}
          className={cn("px-2 py-0.5 text-right text-xs font-semibold tabular-nums", employee.payRate === null && cost.hours > 0 && "text-warning-foreground")}
        >
          {cost.total > 0 ? money(cost.total) : ""}
          {employee.payRate === null && cost.hours > 0 && " ?"}
        </td>
      )}
    </tr>
  );
}

/**
 * One person, one day.
 *
 * A button. Locked, it reads "6:00 AM / 4:00 PM" or OFF and explains itself
 * if tapped. Editing, tapping opens the card, and a day with hours can be
 * dragged to another day or person. Arrow keys move to the next day or
 * person, Enter opens, Delete makes the day OFF.
 */
function DayCell({
  rowIndex,
  dayIndex,
  departmentId,
  employee,
  date,
  shift,
  away,
  deptById,
  departments,
  look,
  weekStatus,
  isFloat,
  editing,
  usual,
  absenceTypes,
  absenceById,
  isOpen,
  onOpen,
  onClose,
  onDragStart,
  isDropTarget,
  isDragSource,
}: {
  rowIndex: number;
  dayIndex: number;
  departmentId: string;
  employee: Employee;
  date: string;
  shift: Shift | undefined;
  away: AwayShift | undefined;
  deptById: Map<string, Department>;
  departments: Department[];
  /** This row's colour: the department's, or a floater's home department's. */
  look: ReturnType<typeof departmentColor>;
  weekStatus: "draft" | "approved" | "archived" | null;
  isFloat: boolean;
  editing: boolean;
  usual: Usual;
  absenceTypes: AbsenceType[];
  absenceById: Map<string, AbsenceType>;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDragStart: (event: React.PointerEvent<HTMLElement>) => void;
  isDropTarget: boolean;
  isDragSource: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const off = isOff(shift);
  const awayDept = away ? deptById.get(away.departmentId) : undefined;
  const awayLook = awayDept ? departmentColor(awayDept.color, awayDept.colorIndex) : null;
  const absence = shift?.absenceTypeId ? absenceById.get(shift.absenceTypeId) : undefined;
  const absenceLook = absence ? departmentColor(absence.color, absenceTypes.indexOf(absence)) : null;
  const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const draggable = editing && !!shift && (!off || !!absence) && !away;

  function focusCell(dr: number, dd: number) {
    const target = document.querySelector<HTMLButtonElement>(`[data-hr-cell][data-row="${rowIndex + dr}"][data-day="${dayIndex + dd}"]`);
    target?.focus();
  }

  function setOff() {
    if (off) return;
    startTransition(async () => {
      const result = await saveShifts({
        departmentId,
        weekStart: weekStartOf(date),
        employeeId: employee.id,
        isFloat,
        days: [{ workDate: date, startTime: null, endTime: null }],
      });
      if (!result.ok) await confirm({ title: result.message, cancelLabel: false });
      router.refresh();
    });
  }

  function onKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      focusCell(move[0], move[1]);
      return;
    }
    if (editing && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      setOff();
    }
  }

  /*
    What the day says.

    Working here: the times on this department's colour. Working elsewhere:
    that department's name and the times, on ITS colour, so a glance at the
    row shows where the person is. OFF stays quiet.
  */
  const label = off ? (
    absence ? (
      <span title={`${absence.name}${absence.paid ? ` - paid, ${absence.paidHours} h` : " - unpaid"}`} className="flex flex-col leading-tight">
        <span className="text-[0.6875rem] font-black tracking-wider">{absence.code}</span>
        <span className="text-[0.5625rem] opacity-80">{absence.paid ? "paid" : "unpaid"}</span>
      </span>
    ) : awayDept && away ? (
      <span
        title={`Working in ${awayDept.name} this day${away.approved ? "" : " - not yet approved by that department"}`}
        className="flex flex-col leading-tight"
      >
        <span className="truncate text-[0.625rem] font-bold uppercase">
          {awayDept.name}
          {!away.approved && " ?"}
        </span>
        <span className="text-[0.625rem]">
          {displayTime(away.startTime)} – {displayTime(away.endTime)}
        </span>
      </span>
    ) : (
      <span className="font-semibold text-muted-foreground/50">OFF</span>
    )
  ) : (
    <span className="flex flex-col leading-tight font-semibold">
      <span>{displayTime(shift!.startTime!)}</span>
      <span className="font-medium opacity-80">{displayTime(shift!.endTime!)}</span>
    </span>
  );

  return (
    <td
      className={cn(
        "relative border-l border-border/60 p-0.5 text-center text-xs tabular-nums",
        weekend && "bg-surface-sunk/60",
        pending && "opacity-50",
        isDropTarget && "bg-brand-muted"
      )}
    >
      <button
        type="button"
        data-hr-cell
        data-row={rowIndex}
        data-day={dayIndex}
        aria-label={`${displayName(employee)}, ${dayName(date)} ${monthDay(date)}`}
        onKeyDown={onKey}
        onPointerDown={draggable ? onDragStart : undefined}
        onClick={async () => {
          if (!editing) {
            await confirm({
              title: weekStatus === "approved" ? "This week is approved and locked" : "The week is locked",
              description:
                weekStatus === "approved"
                  ? "Press Edit the week, top left. You will be asked to confirm, a copy opens as your draft, and the change needs approval again."
                  : "Press Edit the week, top left, to change hours. Your changes go into a draft until it is approved.",
              cancelLabel: false,
            });
            return;
          }
          if (isOpen) onClose();
          else onOpen();
        }}
        className={cn(
          "min-h-8 w-full rounded-sm px-1 py-0 text-[0.6875rem] leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          !off && look.tint,
          off && !absence && awayLook && awayLook.tint,
          off && absenceLook && absenceLook.tint,
          editing ? "hover:ring-1 hover:ring-primary" : "cursor-default",
          draggable && "cursor-grab active:cursor-grabbing",
          isOpen && "ring-2 ring-primary",
          isDropTarget && "ring-2 ring-primary ring-inset",
          isDragSource && "opacity-40"
        )}
      >
        {label}
      </button>

      {isOpen && editing && (
        <DayCard
          departmentId={departmentId}
          employee={employee}
          date={date}
          shift={shift}
          isFloat={isFloat}
          usual={usual}
          absenceTypes={absenceTypes}
          departments={departments}
          onClose={() => {
            onClose();
            requestAnimationFrame(() => focusCell(0, 0));
          }}
        />
      )}
    </td>
  );
}

/**
 * The card. Everything a supervisor can do to one person's day, in big
 * plain controls: comes in, leaves, the shifts this department usually works,
 * OFF, the same thing Monday to Friday or all week, and sending the person to
 * another department for the day.
 */
function DayCard({
  departmentId,
  employee,
  date,
  shift,
  isFloat,
  usual,
  absenceTypes,
  departments,
  onClose,
}: {
  departmentId: string;
  employee: Employee;
  date: string;
  shift: Shift | undefined;
  isFloat: boolean;
  usual: Usual;
  absenceTypes: AbsenceType[];
  departments: Department[];
  onClose: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState(shift?.startTime ?? usual[0]?.start ?? "06:00");
  const [end, setEnd] = useState(shift?.endTime ?? usual[0]?.end ?? "16:00");
  const [elsewhere, setElsewhere] = useState(false);
  const [hostId, setHostId] = useState("");
  const options = useMemo(() => timeOptions(), []);
  const cardRef = useRef<HTMLDivElement>(null);
  const weekStart = weekStartOf(date);

  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>("select, button")?.focus();
  }, []);

  function run(
    days: { workDate: string; startTime: string | null; endTime: string | null; absenceTypeId?: string | null }[],
    toDepartment?: string
  ) {
    startTransition(async () => {
      const result = await saveShifts({
        departmentId: toDepartment ?? departmentId,
        weekStart,
        employeeId: employee.id,
        isFloat: toDepartment ? true : isFloat,
        days,
      });
      if (!result.ok) {
        await confirm({ title: result.message, cancelLabel: false });
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const weekdays = weekDates(weekStart).slice(0, 5);
  const allWeek = weekDates(weekStart);
  const hosts = departments.filter((d) => d.active && d.id !== departmentId && d.id !== employee.departmentId);

  async function clearPersonWeek() {
    const ok = await confirm({
      title: `Clear ${displayName(employee)}'s week of ${monthDay(weekStart)}?`,
      description: "Every day this week becomes OFF for this person in your draft. Nobody else is touched.",
      confirmLabel: "Clear the week",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await clearShifts({ departmentId, weekStart, employeeIds: [employee.id] });
      if (!result.ok) {
        await confirm({ title: result.message, cancelLabel: false });
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      {/* Anything outside the card closes it. */}
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-[55] cursor-default bg-foreground/10 sm:bg-transparent" />
      <div
        ref={cardRef}
        role="dialog"
        aria-label={`${displayName(employee)} on ${dayName(date)} ${monthDay(date)}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        className="fixed inset-x-2 bottom-2 z-[60] flex flex-col gap-2 rounded-sm bg-card p-3 text-left shadow-xl ring-1 ring-foreground/15 sm:absolute sm:inset-auto sm:top-full sm:left-1/2 sm:w-80 sm:-translate-x-1/2"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{displayName(employee)}</p>
            <p className="text-xs text-muted-foreground">
              {DAY_NAMES[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]} {monthDay(date)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {/* The shifts this department usually works: one tap. */}
        {usual.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {usual.map((u) => {
              const active = u.start === start && u.end === end;
              return (
                <button
                  key={`${u.start}-${u.end}`}
                  type="button"
                  onClick={() => {
                    setStart(u.start);
                    setEnd(u.end);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "h-8 rounded-sm px-2 text-xs font-semibold ring-1 transition-colors",
                    active ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-foreground/15 hover:bg-muted"
                  )}
                >
                  {shiftLabel(u.start, u.end)}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Comes in
            <select value={start} onChange={(event) => setStart(event.target.value)} className={TIME}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Leaves
            <select value={end} onChange={(event) => setEnd(event.target.value)} className={TIME}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!elsewhere ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" disabled={pending} onClick={() => run([{ workDate: date, startTime: start, endTime: end }])} className={cn(BIG, "col-span-2 bg-primary text-primary-foreground")}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save this day
              </button>
              <button type="button" disabled={pending} onClick={() => run(weekdays.map((d) => ({ workDate: d, startTime: start, endTime: end })))} className={cn(BIG, "bg-card ring-1 ring-foreground/15 hover:bg-muted")}>
                Same Mon–Fri
              </button>
              <button type="button" disabled={pending} onClick={() => run(allWeek.map((d) => ({ workDate: d, startTime: start, endTime: end })))} className={cn(BIG, "bg-card ring-1 ring-foreground/15 hover:bg-muted")}>
                Same all week
              </button>
              <button
                type="button"
                disabled={pending || (isOff(shift) && !shift?.absenceTypeId)}
                onClick={() => run([{ workDate: date, startTime: null, endTime: null, absenceTypeId: null }])}
                className={cn(BIG, "bg-card text-destructive ring-1 ring-foreground/15 hover:bg-destructive/10 disabled:opacity-40")}
              >
                OFF this day
              </button>
              {!isFloat && hosts.length > 0 && (
                <button type="button" disabled={pending} onClick={() => setElsewhere(true)} className={cn(BIG, "bg-card ring-1 ring-foreground/15 hover:bg-muted")}>
                  <ArrowRightLeft className="size-3.5" />
                  Another dept
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={clearPersonWeek}
                title="Every day of this week becomes OFF for this person"
                className={cn(BIG, "col-span-2 bg-card text-destructive ring-1 ring-destructive/30 hover:bg-destructive/10")}
              >
                <Trash2 className="size-3.5" />
                Clear {employee.preferredName || employee.firstName}&rsquo;s whole week
              </button>
            </div>

            {/* Off for a reason: one dropdown. The day is written the moment a reason is picked. */}
            {absenceTypes.filter((t) => t.active).length > 0 && (
              <label className="flex flex-col gap-0.5 text-[0.5625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                <span className="flex items-center gap-1">
                  Off because
                  <Hint text="Pick the reason and the day becomes OFF with it written on. Paid reasons add their hours at the person's rate, without overtime. The list is yours to change in Configuration, Off because." />
                </span>
                <select
                  value={shift?.absenceTypeId ?? ""}
                  disabled={pending}
                  onChange={(event) => {
                    const id = event.target.value;
                    if (id) run([{ workDate: date, startTime: null, endTime: null, absenceTypeId: id }]);
                  }}
                  className={cn(TIME, "normal-case tracking-normal")}
                >
                  <option value="">Choose a reason…</option>
                  {absenceTypes
                    .filter((t) => t.active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.paid ? `paid ${t.paidHours} h` : "unpaid"}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-sm bg-surface-sunk p-2">
            <p className="flex items-center gap-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Works in another department this day
              <Hint text="The hours above are written on that department's schedule with a ? until one of its approvers signs. Here the day shows 'at that department'. Their cost for the day counts there." />
            </p>
            <select value={hostId} onChange={(event) => setHostId(event.target.value)} className={TIME}>
              <option value="">Which department…</option>
              {hosts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.line ? `${d.line} › ` : ""}
                  {d.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" disabled={pending || !hostId} onClick={() => run([{ workDate: date, startTime: start, endTime: end }], hostId)} className={cn(BIG, "bg-primary text-primary-foreground disabled:opacity-50")}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Send there
              </button>
              <button type="button" onClick={() => setElsewhere(false)} className={cn(BIG, "bg-card ring-1 ring-foreground/15 hover:bg-muted")}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const TIME = "h-9 w-full rounded-sm bg-card px-2 text-sm font-medium ring-1 ring-foreground/15 focus:ring-2 focus:ring-primary focus:outline-none";
const BIG = "inline-flex h-9 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-semibold transition-colors disabled:opacity-60";
