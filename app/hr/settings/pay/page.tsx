import { PageShell } from "@/components/app-shell/page-shell";
import { PaySettingsForm } from "@/components/hr/pay-settings";
import { HrSetupBanner } from "@/components/hr/setup-banner";
import { fetchHrData } from "@/lib/hr/fetch";
import { resolveAccess } from "@/lib/hr/access";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pay rules" };
export const dynamic = "force-dynamic";

export default async function HrPaySettingsPage() {
  const supabase = await createClient();
  const [data, profile] = await Promise.all([fetchHrData(supabase), getCurrentUserProfile(supabase)]);
  const access = resolveAccess(profile, data);

  return (
    <PageShell
      breadcrumbs={[{ label: "HR" }, { label: "Configuration" }, { label: "Pay rules" }]}
      meta={<span>Every cost in HR is worked out from these</span>}
    >
      <HrSetupBanner
        missingTable={data.missingTable}
        missingRules={data.missingRules}
        missingAbsences={data.missingAbsences}
        noDepartments={false}
        padded
      />
      <PaySettingsForm settings={data.settings} canEdit={access.isAdmin && !data.missingTable} />
    </PageShell>
  );
}
