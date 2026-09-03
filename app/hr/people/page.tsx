import { Suspense } from "react";
import { PageShell } from "@/components/app-shell/page-shell";
import { ImportButton } from "@/components/hr/import-dialog";
import { PeopleList } from "@/components/hr/people-list";
import { HrSetupBanner } from "@/components/hr/setup-banner";
import { fetchHrData } from "@/lib/hr/fetch";
import { resolveAccess, visibleDepartments } from "@/lib/hr/access";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function HrPeoplePage() {
  const supabase = await createClient();
  const [data, profile] = await Promise.all([fetchHrData(supabase), getCurrentUserProfile(supabase)]);
  const access = resolveAccess(profile, data);

  // Non-admins see the people of the departments they can see.
  const departments = visibleDepartments(access, data.departments.filter((d) => d.active));
  const employees = access.blocked
    ? []
    : access.seesAll
      ? data.employees
      : data.employees.filter((e) => e.departmentId && access.departmentIds.has(e.departmentId));

  const active = employees.filter((e) => e.active).length;

  return (
    <PageShell
      breadcrumbs={[{ label: "HR" }, { label: "People" }]}
      meta={
        // Import sits top-right, with the count, where the list's own tools live.
        <span className="flex items-center gap-3">
          <span>
            {active} active
            {employees.length !== active && ` · ${employees.length - active} inactive`}
          </span>
          {access.isAdmin && (
            <Suspense fallback={null}>
              <ImportButton
                canImport={!data.missingTable}
                existing={data.employees.map((e) => ({
                  paychexId: e.paychexId,
                  firstName: e.firstName,
                  lastName: e.lastName,
                  department: data.departments.find((d) => d.id === e.departmentId)?.name ?? null,
                  payType: e.payType,
                  payRate: e.payRate,
                  email: e.email,
                  personalEmail: e.personalEmail,
                  phone: e.phone,
                  active: e.active,
                }))}
              />
            </Suspense>
          )}
        </span>
      }
    >
      <div className="px-3 pt-3 sm:px-4">
        <HrSetupBanner missingTable={data.missingTable} missingRules={data.missingRules} noDepartments={false} />
        {access.blocked && (
          <p className="rounded-sm bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
            HR is not open to your login. Ask an administrator to change your HR access.
          </p>
        )}
      </div>
      <PeopleList
        employees={employees}
        departments={access.seesAll ? data.departments.filter((d) => d.active) : departments}
        canEdit={access.isAdmin && !data.missingTable}
      />
    </PageShell>
  );
}
