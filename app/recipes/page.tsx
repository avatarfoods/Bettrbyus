import { PageShell } from "@/components/app-shell/page-shell";
import { RecipeList } from "@/components/recipes/recipe-list";
import { RecipeGear } from "@/components/recipes/recipe-gear";
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
  searchParams: Promise<{
    /** Old links: ?kind=finished meant the finished-products view. */
    kind?: string;
    /** Which line's recipes. Absent means every line. */
    line?: string;
    /** "__finished__", or a department name. Absent means every department. */
    dept?: string;
    /** A finished product's id: show its whole family tree. */
    tree?: string;
  }>;
}) {
  const params = await searchParams;
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

  /*
    Line and area, read from the URL the way Planning reads them.

    Both are checked against what exists: a bookmark carrying a line that was
    deactivated or a department that moved lines falls back to "all" instead
    of an empty page with a blank dropdown.
  */
  const lines = productionConfig.lines
    .filter((entry) => entry.active)
    .map((entry) => entry.name);
  const line = params.line && lines.includes(params.line) ? params.line : null;

  const configured = productionConfig.departments.filter((entry) => entry.active);
  const lineByDepartment = new Map(
    configured.map((entry) => [entry.name.trim().toUpperCase(), entry.lineName])
  );
  // Configured departments first, then anything the recipes use that
  // settings has not caught up with - so nothing is unreachable.
  const departments = [
    ...new Set([...configured.map((entry) => entry.name), ...catalog.departments]),
  ]
    .sort()
    .map((name) => ({
      name,
      lineName: lineByDepartment.get(name.trim().toUpperCase()) ?? null,
    }));

  const requestedDept =
    params.dept ?? (params.kind === "finished" ? "__finished__" : undefined);
  const dept =
    requestedDept === "__finished__" ||
    (requestedDept !== undefined &&
      departments.some(
        (entry) =>
          entry.name === requestedDept && (!line || entry.lineName === line)
      ))
      ? requestedDept
      : null;

  const finished = catalog.recipes
    .filter((recipe) => recipe.isFinished && recipe.archivedAt === null)
    .filter((recipe) => !line || departmentLineMap(productionConfig).get(recipe.department ?? "") === line)
    .map((recipe) => ({ id: recipe.id, wipCode: recipe.wipCode, name: recipe.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const tree = params.tree && catalog.byId.has(params.tree) ? params.tree : null;

  const needsReview = catalog.recipes.filter(
    (recipe) => recipe.issues.length > 0
  ).length;

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Recipes" }]}
      meta={
        <span className="flex items-center gap-2">
          <RecipeGear current="recipes" isAdmin={isAdminProfile(profile)} />
          <span className="hidden text-muted-foreground sm:inline">
            {catalog.recipes.length} recipes
            {needsReview > 0 && ` · ${needsReview} need review`}
          </span>
        </span>
      }
    >
      <RecipeList
        recipes={catalog.recipes}
        departmentLines={Object.fromEntries(
          departmentLineMap(productionConfig)
        )}
        departmentColors={configured.map((entry) => [entry.name, entry.color])}
        lines={lines}
        departments={departments}
        finished={finished}
        scopeLine={line}
        scopeDept={tree ? null : dept}
        treeRootId={tree}
        canCreate={isAdminProfile(profile)}
        odooOptions={odooOptions}
        odooError={odoo.error}
      />
    </PageShell>
  );
}
