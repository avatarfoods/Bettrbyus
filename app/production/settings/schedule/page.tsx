import { PageShell } from "@/components/app-shell/page-shell";
import {
  ScheduleSettings,
  type WindowRow,
} from "@/components/production/settings/schedule-settings";
import { fetchScheduleData } from "@/lib/production/schedule/fetch";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Lead times" };
export const dynamic = "force-dynamic";

export default async function ScheduleSettingsPage() {
  const supabase = await createClient();
  const [data, profile] = await Promise.all([
    fetchScheduleData(supabase),
    getCurrentUserProfile(supabase),
  ]);

  const windows: WindowRow[] = data.recipes
    .filter((recipe) => !recipe.isFinished)
    .map((recipe) => {
      const window = data.windows.get(recipe.id);
      return {
        recipeId: recipe.id,
        wipCode: recipe.wipCode,
        name: recipe.name,
        department: recipe.department,
        uom: recipe.uom,
        earliestOffset: window?.earliestOffset ?? null,
        latestOffset: window?.latestOffset ?? null,
      };
    });

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Settings" },
        { label: "Lead times" },
      ]}
    >
      <ScheduleSettings windows={windows} isAdmin={isAdminProfile(profile)} />
    </PageShell>
  );
}
