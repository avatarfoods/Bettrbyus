import { PageShell } from "@/components/app-shell/page-shell";
import { RecipeList } from "@/components/recipes/recipe-list";
import { fetchRecipeCatalog } from "@/lib/recipes/catalog";
import {
  departmentLineMap,
  fetchProductionConfig,
} from "@/lib/production/config";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { fetchOdooFinishedOptions } from "@/lib/finished-products/fetch";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Recipes",
};

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const supabase = await createClient();
  const [catalog, productionConfig, profile] = await Promise.all([
    fetchRecipeCatalog(supabase),
    fetchProductionConfig(supabase),
    getCurrentUserProfile(supabase),
  ]);

  /*
    Finished goods from Odoo, so creating one is a choice rather than typing.
    Anything that already has a recipe is marked taken and left out of the
    list - two recipes for one product is the thing to prevent.
  */
  const taken = new Set(
    catalog.recipes
      .filter((entry) => entry.isFinished)
      .map((entry) => entry.wipCode)
  );
  const odoo = await fetchOdooFinishedOptions(productionConfig);
  const odooOptions = odoo.options.map((option) => ({
    ...option,
    taken: option.taken || taken.has(option.itemCode),
  }));

  const needsReview = catalog.recipes.filter(
    (recipe) => recipe.issues.length > 0
  ).length;

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Recipes" }]}
      meta={
        <span>
          {catalog.recipes.length} recipes
          {needsReview > 0 && ` · ${needsReview} need review`}
        </span>
      }
    >
      <RecipeList
        recipes={catalog.recipes}
        departments={catalog.departments}
        departmentLines={Object.fromEntries(
          departmentLineMap(productionConfig)
        )}
        initialFinishedOnly={kind === "finished"}
        canCreate={isAdminProfile(profile)}
        odooOptions={odooOptions}
        odooError={odoo.error}
      />
    </PageShell>
  );
}
