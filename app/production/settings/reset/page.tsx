import { PageShell } from "@/components/app-shell/page-shell";
import { ResetSettings } from "@/components/production/settings/reset-settings";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reset" };
export const dynamic = "force-dynamic";

export default async function ResetSettingsPage() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  const [live, drafts] = await Promise.all([
    supabase
      .from("production_schedules")
      .select("id")
      .eq("status", "live")
      .maybeSingle(),
    supabase
      .from("production_schedules")
      .select("id")
      .eq("status", "draft"),
  ]);

  const liveId = (live.data?.id as string) ?? null;

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
        { label: "Reset" },
      ]}
    >
      <ResetSettings
        isAdmin={isAdminProfile(profile)}
        plannedEntries={count ?? 0}
        draftCount={(drafts.data ?? []).length}
      />
    </PageShell>
  );
}
