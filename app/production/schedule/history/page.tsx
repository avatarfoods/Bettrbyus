import { redirect } from "next/navigation";
import { PageShell } from "@/components/app-shell/page-shell";
import { ScheduleChangesLog } from "@/components/production/schedule/schedule-changes-log";
import { fetchScheduleChanges } from "@/lib/production/schedule/change-log";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Plan history",
};

/** Who put what into the live plan. Admin-only. */
export default async function ScheduleHistoryRoute() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  if (!isAdminProfile(profile)) redirect("/production/schedule?view=live");

  const changes = await fetchScheduleChanges(supabase);

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Schedule", href: "/production/schedule?view=live" },
        { label: "Plan history" },
      ]}
    >
      <ScheduleChangesLog changes={changes} />
    </PageShell>
  );
}
