"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/supabase/missing";
import type { ImportedEmployee } from "@/lib/hr/import";
import { fetchHrData } from "@/lib/hr/fetch";
import { canApproveFloat, canSign, resolveAccess } from "@/lib/hr/access";
import {
  DAY_NAMES,
  addDays,
  approvalState,
  displayName,
  displayTime,
  isSchedulable,
  monthDay,
  sendTo,
  sortPeople,
  weekDates,
  type PaySettings,
} from "@/lib/hr/model";

export type HrResult = { ok: true } | { ok: false; message: string };

const HR = "/hr";
const fail = (message: string): HrResult => ({ ok: false, message });

const missing = (error: { message: string; code?: string }) => {
  if (!isMissingTable(error)) return error.message;
  if (/absence/i.test(error.message)) return "Off because needs the 20260903_hr_absences migration. Run it in the Supabase SQL editor.";
  return "HR needs its migrations. Run 20260903_hr, 20260903_hr_rules, 20260903_hr_staffing, 20260903_hr_absences and 20260903_hr_arrange in the Supabase SQL editor.";
};

function revalidateAll() {
  for (const path of [
    HR,
    `${HR}/people`,
    `${HR}/schedule`,
    `${HR}/schedule/print`,
    `${HR}/settings/departments`,
    `${HR}/settings/groups`,
    `${HR}/settings/approval`,
    `${HR}/settings/pay`,
  ]) {
    revalidatePath(path);
  }
}

/* ---------------- people ---------------- */

/**
 * Writes a Paychex export into HR.
 *
 * Keyed on the Paychex employee id, so running it again updates people rather
 * than duplicating them. Departments named in the file are created if new,
 * with their code and line. The Employee Listings export contains every
 * active person, so anyone in HR who is NOT in the file is set inactive - the
 * rule Carlos confirmed - and drops off every schedule.
 */
export async function importEmployees(input: {
  employees: ImportedEmployee[];
}): Promise<HrResult & { imported?: number; departmentsAdded?: number; deactivated?: number }> {
  if (!input.employees?.length) return fail("Nothing to import");

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can import people");

  const { data: existing, error: deptError } = await supabase
    .from("hr_departments")
    .select("id, name, paychex_code, line");
  if (deptError) return fail(missing(deptError));

  const byName = new Map(
    (existing ?? []).map((row) => [String(row.name).trim().toUpperCase(), row])
  );

  const wanted = new Map<string, { code: string | null; line: string | null }>();
  for (const e of input.employees) {
    const name = e.department?.trim();
    if (name && !wanted.has(name)) wanted.set(name, { code: e.departmentCode, line: e.line });
  }

  const toAdd = [...wanted.entries()].filter(([name]) => !byName.has(name.toUpperCase()));
  if (toAdd.length > 0) {
    const { data: added, error } = await supabase
      .from("hr_departments")
      .insert(
        toAdd.map(([name, info], index) => ({
          name,
          sort_order: (existing?.length ?? 0) + index + 1,
          paychex_code: info.code,
          line: info.line,
        }))
      )
      .select("id, name, paychex_code, line");
    if (error) return fail(missing(error));
    for (const row of added ?? []) byName.set(String(row.name).trim().toUpperCase(), row);
  }

  // Existing departments learn their code and line if they did not have one.
  for (const [name, info] of wanted) {
    const row = byName.get(name.toUpperCase());
    if (row && (!row.paychex_code || !row.line) && (info.code || info.line)) {
      await supabase
        .from("hr_departments")
        .update({
          paychex_code: row.paychex_code ?? info.code,
          line: row.line ?? info.line,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id as string);
    }
  }

  const now = new Date().toISOString();
  const rows = input.employees.map((e) => ({
    paychex_id: e.paychexId,
    first_name: e.firstName,
    last_name: e.lastName,
    preferred_name: e.preferredName,
    email: e.email,
    personal_email: e.personalEmail,
    phone: e.phone,
    department_id: e.department
      ? ((byName.get(e.department.trim().toUpperCase())?.id as string | undefined) ?? null)
      : null,
    pay_type: e.payType,
    pay_rate: e.payRate,
    is_supervisor: e.isSupervisor,
    employee_type: e.employeeType,
    full_time: e.fullTime,
    paychex_supervisor_id: e.paychexSupervisorId,
    hired_on: e.hiredOn,
    active: e.active,
    imported_at: now,
    updated_at: now,
  }));

  const { error } = await supabase.from("hr_employees").upsert(rows, { onConflict: "paychex_id" });
  if (error) return fail(missing(error));

  // Not in the file means no longer active in Paychex.
  const ids = rows.map((r) => r.paychex_id);
  const { data: gone } = await supabase
    .from("hr_employees")
    .select("id, paychex_id")
    .eq("active", true);
  const toDeactivate = (gone ?? []).filter((row) => !ids.includes(row.paychex_id as string));
  if (toDeactivate.length > 0) {
    await supabase
      .from("hr_employees")
      .update({ active: false, updated_at: now })
      .in("id", toDeactivate.map((row) => row.id as string));
  }

  revalidateAll();
  return {
    ok: true,
    imported: rows.length,
    departmentsAdded: toAdd.length,
    deactivated: toDeactivate.length,
  };
}

export async function saveEmployee(input: {
  id: string;
  departmentId: string | null;
  payType: "hourly" | "salary";
  payRate: number | null;
  email: string | null;
  personalEmail: string | null;
  phone: string | null;
  isSupervisor: boolean;
  showOnSchedule: boolean;
}): Promise<HrResult> {
  if (!input.id) return fail("Missing person");
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change a person");

  const { error } = await supabase
    .from("hr_employees")
    .update({
      department_id: input.departmentId,
      pay_type: input.payType,
      pay_rate: input.payRate,
      email: input.email,
      personal_email: input.personalEmail,
      phone: input.phone,
      is_supervisor: input.isSupervisor,
      show_on_schedule: input.showOnSchedule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return fail(missing(error));

  revalidateAll();
  return { ok: true };
}

/** The one-click switch on the People list. */
export async function setShowOnSchedule(input: { id: string; show: boolean }): Promise<HrResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change a person");
  const { error } = await supabase
    .from("hr_employees")
    .update({ show_on_schedule: input.show, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return fail(missing(error));
  revalidateAll();
  return { ok: true };
}

/* ---------------- departments ---------------- */

export async function saveDepartment(input: {
  id?: string;
  name: string;
  line: string | null;
  color: string | null;
  breakHours: number;
  sortOrder: number;
  active: boolean;
}): Promise<HrResult> {
  const name = input.name.trim();
  if (!name) return fail("A department needs a name");
  if (!Number.isFinite(input.breakHours) || input.breakHours < 0 || input.breakHours > 8) {
    return fail("Break hours must be between 0 and 8");
  }
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change departments");

  const row = {
    name,
    line: input.line,
    color: input.color,
    break_hours: input.breakHours,
    sort_order: input.sortOrder,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await supabase.from("hr_departments").update(row).eq("id", input.id)
    : await supabase.from("hr_departments").insert(row);
  if (error) return fail(missing(error));

  revalidateAll();
  return { ok: true };
}

/** A System administrator, or a login whose HR level is Administrator. */
async function isHrAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: NonNullable<Awaited<ReturnType<typeof getCurrentUserProfile>>>
): Promise<boolean> {
  if (isAdminProfile(profile)) return true;
  const { data } = await supabase.from("hr_user_access").select("level").eq("profile_id", profile.id).maybeSingle();
  return data?.level === "admin";
}

/**
 * The staffing sheet: how many a department should have, the hours it usually
 * runs, and who supervises it - chosen from the Paychex list. Administrators
 * only; the button that opens the fields is theirs alone.
 */
export async function saveStaffing(input: {
  departmentId: string;
  requiredHeadcount: number;
  usualStart: string | null;
  usualEnd: string | null;
  supervisorId: string | null;
}): Promise<HrResult> {
  if (!input.departmentId) return fail("Missing department");
  if (!Number.isInteger(input.requiredHeadcount) || input.requiredHeadcount < 0 || input.requiredHeadcount > 999) {
    return fail("Required people must be a whole number");
  }
  if ((input.usualStart === null) !== (input.usualEnd === null)) {
    return fail("Usual hours need both a start and an end");
  }
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change staffing");

  const { error } = await supabase
    .from("hr_departments")
    .update({
      required_headcount: input.requiredHeadcount,
      usual_start: input.usualStart,
      usual_end: input.usualEnd,
      supervisor_id: input.supervisorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.departmentId);
  if (error) return fail(missing(error));

  revalidatePath(HR);
  revalidatePath(`${HR}/settings/departments`);
  return { ok: true };
}

/**
 * The order departments sit in, everywhere they are listed: the dashboard,
 * staffing, the schedule's department list. Dragging rows on the dashboard
 * ends here. Administrators only.
 */
export async function saveDepartmentOrder(input: { ids: string[] }): Promise<HrResult> {
  if (input.ids.length === 0) return fail("Nothing to arrange");
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can arrange departments");

  const now = new Date().toISOString();
  const results = await Promise.all(
    input.ids.map((id, index) =>
      supabase.from("hr_departments").update({ sort_order: index + 1, updated_at: now }).eq("id", id)
    )
  );
  const error = results.find((r) => r.error)?.error;
  if (error) return fail(missing(error));

  revalidateAll();
  return { ok: true };
}

/**
 * The order people sit in on one department's schedule, from dragging rows
 * while editing. Only that department's own people are touched. Administrators
 * only, since it is written on the person.
 */
export async function saveEmployeeOrder(input: { departmentId: string; ids: string[] }): Promise<HrResult> {
  if (!input.departmentId || input.ids.length === 0) return fail("Nothing to arrange");
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can arrange people");

  const now = new Date().toISOString();
  const results = await Promise.all(
    input.ids.map((id, index) =>
      supabase
        .from("hr_employees")
        .update({ sort_order: index + 1, updated_at: now })
        .eq("id", id)
        .eq("department_id", input.departmentId)
    )
  );
  const error = results.find((r) => r.error)?.error;
  if (error) {
    return fail(
      /sort_order/i.test(error.message)
        ? "Arranging people needs the 20260903_hr_arrange migration. Run it in the Supabase SQL editor."
        : missing(error)
    );
  }

  revalidatePath(`${HR}/schedule`);
  revalidatePath(`${HR}/schedule/print`);
  revalidatePath(HR);
  return { ok: true };
}

/* ---------------- day types: why someone is off ---------------- */

export async function saveAbsenceType(input: {
  id?: string;
  name: string;
  code: string;
  paid: boolean;
  paidHours: number;
  color: string | null;
  sortOrder: number;
  active: boolean;
}): Promise<HrResult> {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase().slice(0, 6);
  if (!name) return fail("A day type needs a name");
  if (!code) return fail("A day type needs a short code, like PTO");
  if (!Number.isFinite(input.paidHours) || input.paidHours < 0 || input.paidHours > 24) {
    return fail("Paid hours must be between 0 and 24");
  }
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change day types");

  const row = {
    name,
    code,
    paid: input.paid,
    paid_hours: input.paid ? input.paidHours : 0,
    color: input.color,
    sort_order: input.sortOrder,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await supabase.from("hr_absence_types").update(row).eq("id", input.id)
    : await supabase.from("hr_absence_types").insert(row);
  if (error) return fail(missing(error));

  revalidateAll();
  revalidatePath(`${HR}/settings/absences`);
  return { ok: true };
}

export async function deleteAbsenceType(input: { id: string }): Promise<HrResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change day types");
  const { error } = await supabase.from("hr_absence_types").delete().eq("id", input.id);
  if (error) return fail(missing(error));
  revalidateAll();
  revalidatePath(`${HR}/settings/absences`);
  return { ok: true };
}

/* ---------------- groups: who sees what ---------------- */

export async function saveGroup(input: {
  id?: string;
  name: string;
  seesAllDepartments: boolean;
  seesCost: boolean;
  sortOrder: number;
  departmentIds: string[];
  memberIds: string[];
}): Promise<HrResult> {
  const name = input.name.trim();
  if (!name) return fail("A group needs a name");
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change groups");

  const row = {
    name,
    sees_all_departments: input.seesAllDepartments,
    sees_cost: input.seesCost,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };

  let id = input.id;
  if (id) {
    const { error } = await supabase.from("hr_groups").update(row).eq("id", id);
    if (error) return fail(missing(error));
  } else {
    const { data, error } = await supabase.from("hr_groups").insert(row).select("id").single();
    if (error) return fail(missing(error));
    id = data.id as string;
  }

  // Replace the lists wholesale; they are small and this cannot drift.
  await supabase.from("hr_group_departments").delete().eq("group_id", id);
  await supabase.from("hr_group_members").delete().eq("group_id", id);
  if (input.departmentIds.length > 0) {
    const { error } = await supabase
      .from("hr_group_departments")
      .insert(input.departmentIds.map((department_id) => ({ group_id: id, department_id })));
    if (error) return fail(error.message);
  }
  if (input.memberIds.length > 0) {
    const { error } = await supabase
      .from("hr_group_members")
      .insert(input.memberIds.map((employee_id) => ({ group_id: id, employee_id })));
    if (error) return fail(error.message);
  }

  revalidateAll();
  return { ok: true };
}

export async function deleteGroup(input: { id: string }): Promise<HrResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change groups");
  const { error } = await supabase.from("hr_groups").delete().eq("id", input.id);
  if (error) return fail(missing(error));
  revalidateAll();
  return { ok: true };
}

/* ---------------- approval chain ---------------- */

/** Replaces a department's chain with these people, in this order. */
export async function saveApprovalChain(input: {
  departmentId: string;
  employeeIds: string[];
}): Promise<HrResult> {
  if (!input.departmentId) return fail("Missing department");
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change who approves");

  const unique = [...new Set(input.employeeIds.filter(Boolean))];

  const { error: clearError } = await supabase
    .from("hr_approval_steps")
    .delete()
    .eq("department_id", input.departmentId);
  if (clearError) return fail(missing(clearError));

  if (unique.length > 0) {
    const { error } = await supabase.from("hr_approval_steps").insert(
      unique.map((employee_id, index) => ({
        department_id: input.departmentId,
        step: index + 1,
        employee_id,
      }))
    );
    if (error) return fail(error.message);
  }

  revalidateAll();
  return { ok: true };
}

/* ---------------- schedules ---------------- */

/**
 * The draft for this department's week, opened on demand.
 *
 * Like the production plan: nobody presses "new schedule". Typing a shift is
 * what opens the draft, and there is one open draft per person per week.
 */
async function openDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  departmentId: string,
  weekStart: string,
  userId: string
): Promise<{ id: string } | { error: string }> {
  const { data: mine } = await supabase
    .from("hr_schedules")
    .select("id")
    .eq("department_id", departmentId)
    .eq("week_start", weekStart)
    .eq("status", "draft")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mine) return { id: mine.id as string };

  const { data, error } = await supabase
    .from("hr_schedules")
    .insert({
      department_id: departmentId,
      week_start: weekStart,
      status: "draft",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { error: missing(error) };
  return { id: data.id as string };
}

/**
 * Where a borrowed person's day is written in the HOST department.
 *
 * A float is sent from the person's own department, by a supervisor who has
 * no draft in the host department and should not be starting one. So it goes
 * into the host's approved week if there is one, else the host's newest draft
 * whoever wrote it, else a fresh draft. Either way it carries its own "?"
 * until an approver of the host department signs it.
 */
async function openHostSchedule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  departmentId: string,
  weekStart: string,
  userId: string
): Promise<{ id: string } | { error: string }> {
  const { data: rows } = await supabase
    .from("hr_schedules")
    .select("id, status")
    .eq("department_id", departmentId)
    .eq("week_start", weekStart)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  const approved = rows?.find((r) => r.status === "approved");
  if (approved) return { id: approved.id as string };
  const draft = rows?.find((r) => r.status === "draft");
  if (draft) return { id: draft.id as string };
  return openDraft(supabase, departmentId, weekStart, userId);
}

/**
 * Sets one person's day.
 *
 * Both times or neither: a start with no end is not a shift, it is a typo.
 * Null for both means OFF, and OFF is stored as a row, because "we decided
 * this person is off" is different from "nobody has looked at this day".
 *
 * isFloat marks a person working in `departmentId` whose home is another
 * department. It waits for an approver of that department to sign it.
 */
export async function saveShift(input: {
  departmentId: string;
  weekStart: string;
  employeeId: string;
  workDate: string;
  startTime: string | null;
  endTime: string | null;
  breakMinutes?: number;
  isFloat?: boolean;
}): Promise<HrResult & { scheduleId?: string }> {
  return saveShifts({
    departmentId: input.departmentId,
    weekStart: input.weekStart,
    employeeId: input.employeeId,
    isFloat: input.isFloat,
    days: [{ workDate: input.workDate, startTime: input.startTime, endTime: input.endTime }],
  });
}

/**
 * Sets several of one person's days at once - "same Monday to Friday".
 *
 * One round trip instead of five, and one draft opened instead of a race to
 * open five.
 */
export async function saveShifts(input: {
  departmentId: string;
  weekStart: string;
  employeeId: string;
  isFloat?: boolean;
  days: {
    workDate: string;
    startTime: string | null;
    endTime: string | null;
    /** Why the day is off - PTO, holiday... Only with both times null. */
    absenceTypeId?: string | null;
  }[];
}): Promise<HrResult & { scheduleId?: string }> {
  const { departmentId, weekStart, employeeId } = input;
  if (!departmentId || !weekStart || !employeeId || input.days.length === 0) return fail("Missing details");
  for (const day of input.days) {
    if ((day.startTime === null) !== (day.endTime === null)) {
      return fail("A shift needs both a start and an end");
    }
    if (day.startTime && day.endTime && day.startTime === day.endTime) {
      return fail("Comes in and leaves cannot be the same time");
    }
    if (day.absenceTypeId && day.startTime) {
      return fail("A day off cannot also have hours");
    }
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const target = input.isFloat
    ? await openHostSchedule(supabase, departmentId, weekStart, profile.id)
    : await openDraft(supabase, departmentId, weekStart, profile.id);
  if ("error" in target) return fail(target.error);

  const now = new Date().toISOString();
  const { error } = await supabase.from("hr_shifts").upsert(
    input.days.map((day) => ({
      schedule_id: target.id,
      employee_id: employeeId,
      work_date: day.workDate,
      start_time: day.startTime,
      end_time: day.endTime,
      break_minutes: 0,
      is_float: input.isFloat ?? false,
      absence_type_id: day.absenceTypeId ?? null,
      updated_by: profile.id,
      updated_at: now,
    })),
    { onConflict: "schedule_id,employee_id,work_date" }
  );
  if (error) return fail(missing(error));

  revalidatePath(`${HR}/schedule`);
  return { ok: true, scheduleId: target.id };
}

/** Signs off a floater's days in this schedule. */
/**
 * Clears days in your draft for a department's week: the whole week, one
 * person's week, or one date for everyone. The rows go, so the days read OFF.
 * Only your draft is touched - an approved week is never cleared from here;
 * Edit copies it into a draft first, and that copy is what is cleared.
 */
export async function clearShifts(input: {
  departmentId: string;
  weekStart: string;
  /** Only these people. Everyone when missing. */
  employeeIds?: string[];
  /** Only these dates. The whole week when missing. */
  dates?: string[];
}): Promise<HrResult & { cleared?: number }> {
  if (!input.departmentId || !input.weekStart) return fail("Missing details");
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const draft = await openDraft(supabase, input.departmentId, input.weekStart, profile.id);
  if ("error" in draft) return fail(draft.error);

  let query = supabase.from("hr_shifts").delete({ count: "exact" }).eq("schedule_id", draft.id);
  if (input.employeeIds && input.employeeIds.length > 0) query = query.in("employee_id", input.employeeIds);
  if (input.dates && input.dates.length > 0) query = query.in("work_date", input.dates);
  const { error, count } = await query;
  if (error) return fail(missing(error));

  revalidatePath(`${HR}/schedule`);
  return { ok: true, cleared: count ?? 0 };
}

export async function approveFloats(input: {
  scheduleId: string;
  employeeId: string;
}): Promise<HrResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const { data: schedule } = await supabase
    .from("hr_schedules")
    .select("id, department_id")
    .eq("id", input.scheduleId)
    .maybeSingle();
  if (!schedule) return fail("That schedule no longer exists");

  const data = await fetchHrData(supabase);
  const access = resolveAccess(profile, data);
  const chain = data.approvalSteps.filter((s) => s.departmentId === schedule.department_id);
  if (!canApproveFloat(access, chain)) {
    return fail("Only an approver of this department or an administrator can approve a floater");
  }

  const { error } = await supabase
    .from("hr_shifts")
    .update({ float_approved_by: profile.id, float_approved_at: new Date().toISOString() })
    .eq("schedule_id", input.scheduleId)
    .eq("employee_id", input.employeeId)
    .eq("is_float", true);
  if (error) return fail(error.message);

  revalidatePath(`${HR}/schedule`);
  return { ok: true };
}

/** Takes a floater back out of this schedule. */
export async function removeFloater(input: {
  scheduleId: string;
  employeeId: string;
}): Promise<HrResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  const { error } = await supabase
    .from("hr_shifts")
    .delete()
    .eq("schedule_id", input.scheduleId)
    .eq("employee_id", input.employeeId)
    .eq("is_float", true);
  if (error) return fail(error.message);
  revalidatePath(`${HR}/schedule`);
  return { ok: true };
}

/**
 * Copies a week - the approved one, or last week's - into your draft.
 *
 * Most weeks look like the last one. Starting from it and changing the
 * exceptions is how the workbook was actually used; starting from blank means
 * retyping a hundred and fifty rows to move three people.
 */
export async function copyWeekIntoDraft(input: {
  departmentId: string;
  weekStart: string;
  fromScheduleId: string;
  /** Shift every date by this many days, e.g. 7 when copying last week. */
  shiftDays: number;
}): Promise<HrResult & { copied?: number }> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const draft = await openDraft(supabase, input.departmentId, input.weekStart, profile.id);
  if ("error" in draft) return fail(draft.error);

  const { data: source } = await supabase
    .from("hr_shifts")
    .select("employee_id, work_date, start_time, end_time, break_minutes, is_float")
    .eq("schedule_id", input.fromScheduleId);

  const rows = (source ?? [])
    // Floaters are a one-off; they do not carry into next week.
    .filter((row) => !row.is_float)
    .map((row) => ({
      schedule_id: draft.id,
      employee_id: row.employee_id as string,
      work_date: addDays(row.work_date as string, input.shiftDays),
      start_time: row.start_time,
      end_time: row.end_time,
      break_minutes: row.break_minutes ?? 0,
      is_float: false,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("hr_shifts")
      .upsert(rows, { onConflict: "schedule_id,employee_id,work_date" });
    if (error) return fail(error.message);
  }

  revalidatePath(`${HR}/schedule`);
  return { ok: true, copied: rows.length };
}

/**
 * Signs the next step of a draft's approval chain.
 *
 * The chain is set per department in Configuration. Each signature is
 * recorded; when the last step is signed the draft becomes the approved week,
 * and the previously approved week is archived so there is exactly one. A
 * department with no chain is approved by an administrator in one step.
 */
export async function approveSchedule(input: { scheduleId: string }): Promise<HrResult & { complete?: boolean }> {
  if (!input.scheduleId) return fail("Missing schedule");
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const { data: draft } = await supabase
    .from("hr_schedules")
    .select("id, department_id, week_start, status")
    .eq("id", input.scheduleId)
    .maybeSingle();
  if (!draft) return fail("That schedule no longer exists");
  if (draft.status !== "draft") return fail("Only a draft can be approved");

  const data = await fetchHrData(supabase);
  const access = resolveAccess(profile, data);
  const chain = data.approvalSteps.filter((s) => s.departmentId === draft.department_id);

  const { data: signedRows } = await supabase
    .from("hr_schedule_approvals")
    .select("step")
    .eq("schedule_id", draft.id);
  const state = approvalState(
    chain,
    (signedRows ?? []).map((r) => ({ step: r.step as number, approvedBy: null, approvedByName: null, approvedAt: "" }))
  );

  if (chain.length === 0 && !access.isAdmin) {
    return fail("Nobody is set to approve this department yet. Ask an administrator to set the approval chain.");
  }
  if (!canSign(access, state.nextStep)) {
    const next = state.nextStep
      ? data.employees.find((e) => e.id === state.nextStep!.employeeId)
      : null;
    return fail(
      next
        ? `Step ${state.nextStep!.step} is ${displayName(next)}'s to sign`
        : "You cannot approve this week"
    );
  }

  const now = new Date().toISOString();

  if (state.nextStep) {
    const { error } = await supabase.from("hr_schedule_approvals").upsert(
      { schedule_id: draft.id, step: state.nextStep.step, approved_by: profile.id, approved_at: now },
      { onConflict: "schedule_id,step" }
    );
    if (error) return fail(missing(error));
  }

  const complete = chain.length === 0 || state.done + 1 >= chain.length;
  if (!complete) {
    revalidatePath(`${HR}/schedule`);
    return { ok: true, complete: false };
  }

  // The previous approved week becomes the record; this one takes its place.
  await supabase
    .from("hr_schedules")
    .update({ status: "archived", updated_at: now })
    .eq("department_id", draft.department_id as string)
    .eq("week_start", draft.week_start as string)
    .eq("status", "approved");

  const { error } = await supabase
    .from("hr_schedules")
    .update({ status: "approved", approved_by: profile.id, approved_at: now, updated_at: now })
    .eq("id", input.scheduleId);
  if (error) return fail(error.message);

  revalidateAll();
  return { ok: true, complete: true };
}

export async function discardSchedule(input: { scheduleId: string }): Promise<HrResult> {
  if (!input.scheduleId) return fail("Missing schedule");
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const { data: row } = await supabase
    .from("hr_schedules")
    .select("id, status, created_by")
    .eq("id", input.scheduleId)
    .maybeSingle();
  if (!row) return { ok: true };
  if (row.status === "approved" && !isAdminProfile(profile)) {
    return fail("Only an administrator can remove an approved week");
  }
  if (row.created_by !== profile.id && !isAdminProfile(profile)) {
    return fail("Only an administrator can discard someone else's draft");
  }

  const { error } = await supabase.from("hr_schedules").delete().eq("id", input.scheduleId);
  if (error) return fail(error.message);

  revalidateAll();
  return { ok: true };
}

/* ---------------- sending ---------------- */

/**
 * Prepares the approved week for email.
 *
 * There is no mail server behind Bettrbyus yet, so this hands back a ready
 * message - recipients, subject, body - that the browser opens in your own
 * mail program with everyone in Bcc. People with no email are listed so
 * nobody is silently missed. Marks the week sent when the message is opened.
 */
/** One line of the week as it will be read: a name and seven short day labels. */
export type SendPreviewRow = {
  name: string;
  /** Set when the person's home is another department. */
  from: string | null;
  days: { label: string; off: boolean }[];
};

type SendPackage =
  | { ok: false; message: string }
  | {
      ok: true;
      scheduleId: string;
      departmentName: string;
      weekStart: string;
      dates: string[];
      rows: SendPreviewRow[];
      recipients: string[];
      missing: string[];
      subject: string;
      body: string;
    };

/**
 * Everything about sending one approved week, worked out once: who gets it,
 * who cannot, the subject, the plain-text body, and the same week as rows for
 * the preview in the dialog. Nothing is written here.
 */
async function buildSendPackage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scheduleId: string
): Promise<SendPackage> {
  const { data: schedule } = await supabase
    .from("hr_schedules")
    .select("id, department_id, week_start, status")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!schedule) return { ok: false, message: "That schedule no longer exists" };
  if (schedule.status !== "approved") return { ok: false, message: "Only the approved week is sent" };

  const data = await fetchHrData(supabase);
  const department = data.departments.find((d) => d.id === schedule.department_id);
  if (!department) return { ok: false, message: "Department not found" };

  const { data: shiftRows } = await supabase.from("hr_shifts").select("*").eq("schedule_id", schedule.id);

  const shifts = (shiftRows ?? []) as Record<string, unknown>[];
  const byEmployee = new Map<string, Record<string, unknown>[]>();
  for (const s of shifts) {
    const list = byEmployee.get(s.employee_id as string) ?? [];
    list.push(s);
    byEmployee.set(s.employee_id as string, list);
  }

  const people = sortPeople(
    data.employees.filter((e) => isSchedulable(e) && (e.departmentId === department.id || byEmployee.has(e.id)))
  );

  const weekStart = schedule.week_start as string;
  const dates = weekDates(weekStart);
  const codeOf = new Map(data.absenceTypes.map((t) => [t.id, t.code]));
  const nameOfDept = (id: string | null) => data.departments.find((d) => d.id === id)?.name ?? null;

  const rows: SendPreviewRow[] = people.map((person) => {
    const mine = byEmployee.get(person.id) ?? [];
    return {
      name: displayName(person),
      from: person.departmentId !== department.id ? nameOfDept(person.departmentId) : null,
      days: dates.map((date) => {
        const s = mine.find((row) => row.work_date === date);
        const start = typeof s?.start_time === "string" ? s.start_time.slice(0, 5) : null;
        const end = typeof s?.end_time === "string" ? s.end_time.slice(0, 5) : null;
        const reason = typeof s?.absence_type_id === "string" ? codeOf.get(s.absence_type_id) : null;
        return start && end
          ? { label: `${displayTime(start)}-${displayTime(end)}`, off: false }
          : { label: reason ?? "OFF", off: true };
      }),
    };
  });

  const lines: string[] = [`${department.name} - week of ${monthDay(weekStart)} to ${monthDay(addDays(weekStart, 6))}`, ""];
  for (const row of rows) {
    lines.push(row.name, `  ${row.days.map((d, i) => `${DAY_NAMES[i].slice(0, 3)} ${d.label}`).join("  |  ")}`, "");
  }

  return {
    ok: true,
    scheduleId: schedule.id as string,
    departmentName: department.name,
    weekStart,
    dates,
    rows,
    recipients: [...new Set(people.map(sendTo).filter(Boolean) as string[])],
    missing: people.filter((p) => !sendTo(p)).map(displayName),
    subject: `${department.name} schedule ${monthDay(weekStart)} - ${monthDay(addDays(weekStart, 6))}`,
    body: lines.join("\n"),
  };
}

/** The week as it will be sent, for looking at before saying yes. Writes nothing. */
export async function previewSend(input: { scheduleId: string }): Promise<
  HrResult & { departmentName?: string; dates?: string[]; rows?: SendPreviewRow[]; recipients?: number; missing?: string[] }
> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  const pack = await buildSendPackage(supabase, input.scheduleId);
  if (!pack.ok) return pack;
  return {
    ok: true,
    departmentName: pack.departmentName,
    dates: pack.dates,
    rows: pack.rows,
    recipients: pack.recipients.length,
    missing: pack.missing,
  };
}

/** The addresses, subject and body for the mail program, and the week marked as sent. */
export async function prepareSend(input: { scheduleId: string }): Promise<
  HrResult & {
    recipients?: string[];
    missing?: string[];
    subject?: string;
    body?: string;
  }
> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const pack = await buildSendPackage(supabase, input.scheduleId);
  if (!pack.ok) return pack;

  await supabase.from("hr_schedules").update({ sent_at: new Date().toISOString() }).eq("id", pack.scheduleId);
  revalidatePath(`${HR}/schedule`);

  return { ok: true, recipients: pack.recipients, missing: pack.missing, subject: pack.subject, body: pack.body };
}

/* ---------------- access ---------------- */

/**
 * Sets one login's HR level, Odoo style: none, user, or administrator.
 *
 * Bettrbyus administrators are HR administrators whatever this says, so the
 * row for one of them is recorded but changes nothing.
 */
export async function setHrAccess(input: {
  profileId: string;
  level: "none" | "user" | "admin";
}): Promise<HrResult> {
  if (!input.profileId) return fail("Missing user");
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!isAdminProfile(profile)) return fail("Only a System administrator can change HR access");
  if (input.profileId === profile.id && input.level !== "admin") {
    return fail("You cannot take HR away from yourself");
  }

  const { error } = await supabase.from("hr_user_access").upsert(
    { profile_id: input.profileId, level: input.level, updated_at: new Date().toISOString() },
    { onConflict: "profile_id" }
  );
  if (error) return fail(missing(error));

  revalidateAll();
  revalidatePath(`${HR}/settings/users`);
  return { ok: true };
}

/* ---------------- pay rules ---------------- */

export async function savePaySettings(input: PaySettings): Promise<HrResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!(await isHrAdmin(supabase, profile))) return fail("Only an administrator can change pay rules");

  const labels: Record<string, string> = {
    weeklyOvertimeAfter: "Weekly overtime after",
    dailyOvertimeAfter: "Daily overtime after",
    dailyOvertimeRateCeiling: "Daily rule applies under",
    overtimeMultiplier: "Overtime rate",
    salaryDaysPerWeek: "Days in a week",
    ficaPct: "FICA",
    futaPct: "FUTA",
    statePct: "Nevada MBT",
    workersCompPct: "Workers' comp",
  };
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      return fail(`${labels[key] ?? key} must be a number, zero or more`);
    }
  }

  const { error } = await supabase.from("hr_pay_settings").upsert({
    id: true,
    weekly_overtime_after: input.weeklyOvertimeAfter,
    daily_overtime_after: input.dailyOvertimeAfter,
    daily_overtime_enabled: input.dailyOvertimeEnabled,
    daily_overtime_rate_ceiling: input.dailyOvertimeRateCeiling,
    overtime_multiplier: input.overtimeMultiplier,
    salary_rule: input.salaryRule,
    salary_days_per_week: input.salaryDaysPerWeek,
    fica_pct: input.ficaPct,
    futa_pct: input.futaPct,
    state_pct: input.statePct,
    workers_comp_pct: input.workersCompPct,
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return fail(missing(error));

  revalidateAll();
  return { ok: true };
}
