import { PageShell } from "@/components/app-shell/page-shell";
import { PlansSettings } from "@/components/production/settings/plans-settings";
import { fetchDrafts } from "@/lib/production/schedule/ensure";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

export default async function PlansSettingsPage() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  const { data: live } = await supabase
    .from("production_schedules")
    .select("id, name, period_start, period_end")
    .eq("status", "live")
    .maybeSingle();

  const liveId = (live?.id as string) ?? null;
  const drafts = liveId ? await fetchDrafts(supabase, liveId) : [];

  const { count } = liveId
    ? await supabase
        .from("production_schedule_entries")
        .select("id", { count: "exact", head: true })
        .eq("schedule_id", liveId)
    : { count: 0 };

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Configuration" },
        { label: "Plans" },
      ]}
    >
      <PlansSettings
        isAdmin={isAdminProfile(profile)}
        liveName={(live?.name as string) ?? null}
        liveEntries={count ?? 0}
        drafts={drafts}
        myProfileId={profile?.id ?? null}
      />
    </PageShell>
  );
}
