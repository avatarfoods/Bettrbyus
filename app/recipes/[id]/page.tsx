import { notFound } from "next/navigation";
import { PageShell } from "@/components/app-shell/page-shell";
import { RecordPager } from "@/components/app-shell/record-pager";
import { RecipeDetail } from "@/components/recipes/recipe-detail";
import {
  buildBomRows,
  explodeRawMaterials,
  fetchRecipeCatalog,
  whereUsed,
} from "@/lib/recipes/catalog";
import {
  fetchOdooFinishedOptions,
  fetchSpecForRecipe,
} from "@/lib/finished-products/fetch";
import { fetchInstructions } from "@/lib/recipes/instructions";
import { fetchRecipeChanges } from "@/lib/recipes/change-log";
import { resolveWindows } from "@/lib/production/schedule/model";
import type {
  MaterialOption,
  MaterialWindowKind,
  TimingRow,
} from "@/components/recipes/timing-window-tab";
import type { PickerOption } from "@/components/recipes/ingredients-editor";
import type { DepartmentOption } from "@/components/recipes/department-select";
import { fetchProductionConfig } from "@/lib/production/config";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { isMissingTable } from "@/lib/supabase/missing";
import { createClient } from "@/lib/supabase/server";
import { fetchAppSettings } from "@/lib/settings/wallpaper";

type Params = {
  params: Promise<{ id: string }>;
  /** `back` is set when you arrive from the plan - see the breadcrumb below. */
  searchParams?: Promise<{ back?: string; tree?: string }>;
};

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const catalog = await fetchRecipeCatalog(supabase);
  return { title: catalog.byId.get(id)?.name ?? "Recipe" };
}

export default async function RecipePage({ params, searchParams }: Params) {
  const { id } = await params;
  const query = await searchParams;
  const back = query?.back;
  const treeRootId = query?.tree;
  const supabase = await createClient();
  const catalog = await fetchRecipeCatalog(supabase);

  const recipe = catalog.byId.get(id);
  if (!recipe) notFound();

  const [profile, appSettings] = await Promise.all([
    getCurrentUserProfile(supabase),
    fetchAppSettings(supabase),
  ]);
  const canEdit = isAdminProfile(profile);

  const instructions = await fetchInstructions(supabase, id);

  // The change log is an admin's tab, so non-admins never pay for the query.
  const changes = canEdit ? await fetchRecipeChanges(supabase, id) : [];

  // Departments come from Production settings where they are configured, and
  // fall back to whatever the recipes themselves already use.
  const config = await fetchProductionConfig(supabase);

  const lineByDepartment = new Map(
    config.departments
      .filter((entry) => entry.active)
      .map((entry) => [entry.name.trim().toUpperCase(), entry.lineName])
  );

  // Configured departments first, then anything the recipes themselves use
  // that settings has not caught up with - so nothing is unreachable.
  const productionDepartments: DepartmentOption[] = [
    ...new Set([
      ...config.departments.filter((entry) => entry.active).map((e) => e.name),
      ...catalog.departments,
    ]),
  ]
    .sort()
    .map((name) => ({
      name,
      lineName: lineByDepartment.get(name.trim().toUpperCase()) ?? null,
    }));

  // Everything that can go on a line: every material, plus every other recipe
  // (a recipe containing itself is rejected by the action, and excluding it
  // here means it never appears as a choice in the first place).
  // "*" rather than a column list: purchasing_materials has no uom column,
  // and naming one that does not exist fails the whole query - which is what
  // was silently leaving the ingredient picker with subrecipes only.
  const { data: materialRows } = await supabase
    .from("purchasing_materials")
    .select("*")
    .eq("active", true)
    .order("item_code");

  const pickerOptions: PickerOption[] = [
    ...catalog.recipes
      .filter((entry) => entry.id !== id)
      // An archived recipe cannot be added to anything new. Existing uses
      // stay - archiving is not a demolition - but the list stops regrowing.
      .filter((entry) => entry.archivedAt === null)
      .map((entry) => ({
        id: entry.id,
        code: entry.wipCode,
        name: entry.name,
        kind: "subrecipe" as const,
        uom: entry.uom,
      })),
    ...((materialRows ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      code: (row.item_code as string) ?? "",
      name: (row.name as string) ?? "",
      kind: "material" as const,
      // Raw materials are kept in pounds by Carlos's rule; packaging is each.
      uom: /packaging/i.test(String(row.odoo_category ?? "")) ? "EA" : "LB",
    })),
  ];

  // The timing tab is the finished product's own timeline, so it lists the
  // whole tree beneath it in build order with each step's window.
  const bomRows = buildBomRows(catalog, id);

  let timing: TimingRow[] = [];
  let timingMissingTable = false;
  const timingMaterials: MaterialOption[] = [];
  let materialWindowsMissingTable = false;

  if (recipe.isFinished) {
    const subIds = [
      id,
      ...bomRows.filter((row) => row.subRecipeId).map((row) => row.subRecipeId!),
    ];

    const { data: windowRows, error: windowError } = await supabase
      .from("recipe_timing_windows")
      .select("recipe_id, earliest_offset, latest_offset")
      .in("recipe_id", subIds);

    timingMissingTable = isMissingTable(windowError);

    // A step's thaw bar is the longest thaw among the raw materials it uses:
    // the chicken has to be out of the freezer before the step can start.
    const thawByRecipe = new Map<string, number>();
    for (const entry of catalog.recipes) {
      let longest = 0;
      for (const line of entry.lines) {
        if (!line.materialId) continue;
        const material = materialRows?.find((m) => m.id === line.materialId);
        const days = Number(
          (material as Record<string, unknown> | undefined)?.thaw_buffer_days ?? 0
        );
        if (Number.isFinite(days) && days > longest) longest = days;
      }
      if (longest > 0) thawByRecipe.set(entry.id, longest);
    }

    const byRecipe = new Map(
      (windowRows ?? []).map((row) => [
        row.recipe_id as string,
        {
          earliest: (row.earliest_offset as number | null) ?? null,
          latest: (row.latest_offset as number | null) ?? null,
        },
      ])
    );

    // Where each window actually falls once the tree is walked: a window is
    // written against the step above it, so the positions accumulate.
    const resolved = resolveWindows({
      rootId: id,
      linesByRecipeId: new Map(
        catalog.recipes.map((entry) => [
          entry.id,
          entry.lines.map((line) => ({
            recipeId: entry.id,
            ingredientName: line.ingredientName,
            quantity: line.quantity,
            uom: line.uom,
            lossPct: line.lossPct,
            subRecipeId: line.subRecipeId,
            materialId: line.materialId,
          })),
        ])
      ),
      windows: new Map(
        [...byRecipe.entries()].map(([key, value]) => [
          key,
          { earliestOffset: value.earliest, latestOffset: value.latest },
        ])
      ),
    });

    const seen = new Set<string>();
    // Every raw material the tree reaches, with any window it already has.
    // Offered in the picker; only the ones with a window get drawn.
    const { data: materialWindowRows, error: materialWindowError } =
      await supabase
        .from("material_timing_windows")
        .select("material_id, earliest_offset, latest_offset, kind");

    materialWindowsMissingTable = isMissingTable(materialWindowError);

    const materialWindows = new Map(
      (materialWindowRows ?? []).map((row) => [
        row.material_id as string,
        {
          earliest: (row.earliest_offset as number | null) ?? null,
          latest: (row.latest_offset as number | null) ?? null,
          kind: (row.kind as MaterialWindowKind | null) ?? "thaw",
        },
      ])
    );

    const seenMaterial = new Set<string>();
    for (const entry of [recipe, ...bomRows
      .filter((row) => row.subRecipeId)
      .map((row) => catalog.byId.get(row.subRecipeId!))
      .filter(Boolean) as typeof recipe[]]) {
      for (const line of entry.lines) {
        if (!line.materialId || seenMaterial.has(line.materialId)) continue;
        seenMaterial.add(line.materialId);
        const window = materialWindows.get(line.materialId);
        timingMaterials.push({
          materialId: line.materialId,
          itemCode: line.materialCode ?? "",
          name: line.materialName ?? line.ingredientName,
          usedInRecipeId: entry.id,
          usedInName: entry.name,
          depth: 0,
          earliestOffset: window?.earliest ?? null,
          latestOffset: window?.latest ?? null,
          absoluteEarliest:
            window?.earliest === null || window?.earliest === undefined
              ? null
              : (resolved.get(entry.id)?.earliest ?? 0) + window.earliest,
          absoluteLatest:
            window?.latest === null || window?.latest === undefined
              ? null
              : (resolved.get(entry.id)?.earliest ?? 0) + window.latest,
          windowKind: window?.kind ?? "thaw",
        });
      }
    }

    timing = [
      {
        recipeId: recipe.id,
        wipCode: recipe.wipCode,
        name: recipe.name,
        department: recipe.department,
        uom: recipe.uom,
        depth: 0,
        earliestOffset: byRecipe.get(recipe.id)?.earliest ?? null,
        latestOffset: byRecipe.get(recipe.id)?.latest ?? null,
        absoluteEarliest: resolved.get(recipe.id)?.earliest ?? null,
        absoluteLatest: resolved.get(recipe.id)?.latest ?? null,
        thawDays: thawByRecipe.get(recipe.id) ?? null,
      },
      ...bomRows
        .filter((row) => {
          if (!row.subRecipeId || seen.has(row.subRecipeId)) return false;
          seen.add(row.subRecipeId);
          return true;
        })
        .map((row) => {
          const sub = catalog.byId.get(row.subRecipeId!);
          return {
            recipeId: row.subRecipeId!,
            wipCode: row.code ?? "",
            name: row.name,
            department: sub?.department ?? null,
            uom: row.uom,
            depth: row.depth + 1,
            earliestOffset: byRecipe.get(row.subRecipeId!)?.earliest ?? null,
            latestOffset: byRecipe.get(row.subRecipeId!)?.latest ?? null,
            absoluteEarliest: resolved.get(row.subRecipeId!)?.earliest ?? null,
            absoluteLatest: resolved.get(row.subRecipeId!)?.latest ?? null,
            thawDays: thawByRecipe.get(row.subRecipeId!) ?? null,
          };
        }),
    ];
  }

  // Only a finished product shows the specification tab, so only then is
  // there any reason to ask Odoo for the product list.
  const spec = recipe.isFinished
    ? await fetchSpecForRecipe(supabase, id)
    : { spec: null, missingTable: false };
  const specOptions = recipe.isFinished
    ? await fetchOdooFinishedOptions(config)
    : { options: [], error: null };

  // catalog.recipes is already sorted by name, which is the order the list
  // shows - so paging here walks the list the user was just looking at.
  /*
    The pager walks the list you came from.

    Opened from a tree, previous and next move through that tree in build
    order - the bowl, what it is assembled from, down to the cuts - and stay
    inside it, rather than through all 199 recipes alphabetically.
  */
  const treeRoot = treeRootId ? catalog.byId.get(treeRootId) : undefined;
  const walkOrder: typeof catalog.recipes = [];
  if (treeRoot) {
    const seen = new Set<string>();
    const walk = (entry: typeof treeRoot, depth: number, trail: Set<string>) => {
      if (depth > 12 || trail.has(entry.id)) return;
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        walkOrder.push(entry);
      }
      trail.add(entry.id);
      for (const line of entry.lines) {
        const child = line.subRecipeId ? catalog.byId.get(line.subRecipeId) : undefined;
        if (child) walk(child, depth + 1, trail);
      }
      trail.delete(entry.id);
    };
    walk(treeRoot, 0, new Set());
  }
  const order = treeRoot && walkOrder.some((entry) => entry.id === id) ? walkOrder : catalog.recipes;
  const carry = treeRoot ? `?tree=${treeRoot.id}` : "";
  const index = order.findIndex((entry) => entry.id === id);
  const previous = index > 0 ? order[index - 1] : null;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : null;

  const usedIn = whereUsed(catalog, id).map(({ recipe: parent, line }) => ({
    id: parent.id,
    wipCode: parent.wipCode,
    name: parent.name,
    qty: line.quantity,
    uom: line.uom,
  }));

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        // Opening a recipe from the plan is a detour, not a change of place.
        // The crumb names where you actually came from and carries the range
        // and filters back with it, so one click returns you to your spot.
        back?.startsWith("/production/schedule")
          ? { label: "Planning", href: back }
          : { label: "Recipes", href: "/recipes" },
        { label: recipe.name },
      ]}
      contentClassName="pb-10"
      meta={
        <span className="flex items-center gap-2">
          {/* Just information, up by the arrows where the other page-level
              facts live rather than inside the recipe's own content. */}
          <span
            className={recipe.archivedAt
              ? "rounded-sm bg-destructive/15 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-destructive uppercase"
              : "rounded-sm bg-success/15 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-success uppercase"}
          >
            {recipe.archivedAt ? "Archived" : "Active"}
          </span>
          <RecordPager
            index={index}
            total={order.length}
            prevHref={previous ? `/recipes/${previous.id}${carry}` : null}
            nextHref={next ? `/recipes/${next.id}${carry}` : null}
            label={treeRoot ? `in ${treeRoot.name}` : "recipe"}
          />
        </span>
      }
    >
      <RecipeDetail
        data={{
          departmentColor:
            config.departments.find(
              (entry) => entry.name === recipe.department
            )?.color ?? null,
          departmentIndex: config.departments.findIndex(
            (entry) => entry.name === recipe.department
          ),
          recipe,
          raws: explodeRawMaterials(catalog, id),
          bom: bomRows,
          usedIn,
          spec: spec.spec,
          specMissingTable: spec.missingTable,
          caseUnits: appSettings.caseUnits,
          specOptions: specOptions.options,
          specOdooError: specOptions.error,
          canEdit,
          changes,
          steps: instructions.steps,
          stepsMissingTable: instructions.missingTable,
          timing,
          timingMissingTable,
          timingMaterials,
          materialWindowsMissingTable,
          pickerOptions,
          departments: productionDepartments,
          lines: config.lines
            .filter((entry) => entry.active)
            .map((entry) => entry.name),
        }}
      />
    </PageShell>
  );
}
