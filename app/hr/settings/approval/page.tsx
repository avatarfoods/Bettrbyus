import { PageShell } from "@/components/app-shell/page-shell";
import { ApprovalSettings } from "@/components/hr/approval-settings";
import { HrSetupBanner } from "@/components/hr/setup-banner";
import { fetchHrData } from "@/lib/hr/fetch";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Approval" };
export const dynamic = "force-dynamic";

export default async function HrApprovalPage() {
  const supabase = await createClient();
  const [data, profile] = await Promise.all([fetchHrData(supabase), getCurrentUserProfile(supabase)]);
  const withChain = new Set(data.approvalSteps.map((s) => s.departmentId)).size;
  const active = data.departments.filter((d) => d.active);

  return (
    <PageShell
      breadcrumbs={[{ label: "HR" }, { label: "Settings" }, { label: "Approval" }]}
      meta={<span>{withChain} of {active.length} departments have an approver</span>}
    >
      <div className="px-3 pt-3 sm:px-4">
        <HrSetupBanner missingTable={data.missingTable} missingRules={data.missingRules} noDepartments={false} />
      </div>
      <ApprovalSettings
        departments={active}
        employees={data.employees}
        steps={data.approvalSteps}
        canEdit={isAdminProfile(profile) && !data.missingTable && !data.missingRules}
      />
    </PageShell>
  );
}
