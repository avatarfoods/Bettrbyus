import { PageShell } from "@/components/app-shell/page-shell";
import { HrDashboard } from "@/components/hr/dashboard";
import { HrSetupBanner } from "@/components/hr/setup-banner";
import { fetchApprovedWeeks, fetchHrData } from "@/lib/hr/fetch";
import { resolveAccess, visibleDepartments } from "@/lib/hr/access";
import { addDays, isSchedulable, weekStartOf, weekStartsIn } from "@/lib/hr/model";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "HR" };
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function HrDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ span?: string; from?: string; to?: string; day?: string; week?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // A week by default; any range on request; one day on top of either.
  const span: "week" | "range" = params.span === "range" ? "range" : "week";
  const anchor = params.week && ISO.test(params.week) ? weekStartOf(params.week) : weekStartOf(today);
  const rawFrom = params.from && ISO.test(params.from) ? params.from : anchor;
  const from = span === "week" ? weekStartOf(rawFrom) : rawFrom;
  const to =
    span === "week"
      ? addDays(from, 6)
      : params.to && ISO.test(params.to) && params.to >= from
        ? params.to
        : addDays(from, 13);
  const day = params.day && ISO.test(params.day) ? params.day : null;

  const [data, approved, profile] = await Promise.all([
    fetchHrData(supabase),
    fetchApprovedWeeks(supabase, weekStartsIn(from, to)),
    getCurrentUserProfile(supabase),
  ]);
  const access = resolveAccess(profile, data);
  const departments = visibleDepartments(access, data.departments.filter((d) => d.active));

  return (
    <PageShell trailRoot breadcrumbs={[{ label: "HR" }]}>
      <div className="flex min-h-full flex-col gap-2.5 bg-surface-sunk px-3 py-3 sm:px-4">
        <HrSetupBanner
          missingTable={data.missingTable}
          missingRules={data.missingRules}
          noDepartments={!data.missingTable && data.departments.filter((d) => d.active).length === 0}
        />
        {access.blocked ? (
          <p className="rounded-sm bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
            HR is not open to your login. Ask an administrator to change your HR access.
          </p>
        ) : (
          <>
            {departments.length === 0 && data.departments.length > 0 && (
              <p className="rounded-sm bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
                You are not in a group that can see any department. Ask an administrator to add you in
                HR, Configuration, Groups.
              </p>
            )}
            <HrDashboard
              span={span}
              from={from}
              to={to}
              day={day}
              today={today}
              departments={departments}
              allDepartments={data.departments}
              employees={data.employees.filter(isSchedulable)}
              schedules={approved.schedules.filter((s) => departments.some((d) => d.id === s.departmentId))}
              shifts={approved.shifts}
              settings={data.settings}
              seesCost={access.seesCost}
              approvalSteps={data.approvalSteps}
              canEditStaffing={access.isAdmin && !data.missingTable}
              absenceTypes={data.absenceTypes}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
