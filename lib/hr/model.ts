/**
 * HR: the shapes, the week, and the arithmetic.
 *
 * Nothing in here talks to a database. That is what makes the cost model
 * testable on its own, and it is where the rules live that have to be right
 * before anything else matters - a schedule that prints beautifully and
 * mis-states the week's cost by the overtime rule is worse than the workbook.
 */

export type PayType = "hourly" | "salary";

export type Department = {
  id: string;
  name: string;
  paychexCode: string | null;
  /** Bettr Bowl, Pizza, Warehouse... from the Paychex code prefix. */
  line: string | null;
  color: string | null;
  /** Legacy single supervisor; the approval chain replaces it. */
  supervisorId: string | null;
  /** Unpaid break per day, deducted from every shift in this department. */
  breakHours: number;
  /** How many people the department is supposed to have. */
  requiredHeadcount: number;
  /** The hours it usually runs, "06:30" to "03:00", for the staffing bar. */
  usualStart: string | null;
  usualEnd: string | null;
  /** Who checks this department's timecards. */
  timecardCheck: string | null;
  sortOrder: number;
  active: boolean;
};

export type Employee = {
  id: string;
  paychexId: string;
  firstName: string;
  lastName: string;
  /** "First name they go by" in Paychex. */
  preferredName: string | null;
  /** Work email: what they log in with. */
  email: string | null;
  /** Personal email: where the schedule is sent. */
  personalEmail: string | null;
  phone: string | null;
  departmentId: string | null;
  payType: PayType;
  /** Per hour for hourly; per week for salary. Null when Paychex did not say. */
  payRate: number | null;
  isSupervisor: boolean;
  employeeType: "employee" | "contractor";
  fullTime: boolean;
  paychexSupervisorId: string | null;
  hiredOn: string | null;
  /** Set by the import: present in the last file. */
  active: boolean;
  /** The manual off switch. */
  showOnSchedule: boolean;
  /** Where the person sits on the department's schedule. Null: after the ordered ones, by name. */
  sortOrder: number | null;
};

/** Who appears on a schedule at all. */
export function isSchedulable(e: Employee): boolean {
  return e.active && e.showOnSchedule && e.employeeType !== "contractor";
}

export function displayName(e: Pick<Employee, "firstName" | "lastName" | "preferredName">): string {
  return `${e.preferredName || e.firstName} ${e.lastName}`.trim();
}

/**
 * The order people appear in on a schedule: the ones someone has arranged
 * first, in that order, then everyone else by last name.
 */
export function sortPeople<T extends Pick<Employee, "sortOrder" | "lastName" | "firstName">>(people: T[]): T[] {
  return [...people].sort((a, b) => {
    if (a.sortOrder !== null && b.sortOrder !== null && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.sortOrder !== null && b.sortOrder === null) return -1;
    if (a.sortOrder === null && b.sortOrder !== null) return 1;
    return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  });
}

/** Usual hours stored as the same start and end mean the department runs around the clock. */
export function runsAllDay(d: Pick<Department, "usualStart" | "usualEnd">): boolean {
  return !!d.usualStart && !!d.usualEnd && d.usualStart === d.usualEnd;
}

/** The address the schedule goes to, if any. */
export function sendTo(e: Pick<Employee, "email" | "personalEmail">): string | null {
  return e.personalEmail || e.email || null;
}

export type ScheduleStatus = "draft" | "approved" | "archived";

export type Schedule = {
  id: string;
  departmentId: string;
  /** Monday, ISO date. */
  weekStart: string;
  status: ScheduleStatus;
  name: string | null;
  createdBy: string | null;
  createdByName: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  updatedAt: string;
  /** Steps signed so far, in order. */
  approvals: ScheduleApproval[];
};

export type ScheduleApproval = {
  step: number;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string;
};

export type Shift = {
  id: string;
  scheduleId: string;
  employeeId: string;
  workDate: string;
  /** "07:00". Null with endTime null means OFF. */
  startTime: string | null;
  endTime: string | null;
  /** Per-shift override; 0 means use the department's break. */
  breakMinutes: number;
  note: string | null;
  /** Working here although their home is another department. */
  isFloat: boolean;
  floatApprovedAt: string | null;
  /** Why the day is OFF, when it is off for a reason: PTO, holiday, furlough... */
  absenceTypeId: string | null;
};

/**
 * A reason for a day off. Paid ones add paidHours at the person's rate, with
 * no overtime and not counting towards the 40.
 */
export type AbsenceType = {
  id: string;
  name: string;
  /** Short, for the cell and the printed sheet: PTO, HOL, FUR. */
  code: string;
  paid: boolean;
  paidHours: number;
  /** A key from lib/production/department-colors. */
  color: string | null;
  sortOrder: number;
  active: boolean;
};

export type Group = {
  id: string;
  name: string;
  seesAllDepartments: boolean;
  seesCost: boolean;
  sortOrder: number;
  departmentIds: string[];
  memberIds: string[];
};

export type ApprovalStep = {
  departmentId: string;
  step: number;
  employeeId: string;
};

/**
 * How a salaried person's week is costed.
 *
 * week_if_any - the whole weekly rate the moment any day is scheduled.
 * per_day     - the weekly rate split over salaryDaysPerWeek, times the days
 *               actually scheduled, never more than the weekly rate.
 */
export type SalaryRule = "week_if_any" | "per_day";

export type PaySettings = {
  weeklyOvertimeAfter: number;
  dailyOvertimeAfter: number;
  dailyOvertimeEnabled: boolean;
  dailyOvertimeRateCeiling: number;
  overtimeMultiplier: number;
  salaryRule: SalaryRule;
  salaryDaysPerWeek: number;
  ficaPct: number;
  futaPct: number;
  statePct: number;
  workersCompPct: number;
};

export const DEFAULT_PAY_SETTINGS: PaySettings = {
  weeklyOvertimeAfter: 40,
  dailyOvertimeAfter: 8,
  dailyOvertimeEnabled: false,
  dailyOvertimeRateCeiling: 18,
  overtimeMultiplier: 1.5,
  salaryRule: "week_if_any",
  salaryDaysPerWeek: 5,
  ficaPct: 7.65,
  futaPct: 0.6,
  statePct: 1.17,
  workersCompPct: 0,
};

/** Per-app access, the way Odoo grants it: none, user, or administrator. */
export type HrLevel = "none" | "user" | "admin";

/* ---------------- lines ---------------- */

/**
 * The line a Paychex department code belongs to.
 *
 * Paychex codes carry the line as a prefix: BB02 is Bettr Bowl, P04 is Pizza,
 * W02 is Warehouse. Read here so the dashboard can ask "Bettr Bowl, then
 * which room" the way the production dashboard does.
 */
export function lineOfCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c.startsWith("BB")) return "Bettr Bowl";
  if (c.startsWith("P")) return "Pizza";
  if (c.startsWith("WH") || c.startsWith("W")) return "Warehouse";
  if (c.startsWith("S")) return "Stewarding";
  if (c.startsWith("Q")) return "Quality";
  if (c.startsWith("M")) return "Maintenance";
  if (c.startsWith("ADMIN") || c.startsWith("A")) return "Office";
  return null;
}

/** "BB02 Bettr Assembly" -> code BB02, name Bettr Assembly. */
export function splitDepartment(raw: string): { code: string | null; name: string } {
  const match = raw.trim().match(/^([A-Z]{1,6}\d{0,3})\s+(.+)$/);
  if (!match) return { code: null, name: raw.trim() };
  return { code: match[1], name: match[2].trim() };
}

/* ---------------- the week ---------------- */

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The Monday of the week containing a date.
 *
 * The pay week is Monday to Sunday, as in Paychex. Sunday belongs to the week
 * that started six days earlier, which is why this cannot use the JavaScript
 * convention of Sunday as day zero without adjusting for it.
 */
export function weekStartOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDay(); // 0 = Sunday
  const back = day === 0 ? 6 : day - 1;
  return addDays(iso, -back);
}

/** The seven dates of a week, Monday first. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** Every date from one day to another, inclusive. Capped so a typo cannot ask for a decade. */
export function dateRange(from: string, to: string, cap = 62): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < cap) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** The Mondays of every week touching a range. */
export function weekStartsIn(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = weekStartOf(from);
  const last = weekStartOf(to);
  while (cursor <= last && out.length < 12) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

/** 2026-09-01 as 09/01. */
export function monthDay(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

/** 2026-09-01 as "Tue, Sep 1". */
export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/* ---------------- hours ---------------- */

/** "07:30" -> 7.5. */
export function timeToHours(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

/** 7.5 -> "07:30". */
export function hoursToTime(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Start to end, before any break. Crosses midnight when end <= start. */
export function shiftSpan(shift: Pick<Shift, "startTime" | "endTime">): number {
  if (!shift.startTime || !shift.endTime) return 0;
  const start = timeToHours(shift.startTime);
  let end = timeToHours(shift.endTime);
  if (end <= start) end += 24;
  return end - start;
}

/**
 * Paid hours in one shift.
 *
 * The department's break comes off every shift, because that is the rule
 * Carlos gave: people take it when they can, the schedule does not say when.
 * A per-shift break_minutes overrides it when set. The break is never more
 * than the shift - a two hour shift with a one hour break is one hour, not
 * minus anything.
 */
export function shiftHours(
  shift: Pick<Shift, "startTime" | "endTime" | "breakMinutes">,
  breakHours = 0
): number {
  const span = shiftSpan(shift);
  if (span === 0) return 0;
  const deduct = shift.breakMinutes > 0 ? shift.breakMinutes / 60 : breakHours;
  return Math.max(0, span - Math.min(deduct, span));
}

export function isOff(shift: Pick<Shift, "startTime" | "endTime"> | undefined): boolean {
  return !shift || shift.startTime === null || shift.endTime === null;
}

/** "07:00" as "7:00 AM", the way it is read off a printed sheet. */
export function displayTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

/** "6:00 AM – 4:00 PM". */
export function shiftLabel(start: string, end: string): string {
  return `${displayTime(start)} – ${displayTime(end)}`;
}

/**
 * Every quarter hour of the day, starting at 4:00 AM so the top of a
 * dropdown is the morning people actually come in, wrapping past midnight.
 */
export function timeOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let step = 0; step < 96; step += 1) {
    const minutes = ((4 * 60 + step * 15) % (24 * 60));
    const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    out.push({ value, label: displayTime(value) });
  }
  return out;
}

/**
 * The shifts a department usually works, learned from what is already on its
 * schedule: the most common start and end pairs, most common first.
 */
export function commonShifts(
  shifts: Pick<Shift, "startTime" | "endTime">[],
  limit = 4
): { start: string; end: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of shifts) {
    if (!s.startTime || !s.endTime) continue;
    const key = `${s.startTime}|${s.endTime}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const learned = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => {
      const [start, end] = key.split("|");
      return { start, end, count };
    });
  if (learned.length >= 2) return learned;
  // Nothing learned yet: the 4 x 10 shapes the plant runs, so the first week
  // is not typed from nothing.
  const defaults = [
    { start: "06:00", end: "16:00", count: 0 },
    { start: "07:00", end: "17:00", count: 0 },
    { start: "08:00", end: "18:00", count: 0 },
  ].filter((d) => !learned.some((l) => l.start === d.start && l.end === d.end));
  return [...learned, ...defaults].slice(0, limit);
}

/* ---------------- cost ---------------- */

export type WeekCost = {
  employeeId: string;
  payType: PayType;
  /** Hours actually scheduled, breaks deducted. */
  hours: number;
  regularHours: number;
  overtimeHours: number;
  /** Paid time off in the week: PTO, paid holiday. Paid, not worked. */
  paidAbsenceHours: number;
  /** Wages before employer taxes. */
  wages: number;
  /** Employer taxes on top of wages. */
  burden: number;
  /** wages + burden: what the week costs the company. */
  total: number;
  /** Salary with at least one shift is owed the week; with none, nothing. */
  salaryOwed: boolean;
  /** Something the cost cannot be trusted without. */
  warning: string | null;
};

export function burdenPct(settings: PaySettings): number {
  return (settings.ficaPct + settings.futaPct + settings.statePct + settings.workersCompPct) / 100;
}

/**
 * What one person costs for one week.
 *
 * Two rules that are easy to get wrong, and are the whole reason this is
 * worked out rather than typed:
 *
 * Salary is owed by the week. If a salaried person is scheduled for one day,
 * the company owes the whole week - that is what exempt means - so their cost
 * is the weekly rate the moment any shift exists, and zero only when the week
 * is entirely OFF.
 *
 * Overtime is over 40 in the week. The daily rule exists in the settings for
 * the day it is needed; it is off, because everyone signed a 4 x 10 agreement.
 * When on, the daily and weekly overtime are not double counted: an hour is
 * overtime once.
 */
export function weekCost(
  employee: Pick<Employee, "id" | "payType" | "payRate">,
  shifts: (Pick<Shift, "workDate" | "startTime" | "endTime" | "breakMinutes"> & { absenceTypeId?: string | null })[],
  settings: PaySettings,
  breakHours = 0,
  /** Absence type id -> paid hours for it (0 when unpaid). */
  paidAbsence: Map<string, number> = new Map()
): WeekCost {
  const worked = shifts.filter((shift) => !isOff(shift));
  const hours = worked.reduce((sum, shift) => sum + shiftHours(shift, breakHours), 0);
  const pct = burdenPct(settings);

  // PTO and paid holidays: paid at the plain rate, no overtime, and they do
  // not count towards the 40 - the same as the paycheck treats them.
  const paidAbsenceHours = shifts
    .filter((shift) => isOff(shift) && shift.absenceTypeId)
    .reduce((sum, shift) => sum + (paidAbsence.get(shift.absenceTypeId!) ?? 0), 0);

  if (employee.payType === "salary") {
    const daysWorked = new Set(worked.map((s) => s.workDate)).size;
    const owed = daysWorked > 0;
    const rate = employee.payRate ?? 0;
    const wages =
      !owed
        ? 0
        : settings.salaryRule === "per_day"
          ? Math.min(rate, (rate / Math.max(1, settings.salaryDaysPerWeek)) * daysWorked)
          : rate;
    return {
      employeeId: employee.id,
      payType: "salary",
      hours,
      regularHours: hours,
      overtimeHours: 0,
      paidAbsenceHours,
      wages,
      burden: wages * pct,
      total: wages * (1 + pct),
      salaryOwed: owed,
      warning:
        owed && employee.payRate === null
          ? "No weekly rate from Paychex - counted as zero"
          : null,
    };
  }

  const rate = employee.payRate ?? 0;

  const dailyApplies =
    settings.dailyOvertimeEnabled && rate < settings.dailyOvertimeRateCeiling;

  let dailyOvertime = 0;
  if (dailyApplies) {
    const byDay = new Map<string, number>();
    for (const shift of worked) {
      byDay.set(shift.workDate, (byDay.get(shift.workDate) ?? 0) + shiftHours(shift, breakHours));
    }
    for (const dayHours of byDay.values()) {
      dailyOvertime += Math.max(0, dayHours - settings.dailyOvertimeAfter);
    }
  }

  const regularAfterDaily = hours - dailyOvertime;
  const weeklyOvertime = Math.max(0, regularAfterDaily - settings.weeklyOvertimeAfter);

  const overtimeHours = dailyOvertime + weeklyOvertime;
  const regularHours = hours - overtimeHours;

  const wages =
    regularHours * rate + overtimeHours * rate * settings.overtimeMultiplier + paidAbsenceHours * rate;

  return {
    employeeId: employee.id,
    payType: "hourly",
    hours,
    regularHours,
    overtimeHours,
    paidAbsenceHours,
    wages,
    burden: wages * pct,
    total: wages * (1 + pct),
    salaryOwed: false,
    warning:
      (hours > 0 || paidAbsenceHours > 0) && employee.payRate === null
        ? "No hourly rate from Paychex - counted as zero"
        : null,
  };
}

/** A department's week, summed. */
export function sumCosts(costs: WeekCost[]) {
  return costs.reduce(
    (sum, cost) => ({
      hours: sum.hours + cost.hours,
      overtimeHours: sum.overtimeHours + cost.overtimeHours,
      paidAbsenceHours: sum.paidAbsenceHours + cost.paidAbsenceHours,
      wages: sum.wages + cost.wages,
      burden: sum.burden + cost.burden,
      total: sum.total + cost.total,
      people: sum.people + (cost.hours > 0 || cost.salaryOwed ? 1 : 0),
    }),
    { hours: 0, overtimeHours: 0, paidAbsenceHours: 0, wages: 0, burden: 0, total: 0, people: 0 }
  );
}

/** Absence type id -> paid hours, for weekCost. */
export function paidAbsenceMap(types: AbsenceType[]): Map<string, number> {
  return new Map(types.map((t) => [t.id, t.paid ? t.paidHours : 0]));
}

export function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/* ---------------- approval ---------------- */

/** How far along the chain a schedule is. */
export function approvalState(
  steps: ApprovalStep[],
  approvals: ScheduleApproval[]
): { required: number; done: number; nextStep: ApprovalStep | null; complete: boolean } {
  const ordered = [...steps].sort((a, b) => a.step - b.step);
  const signed = new Set(approvals.map((a) => a.step));
  const next = ordered.find((s) => !signed.has(s.step)) ?? null;
  return {
    required: ordered.length,
    done: ordered.filter((s) => signed.has(s.step)).length,
    nextStep: next,
    complete: next === null,
  };
}
