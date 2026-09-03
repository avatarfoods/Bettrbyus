import { notFound } from "next/navigation";
import { PageShell } from "@/components/app-shell/page-shell";
import { RecordPager } from "@/components/app-shell/record-pager";
import { PersonForm } from "@/components/hr/person-form";
import { fetchHrData } from "@/lib/hr/fetch";
import { canSee, resolveAccess } from "@/lib/hr/access";
import { displayName } from "@/lib/hr/model";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * One person's page, with the pager to step to the next, like a recipe.
 */
export default async function HrPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [data, profile] = await Promise.all([fetchHrData(supabase), getCurrentUserProfile(supabase)]);
  const access = resolveAccess(profile, data);

  const employee = data.employees.find((e) => e.id === id);
  if (!employee) notFound();
  if (access.blocked || (!access.seesAll && !(employee.departmentId && canSee(access, employee.departmentId)))) {
    return (
      <PageShell breadcrumbs={[{ label: "HR" }, { label: "People", href: "/hr/people" }, { label: "Person" }]}>
        <p className="m-3 rounded-sm bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          This person is not in a department you can see.
        </p>
      </PageShell>
    );
  }

  // The list this page was opened from, in the list's order, for the pager.
  const list = data.employees
    .filter((e) => access.seesAll || (e.departmentId && access.departmentIds.has(e.departmentId)))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const index = list.findIndex((e) => e.id === employee.id);

  return (
    <PageShell
      breadcrumbs={[{ label: "HR" }, { label: "People", href: "/hr/people" }, { label: displayName(employee) }]}
      meta={
        <RecordPager
          index={Math.max(0, index)}
          total={list.length}
          prevHref={index > 0 ? `/hr/people/${list[index - 1].id}` : null}
          nextHref={index >= 0 && index < list.length - 1 ? `/hr/people/${list[index + 1].id}` : null}
          label="person"
        />
      }
    >
      <PersonForm
        key={employee.id}
        employee={employee}
        departments={data.departments.filter((d) => d.active || d.id === employee.departmentId)}
        canEdit={access.isAdmin && !data.missingTable}
        seesCost={access.seesCost}
      />
    </PageShell>
  );
}
