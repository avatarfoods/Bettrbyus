import { PageShell } from "@/components/app-shell/page-shell";
import { AbsenceSettings } from "@/components/hr/absence-settings";
import { HrSetupBanner } from "@/components/hr/setup-banner";
import { fetchHrData } from "@/lib/hr/fetch";
import { resolveAccess } from "@/lib/hr/access";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Day types" };
export const dynamic = "force-dynamic";

export default async function HrAbsencesPage() {
  const supabase = await createClient();
  const [data, profile] = await Promise.all([fetchHrData(supabase), getCurrentUserProfile(supabase)]);
  const access = resolveAccess(profile, data);

  return (
    <PageShell
      breadcrumbs={[{ label: "HR" }, { label: "Settings" }, { label: "Day types" }]}
      meta={<span>{data.absenceTypes.filter((t) => t.active).length} in use</span>}
    >
      <div className="px-3 pt-3 sm:px-4">
        <HrSetupBanner missingTable={data.missingTable} missingRules={data.missingRules} noDepartments={false} />
      </div>
      <AbsenceSettings types={data.absenceTypes} canEdit={access.isAdmin && !data.missingTable} />
    </PageShell>
  );
}
