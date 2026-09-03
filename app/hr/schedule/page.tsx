import { PageShell } from "@/components/app-shell/page-shell";
import { ScheduleGrid } from "@/components/hr/schedule-grid";
import { EditWeekButton, WeekControls, type Span } from "@/components/hr/week-controls";
import { HrSetupBanner } from "@/components/hr/setup-banner";
import { fetchHrData, fetchWeeks } from "@/lib/hr/fetch";
import { canApproveFloat, canSign, resolveAccess, visibleDepartments } from "@/lib/hr/access";
import {
  addDays,
  approvalState,
  dateRange,
  displayName,
  isSchedulable,
  sortPeople,
  weekDates,
  weekStartOf,
  weekStartsIn,
} from "@/lib/hr/model";
import type { SendOption } from "@/components/hr/send-dialog";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One department: a day, a week, or a range of days.
 *
 * The same shape as the production plan on purpose: Edit top-left, and
 * everything about WHICH schedule - the department, the span, approved or a
 * draft - together on the right. Someone who plans production should feel
 * at home scheduling people, and the other way round.
 */
export default async function HrSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    dept?: string;
    /** day, week (default) or range. */
    span?: string;
    /** The day, the week's anchor, or the range start. */
    from?: string;
    to?: string;
    /** Older links. */
    week?: string;
    /** A schedule id to look at; else the approved one, else the newest draft. */
    view?: string;
    /** "1" while the week is open for typing. */
    edit?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [data, profile] = await Promise.all([fetchHrData(supabase), getCurrentUserProfile(supabase)]);
  const access = resolveAccess(profile, data);

  const departments = visibleDepartments(access, data.departments.filter((d) => d.active));
  const department = departments.find((d) => d.id === params.dept) ?? departments[0] ?? null;
  const departmentIndex = department?.colorIndex ?? 0;

  // The span and its dates.
  const span: Span = params.span === "day" ? "day" : params.span === "range" ? "range" : "week";
  const anchor = params.from && ISO.test(params.from) ? params.from : params.week && ISO.test(params.week) ? params.week : today;
  const from = span === "week" ? weekStartOf(anchor) : anchor;
  const to =
    span === "day"
      ? from
      : span === "week"
        ? addDays(from, 6)
        : params.to && ISO.test(params.to) && params.to >= from
          ? params.to
          : addDays(from, 13);
  const dates = span === "week" ? weekDates(from) : dateRange(from, to, 31);
  const weekStarts = weekStartsIn(dates[0], dates[dates.length - 1]);

  const editing = params.edit === "1" && !!profile;

  const schedulable = data.employees.filter(isSchedulable);
  const people = sortPeople(schedulable.filter((e) => e.departmentId === department?.id));

  const range = department
    ? await fetchWeeks(supabase, department.id, weekStarts, {
        viewingId: params.view ?? null,
        editingBy: editing ? profile!.id : null,
        homeEmployeeIds: people.map((e) => e.id),
      })
    : { weeks: [], shifts: [], away: [], statusForWeek: [] };

  // The single week on screen, when there is exactly one.
  const single = range.weeks.length === 1 ? range.weeks[0] : null;
  const viewing = single?.viewing ?? null;

  // Where every department stands for the first week on screen, for the
  // department list and the send dialog.
  const standing = new Map(range.statusForWeek.map((entry) => [entry.departmentId, entry]));
  const statusOf: Record<string, "approved" | "draft" | "none"> = {};
  for (const d of departments) statusOf[d.id] = standing.get(d.id)?.status ?? "none";

  // Every department this person can see, with who would and would not
  // receive its week. Only approved ones can actually be sent.
  const sendOptions: SendOption[] = single
    ? departments.map((dept) => {
        const entry = standing.get(dept.id);
        const members = schedulable.filter((e) => e.departmentId === dept.id);
        return {
          departmentId: dept.id,
          name: dept.name,
          line: dept.line,
          colorKey: dept.color,
          colorIndex: dept.colorIndex,
          status: entry?.status ?? "none",
          scheduleId: entry?.status === "approved" ? entry.scheduleId : null,
          recipients: members.filter((e) => e.personalEmail || e.email).length,
          missing: members.filter((e) => !e.personalEmail && !e.email).map(displayName),
        };
      })
    : [];

  // People from elsewhere with a shift in what is on screen.
  const homeIds = new Set(people.map((p) => p.id));
  const floaterIds = new Set(range.shifts.filter((s) => !homeIds.has(s.employeeId)).map((s) => s.employeeId));
  const floaters = schedulable.filter((e) => floaterIds.has(e.id));

  const { data: lastWeekRow } =
    department && single
      ? await supabase
          .from("hr_schedules")
          .select("id, updated_at")
          .eq("department_id", department.id)
          .eq("week_start", addDays(single.weekStart, -7))
          .eq("status", "approved")
          .maybeSingle()
      : { data: null };

  const chain = department
    ? data.approvalSteps.filter((s) => s.departmentId === department.id).sort((a, b) => a.step - b.step)
    : [];
  const nameOf = (id: string) => {
    const e = data.employees.find((x) => x.id === id);
    return e ? displayName(e) : "Unknown";
  };

  const draftOnScreen =
    viewing?.status === "draft" ? viewing : (single?.schedules.find((s) => s.status === "draft") ?? null);
  const nextStep = draftOnScreen ? approvalState(chain, draftOnScreen.approvals).nextStep : (chain[0] ?? null);
  const canSignNext = chain.length === 0 ? access.isAdmin : canSign(access, nextStep);

  return (
    <PageShell
      breadcrumbs={[{ label: "HR" }, { label: department ? `Schedule · ${department.name}` : "Schedule" }]}
      actions={
        department &&
        !data.missingTable &&
        !access.blocked && (
          <EditWeekButton
            editing={editing}
            departmentId={department.id}
            // Approved weeks on screen with no draft of mine yet: Edit asks
            // first, then copies each into a draft to change.
            approvedToCopy={range.weeks.flatMap((week) => {
              const approved = week.schedules.find((s) => s.status === "approved");
              const mine = week.schedules.some((s) => s.status === "draft" && s.createdBy === profile?.id);
              return approved && !mine ? [{ weekStart: week.weekStart, scheduleId: approved.id }] : [];
            })}
          />
        )
      }
      meta={
        department && (
          <WeekControls
            departments={departments}
            departmentId={department.id}
            span={span}
            from={from}
            to={to}
            today={today}
            week={single}
            lastWeekApproved={
              lastWeekRow && single
                ? {
                    id: lastWeekRow.id as string,
                    departmentId: department.id,
                    weekStart: addDays(single.weekStart, -7),
                    status: "approved",
                    name: null,
                    createdBy: null,
                    createdByName: null,
                    approvedBy: null,
                    approvedByName: null,
                    approvedAt: null,
                    sentAt: null,
                    updatedAt: (lastWeekRow.updated_at as string) ?? "",
                    approvals: [],
                  }
                : null
            }
            chain={chain}
            chainNames={chain.map((s) => [s.employeeId, nameOf(s.employeeId)])}
            canSignNext={canSignNext}
            isAdmin={access.isAdmin}
            sendOptions={sendOptions}
            statusOf={statusOf}
          />
        )
      }
    >
      <div className="flex flex-col gap-2 px-3 py-3 sm:px-4">
        <HrSetupBanner
          missingTable={data.missingTable}
          missingRules={data.missingRules}
          missingAbsences={data.missingAbsences}
          noDepartments={!data.missingTable && data.departments.filter((d) => d.active).length === 0}
        />

        {access.blocked ? (
          <p className="rounded-sm bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
            HR is not open to your login. Ask an administrator to change your HR access.
          </p>
        ) : (
          !department &&
          departments.length === 0 &&
          !data.missingTable &&
          data.departments.length > 0 && (
            <p className="rounded-sm bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
              You are not in a group that can see any department. Ask an administrator to add you in HR,
              Configuration, Groups.
            </p>
          )
        )}

        {editing && single && !viewing && department && (
          <p className="rounded-sm bg-warning-muted px-3 py-1.5 text-xs text-warning-foreground">
            Your draft for this week is empty. Tap a day to start it, or open the Drafts menu and copy last
            week in.
          </p>
        )}

        {!editing && viewing?.status === "approved" && (
          <p className="text-[0.6875rem] text-muted-foreground">
            Approved
            {viewing.approvals.length > 0
              ? ` by ${viewing.approvals.map((a) => a.approvedByName ?? "?").join(", ")}`
              : viewing.approvedByName && ` by ${viewing.approvedByName}`}
            {viewing.approvedAt &&
              ` on ${new Date(viewing.approvedAt).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })}`}
            . Locked. Press Edit the week to propose changes in a draft.
          </p>
        )}

        {department && !access.blocked && (
          <ScheduleGrid
            departmentId={department.id}
            departmentName={department.name}
            departmentColorKey={department.color}
            departmentIndex={departmentIndex}
            dates={dates}
            weeks={range.weeks}
            employees={people}
            floaters={floaters}
            departments={data.departments}
            shifts={range.shifts}
            away={range.away}
            settings={data.settings}
            breakHours={department.breakHours}
            absenceTypes={data.absenceTypes}
            editing={editing && !data.missingTable}
            seesCost={access.seesCost}
            canApproveFloat={canApproveFloat(access, chain)}
            canArrange={access.isAdmin}
          />
        )}
      </div>
    </PageShell>
  );
}
