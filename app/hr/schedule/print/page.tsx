import { SchedulePrintSheet, type PrintDepartment } from "@/components/hr/print-sheet";
import { fetchApprovedWeeks, fetchHrData } from "@/lib/hr/fetch";
import { resolveAccess, visibleDepartments } from "@/lib/hr/access";
import { isSchedulable, weekStartOf } from "@/lib/hr/model";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print schedule" };
export const dynamic = "force-dynamic";

/**
 * The approved week on paper, one department per page.
 *
 * Approved only. A draft never reaches the wall, because a wall schedule is a
 * promise and a draft is not one yet.
 */
export default async function HrPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; week?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartOf(params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today);

  const [data, approved, profile] = await Promise.all([
    fetchHrData(supabase),
    fetchApprovedWeeks(supabase, [weekStart]),
    getCurrentUserProfile(supabase),
  ]);
  const access = resolveAccess(profile, data);

  const active = visibleDepartments(access, data.departments.filter((d) => d.active));
  const selected = params.dept && active.some((d) => d.id === params.dept) ? params.dept : "all";
  const chosen = selected === "all" ? active : active.filter((d) => d.id === selected);
  const schedulable = data.employees.filter(isSchedulable);

  const departments: PrintDepartment[] = chosen.map((department) => {
    const schedule = approved.schedules.find((s) => s.departmentId === department.id) ?? null;
    const shifts = schedule ? approved.shifts.filter((s) => s.scheduleId === schedule.id) : [];
    const borrowed = new Set(shifts.map((s) => s.employeeId));
    return {
      department,
      schedule,
      employees: schedulable.filter((e) => e.departmentId === department.id || borrowed.has(e.id)),
      shifts,
    };
  });

  return (
    <SchedulePrintSheet
      weekStart={weekStart}
      departments={departments}
      allDepartments={active}
      absenceTypes={data.absenceTypes}
      selected={selected}
    />
  );
}
