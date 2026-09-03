import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/supabase/missing";
import { allRows } from "@/lib/supabase/all-rows";
import {
  DEFAULT_PAY_SETTINGS,
  type AbsenceType,
  type ApprovalStep,
  type Department,
  type Employee,
  type Group,
  type HrLevel,
  type PaySettings,
  type Schedule,
  type ScheduleApproval,
  type Shift,
} from "@/lib/hr/model";

/**
 * Everything the HR pages read.
 *
 * Every query selects "*" and pages: named columns fail the whole query the
 * moment a migration adds one PostgREST has not caught up with, and the
 * default response cap of a thousand rows fails silently - both lessons the
 * production app learned the hard way.
 */

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

function toDepartment(row: Row): Department {
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    paychexCode: str(row.paychex_code),
    line: str(row.line),
    color: str(row.color),
    supervisorId: str(row.supervisor_id),
    breakHours: num(row.break_hours) ?? 0,
    requiredHeadcount: num(row.required_headcount) ?? 0,
    usualStart: typeof row.usual_start === "string" ? row.usual_start.slice(0, 5) : null,
    usualEnd: typeof row.usual_end === "string" ? row.usual_end.slice(0, 5) : null,
    timecardCheck: str(row.timecard_check),
    sortOrder: num(row.sort_order) ?? 0,
    active: bool(row.active, true),
  };
}

function toEmployee(row: Row): Employee {
  return {
    id: row.id as string,
    paychexId: (row.paychex_id as string) ?? "",
    firstName: (row.first_name as string) ?? "",
    lastName: (row.last_name as string) ?? "",
    preferredName: str(row.preferred_name),
    email: str(row.email),
    personalEmail: str(row.personal_email),
    phone: str(row.phone),
    departmentId: str(row.department_id),
    payType: row.pay_type === "salary" ? "salary" : "hourly",
    payRate: num(row.pay_rate),
    isSupervisor: bool(row.is_supervisor, false),
    employeeType: row.employee_type === "contractor" ? "contractor" : "employee",
    fullTime: bool(row.full_time, true),
    paychexSupervisorId: str(row.paychex_supervisor_id),
    hiredOn: str(row.hired_on),
    active: bool(row.active, true),
    showOnSchedule: bool(row.show_on_schedule, true),
    sortOrder: num(row.sort_order),
  };
}

function toShift(row: Row): Shift {
  // Postgres time comes back as "07:00:00"; the model keeps "07:00".
  const clip = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : null);
  return {
    id: row.id as string,
    scheduleId: row.schedule_id as string,
    employeeId: row.employee_id as string,
    workDate: row.work_date as string,
    startTime: clip(row.start_time),
    endTime: clip(row.end_time),
    breakMinutes: num(row.break_minutes) ?? 0,
    note: str(row.note),
    isFloat: bool(row.is_float, false),
    floatApprovedAt: str(row.float_approved_at),
    absenceTypeId: str(row.absence_type_id),
  };
}

function toSchedule(row: Row, names: Map<string, string>, approvals: ScheduleApproval[]): Schedule {
  return {
    id: row.id as string,
    departmentId: row.department_id as string,
    weekStart: row.week_start as string,
    status: (row.status as Schedule["status"]) ?? "draft",
    name: str(row.name),
    createdBy: str(row.created_by),
    createdByName: names.get(row.created_by as string) ?? null,
    approvedBy: str(row.approved_by),
    approvedByName: names.get(row.approved_by as string) ?? null,
    approvedAt: str(row.approved_at),
    sentAt: str(row.sent_at),
    updatedAt: (row.updated_at as string) ?? "",
    approvals,
  };
}

export type HrData = {
  departments: Department[];
  employees: Employee[];
  settings: PaySettings;
  groups: Group[];
  approvalSteps: ApprovalStep[];
  /** Per-login HR level; a login with no row is a user. */
  userAccess: Map<string, HrLevel>;
  /** Reasons a day can be off: PTO, holiday, furlough... */
  absenceTypes: AbsenceType[];
  /** The first migration has not run. */
  missingTable: boolean;
  /** The rules migration has not run. */
  missingRules: boolean;
};

export async function fetchHrData(supabase: SupabaseClient): Promise<HrData> {
  const [departments, employees, settings, groups, groupDepts, groupMembers, steps, access, absences] =
    await Promise.all([
      allRows<Row>((from, to) =>
        supabase.from("hr_departments").select("*").order("sort_order").range(from, to)
      ),
      allRows<Row>((from, to) =>
        supabase.from("hr_employees").select("*").order("last_name").range(from, to)
      ),
      supabase.from("hr_pay_settings").select("*").limit(1).maybeSingle(),
      supabase.from("hr_groups").select("*").order("sort_order"),
      supabase.from("hr_group_departments").select("*"),
      supabase.from("hr_group_members").select("*"),
      supabase.from("hr_approval_steps").select("*").order("step"),
      supabase.from("hr_user_access").select("*"),
      supabase.from("hr_absence_types").select("*").order("sort_order"),
    ]);

  const missing =
    (departments.error !== null && /could not find the table|42P01/i.test(departments.error)) ||
    (settings.error !== null && isMissingTable(settings.error));
  const missingRules = groups.error !== null && isMissingTable(groups.error);

  const s = (settings.data ?? {}) as Row;

  const groupList: Group[] = ((groups.data ?? []) as Row[]).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? "",
    seesAllDepartments: bool(row.sees_all_departments, false),
    seesCost: bool(row.sees_cost, false),
    sortOrder: num(row.sort_order) ?? 0,
    departmentIds: ((groupDepts.data ?? []) as Row[])
      .filter((d) => d.group_id === row.id)
      .map((d) => d.department_id as string),
    memberIds: ((groupMembers.data ?? []) as Row[])
      .filter((m) => m.group_id === row.id)
      .map((m) => m.employee_id as string),
  }));

  return {
    departments: departments.rows.map(toDepartment),
    employees: employees.rows.map(toEmployee),
    settings: settings.data
      ? {
          weeklyOvertimeAfter: num(s.weekly_overtime_after) ?? 40,
          dailyOvertimeAfter: num(s.daily_overtime_after) ?? 8,
          dailyOvertimeEnabled: bool(s.daily_overtime_enabled, false),
          dailyOvertimeRateCeiling: num(s.daily_overtime_rate_ceiling) ?? 18,
          overtimeMultiplier: num(s.overtime_multiplier) ?? 1.5,
          salaryRule: s.salary_rule === "per_day" ? "per_day" : "week_if_any",
          salaryDaysPerWeek: num(s.salary_days_per_week) ?? 5,
          ficaPct: num(s.fica_pct) ?? 7.65,
          futaPct: num(s.futa_pct) ?? 0.6,
          statePct: num(s.state_pct) ?? 1.17,
          workersCompPct: num(s.workers_comp_pct) ?? 0,
        }
      : DEFAULT_PAY_SETTINGS,
    groups: groupList,
    approvalSteps: ((steps.data ?? []) as Row[]).map((row) => ({
      departmentId: row.department_id as string,
      step: num(row.step) ?? 0,
      employeeId: row.employee_id as string,
    })),
    userAccess: new Map(
      ((access.data ?? []) as Row[]).map((row) => [
        row.profile_id as string,
        (row.level === "admin" || row.level === "none" ? row.level : "user") as HrLevel,
      ])
    ),
    absenceTypes: ((absences.data ?? []) as Row[]).map((row) => ({
      id: row.id as string,
      name: (row.name as string) ?? "",
      code: (row.code as string) ?? "",
      paid: bool(row.paid, false),
      paidHours: num(row.paid_hours) ?? 0,
      color: str(row.color),
      sortOrder: num(row.sort_order) ?? 0,
      active: bool(row.active, true),
    })),
    missingTable: missing,
    missingRules,
  };
}

/** Where a department's own people are working elsewhere. */
export type AwayShift = {
  employeeId: string;
  workDate: string;
  departmentId: string;
  startTime: string;
  endTime: string;
  approved: boolean;
};

/** One week of the department, as it is on screen. */
export type WeekOnScreen = {
  weekStart: string;
  /** Every schedule for the week: approved and drafts. */
  schedules: Schedule[];
  /** The one whose shifts are shown, or null for an empty draft-to-be. */
  viewing: Schedule | null;
};

/**
 * One department across one or more weeks.
 *
 * For each week: every schedule (approved and drafts), which one is on
 * screen, and its shifts. Also any shifts the department's own people have
 * in OTHER departments over those weeks, so their row can say "at Pizza
 * Assembly" instead of looking free.
 *
 * What is on screen per week: with `editingBy`, that person's draft (or
 * nothing, until they type). Otherwise the asked-for schedule if it belongs
 * to the week, else the approved one, else the newest draft.
 */
export async function fetchWeeks(
  supabase: SupabaseClient,
  departmentId: string,
  weekStarts: string[],
  options: { viewingId: string | null; editingBy: string | null; homeEmployeeIds: string[] }
): Promise<{
  weeks: WeekOnScreen[];
  shifts: Shift[];
  away: AwayShift[];
  /**
   * Where every department stands for the first week on screen: approved, or
   * only a draft so far. A department with no entry has not started.
   */
  statusForWeek: { departmentId: string; status: "approved" | "draft"; scheduleId: string }[];
}> {
  if (weekStarts.length === 0) return { weeks: [], shifts: [], away: [], statusForWeek: [] };

  const { data: allRowsForWeeks } = await supabase
    .from("hr_schedules")
    .select("*")
    .in("week_start", weekStarts)
    .order("created_at", { ascending: false });

  const weekRows = (allRowsForWeeks ?? []) as Row[];
  const rows = weekRows.filter((row) => row.department_id === departmentId);

  const authorIds = [
    ...new Set(rows.flatMap((row) => [row.created_by, row.approved_by]).filter(Boolean)),
  ] as string[];
  const scheduleIds = rows.map((row) => row.id as string);

  const [{ data: people }, { data: approvalRows }] = await Promise.all([
    authorIds.length > 0
      ? supabase.from("profiles").select("id, full_name, email").in("id", authorIds)
      : Promise.resolve({ data: [] as Row[] }),
    scheduleIds.length > 0
      ? supabase.from("hr_schedule_approvals").select("*").in("schedule_id", scheduleIds).order("step")
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const signerIds = [
    ...new Set(((approvalRows ?? []) as Row[]).map((a) => a.approved_by).filter(Boolean)),
  ] as string[];
  const { data: signers } =
    signerIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, email").in("id", signerIds)
      : { data: [] as Row[] };

  const names = new Map<string, string>();
  for (const person of [...((people ?? []) as Row[]), ...((signers ?? []) as Row[])]) {
    names.set(
      person.id as string,
      (person.full_name as string | null) || (person.email as string | null) || "Unknown"
    );
  }

  const approvalsFor = (scheduleId: string): ScheduleApproval[] =>
    ((approvalRows ?? []) as Row[])
      .filter((a) => a.schedule_id === scheduleId)
      .map((a) => ({
        step: num(a.step) ?? 0,
        approvedBy: str(a.approved_by),
        approvedByName: names.get(a.approved_by as string) ?? null,
        approvedAt: (a.approved_at as string) ?? "",
      }));

  const schedules = rows.map((row) => toSchedule(row, names, approvalsFor(row.id as string)));

  const weeks: WeekOnScreen[] = weekStarts.map((weekStart) => {
    const mine = schedules.filter((s) => s.weekStart === weekStart);
    const viewing = options.editingBy
      ? (mine.find((s) => s.status === "draft" && s.createdBy === options.editingBy) ?? null)
      : (mine.find((s) => s.id === options.viewingId) ??
        mine.find((s) => s.status === "approved") ??
        mine.find((s) => s.status === "draft") ??
        null);
    return { weekStart, schedules: mine, viewing };
  });

  const viewingIds = weeks.map((w) => w.viewing?.id).filter(Boolean) as string[];
  const shifts =
    viewingIds.length > 0
      ? (
          await allRows<Row>((from, to) =>
            supabase.from("hr_shifts").select("*").in("schedule_id", viewingIds).range(from, to)
          )
        ).rows.map(toShift)
      : [];

  // Own people working elsewhere: float shifts in other departments' approved
  // or draft schedules for the same weeks.
  const elsewhere = weekRows.filter(
    (row) => row.department_id !== departmentId && row.status !== "archived"
  );
  const deptOf = new Map(elsewhere.map((row) => [row.id as string, row.department_id as string]));
  let away: AwayShift[] = [];
  if (elsewhere.length > 0 && options.homeEmployeeIds.length > 0) {
    const { data: awayRows } = await supabase
      .from("hr_shifts")
      .select("*")
      .in("schedule_id", [...deptOf.keys()])
      .in("employee_id", options.homeEmployeeIds)
      .eq("is_float", true);
    away = ((awayRows ?? []) as Row[])
      .filter((row) => typeof row.start_time === "string" && typeof row.end_time === "string")
      .map((row) => ({
        employeeId: row.employee_id as string,
        workDate: row.work_date as string,
        departmentId: deptOf.get(row.schedule_id as string) ?? "",
        startTime: (row.start_time as string).slice(0, 5),
        endTime: (row.end_time as string).slice(0, 5),
        approved: row.float_approved_at !== null,
      }));
  }

  // Approved beats draft; one entry per department.
  const statusForWeek: { departmentId: string; status: "approved" | "draft"; scheduleId: string }[] = [];
  const placed = new Set<string>();
  const firstWeek = weekRows.filter((row) => row.week_start === weekStarts[0]);
  for (const status of ["approved", "draft"] as const) {
    for (const row of firstWeek) {
      const dept = row.department_id as string;
      if (row.status !== status || placed.has(dept)) continue;
      placed.add(dept);
      statusForWeek.push({ departmentId: dept, status, scheduleId: row.id as string });
    }
  }

  return { weeks, shifts, away, statusForWeek };
}

/** Every approved week in a range, for the dashboard. */
export async function fetchApprovedWeeks(
  supabase: SupabaseClient,
  weekStarts: string[]
): Promise<{ schedules: Schedule[]; shifts: Shift[] }> {
  if (weekStarts.length === 0) return { schedules: [], shifts: [] };

  const { data: rows } = await supabase
    .from("hr_schedules")
    .select("*")
    .eq("status", "approved")
    .in("week_start", weekStarts);

  const schedules = ((rows ?? []) as Row[]).map((row) => toSchedule(row, new Map(), []));
  if (schedules.length === 0) return { schedules, shifts: [] };

  const shifts = (
    await allRows<Row>((from, to) =>
      supabase
        .from("hr_shifts")
        .select("*")
        .in("schedule_id", schedules.map((s) => s.id))
        .range(from, to)
    )
  ).rows.map(toShift);

  return { schedules, shifts };
}
