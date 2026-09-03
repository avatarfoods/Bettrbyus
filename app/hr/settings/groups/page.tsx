import { PageShell } from "@/components/app-shell/page-shell";
import { GroupsSettings } from "@/components/hr/groups-settings";
import { HrSetupBanner } from "@/components/hr/setup-banner";
import { fetchHrData } from "@/lib/hr/fetch";
import { resolveAccess } from "@/lib/hr/access";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Groups" };
export const dynamic = "force-dynamic";

export default async function HrGroupsPage() {
  const supabase = await createClient();
  const [data, profile] = await Promise.all([fetchHrData(supabase), getCurrentUserProfile(supabase)]);
  const access = resolveAccess(profile, data);

  return (
    <PageShell
      breadcrumbs={[{ label: "HR" }, { label: "Configuration" }, { label: "Groups" }]}
      meta={<span>{data.groups.length} groups</span>}
    >
      <HrSetupBanner
        missingTable={data.missingTable}
        missingRules={data.missingRules}
        missingAbsences={data.missingAbsences}
        noDepartments={false}
        padded
      />
      <GroupsSettings
        groups={data.groups}
        departments={data.departments.filter((d) => d.active)}
        employees={data.employees}
        canEdit={access.isAdmin && !data.missingTable && !data.missingRules}
      />
    </PageShell>
  );
}
