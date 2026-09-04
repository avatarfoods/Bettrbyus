import { redirect } from "next/navigation";
import { PageShell } from "@/components/app-shell/page-shell";
import { RecipeChangesLog } from "@/components/recipes/recipe-changes-log";
import { fetchAllRecipeChanges } from "@/lib/recipes/change-log";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Recipe changes",
};

/** The whole plant's recipe edits in one list. Admin-only, like the tab. */
export default async function RecipeChangesRoute() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  if (!isAdminProfile(profile)) redirect("/recipes");

  const changes = await fetchAllRecipeChanges(supabase);

  return (
    <PageShell
      breadcrumbs={[
        { label: "Recipes", href: "/recipes" },
        { label: "Changes" },
      ]}
    >
      <RecipeChangesLog changes={changes} />
    </PageShell>
  );
}
