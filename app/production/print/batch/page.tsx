import { PrintFrame } from "@/components/production/print/print-frame";
import { RecipePrintSheet } from "@/components/recipes/recipe-print-sheet";
import { buildProductionDay } from "@/lib/production/print/build";
import { fetchRecipeCatalog } from "@/lib/recipes/catalog";
import { fetchInstructions } from "@/lib/recipes/instructions";
import { recipeFilter } from "@/lib/production/print/release";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Batch sheets" };
export const dynamic = "force-dynamic";

/**
 * One page per run. `dept` narrows to a department, `recipes` to the runs
 * ticked on the console; neither prints the whole day.
 */
export default async function BatchPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    id?: string;
    line?: string;
    dept?: string;
    recipes?: string;
  }>;
}) {
  const { date, id, line, dept, recipes } = await searchParams;
  const day = date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const [built, catalog] = await Promise.all([
    buildProductionDay(supabase, day, id),
    fetchRecipeCatalog(supabase),
  ]);
  const only = recipeFilter(recipes);

  const sheets = built.departments
    .filter((group) => !dept || group.department === dept)
    .flatMap((group) => group.sheets)
    .filter((sheet) => !only || only.has(sheet.recipeId));

  // The same batch record the recipe page prints, scaled to the day's
  // quantity - one layout for the floor, whichever door it came through.
  const records = await Promise.all(
    sheets.map(async (sheet) => ({
      sheet,
      recipe: catalog.byId.get(sheet.recipeId) ?? null,
      steps: (await fetchInstructions(supabase, sheet.recipeId)).steps,
    }))
  );

  const back = new URLSearchParams({ date: day });
  if (id) back.set("id", id);
  if (line) back.set("line", line);

  return (
    <PrintFrame
      backHref={`/production/print?${back}`}
      title="Batch sheets"
      subtitle={`${day} · ${dept ?? (only ? "ticked runs" : "every department")} · ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}`}
    >
      {records.map(({ sheet, recipe, steps }, index) =>
        recipe ? (
          <div key={sheet.recipeId} className={index === 0 ? "print-break-after" : "print-break-before print-break-after"}>
            <RecipePrintSheet
              recipe={recipe}
              steps={steps}
              scheduled={sheet.quantity}
              productionDate={built.date}
            />
          </div>
        ) : null
      )}
      {sheets.length === 0 && (
        <p className="text-sm">Nothing is scheduled on {day}.</p>
      )}
    </PrintFrame>
  );
}
