import { redirect } from "next/navigation";
import { PageShell } from "@/components/app-shell/page-shell";
import { GroupsSettings } from "@/components/production/settings/groups-settings";
import { RecipeGear } from "@/components/recipes/recipe-gear";
import { fetchGroups, fetchMaterialOptions } from "@/lib/groups/fetch-groups";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Recipe settings" };
export const dynamic = "force-dynamic";

/**
 * What the recipes are configured with - today, the product groups - kept
 * inside Recipes as its own tab rather than out in Configuration.
 */
export default async function RecipeSettingsPage() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  if (!isAdminProfile(profile)) redirect("/recipes");

  const [data, materials] = await Promise.all([
    fetchGroups(supabase),
    fetchMaterialOptions(supabase),
  ]);

  const incomplete = data.groups.reduce((n, g) => n + g.incompleteCount, 0);

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Recipes" }]}
      meta={
        <span className="flex items-center gap-2">
          <RecipeGear current="settings" isAdmin />
          <span className="hidden text-muted-foreground sm:inline">
            {data.groups.length} product groups
            {incomplete > 0 && ` · ${incomplete} missing pack size`}
          </span>
        </span>
      }
    >
      <GroupsSettings data={data} materials={materials} />
    </PageShell>
  );
}
