import { PageShell } from "@/components/app-shell/page-shell";
import { GroupsSettings } from "@/components/hr/groups-settings";
import { HrSetupBanner } from "@/components/hr/setup-banner";
import { fetchHrData } from "@/lib/hr/fetch";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Groups" };
export const dynamic = "force-dynamic";

export default async function HrGroupsPage() {
  const supabase = await createClient();
  const [data, profile] = await Promise.all([fetchHrData(supabase), getCurrentUserProfile(supabase)]);

  return (
    <PageShell
      breadcrumbs={[{ label: "HR" }, { label: "Settings" }, { label: "Groups" }]}
      meta={<span>{data.groups.length} groups</span>}
    >
      <div className="px-3 pt-3 sm:px-4">
        <HrSetupBanner missingTable={data.missingTable} missingRules={data.missingRules} noDepartments={false} />
      </div>
      <GroupsSettings
        groups={data.groups}
        departments={data.departments.filter((d) => d.active)}
        employees={data.employees}
        canEdit={isAdminProfile(profile) && !data.missingTable && !data.missingRules}
      />
    </PageShell>
  );
}
