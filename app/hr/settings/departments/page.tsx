import { PageShell } from "@/components/app-shell/page-shell";
import { HrDepartmentsSettings } from "@/components/hr/departments-settings";
import { HrSetupBanner } from "@/components/hr/setup-banner";
import { fetchHrData } from "@/lib/hr/fetch";
import { resolveAccess } from "@/lib/hr/access";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Departments" };
export const dynamic = "force-dynamic";

export default async function HrDepartmentsPage() {
  const supabase = await createClient();
  const [data, profile] = await Promise.all([fetchHrData(supabase), getCurrentUserProfile(supabase)]);
  const access = resolveAccess(profile, data);

  return (
    <PageShell
      breadcrumbs={[{ label: "HR" }, { label: "Settings" }, { label: "Departments" }]}
      meta={<span>{data.departments.length} departments</span>}
    >
      <div className="px-3 pt-3 sm:px-4">
        <HrSetupBanner missingTable={data.missingTable} missingRules={data.missingRules} noDepartments={false} />
      </div>
      <HrDepartmentsSettings
        departments={data.departments}
        employees={data.employees}
        canEdit={access.isAdmin && !data.missingTable}
      />
    </PageShell>
  );
}
