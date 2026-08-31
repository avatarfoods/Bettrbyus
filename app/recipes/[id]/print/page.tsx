import { notFound } from "next/navigation";
import { PrintFrame } from "@/components/production/print/print-frame";
import { RecipePrintSheet } from "@/components/recipes/recipe-print-sheet";
import { BatchSheetControls } from "@/components/recipes/batch-sheet-controls";
import { fetchRecipeCatalog } from "@/lib/recipes/catalog";
import { fetchInstructions } from "@/lib/recipes/instructions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const catalog = await fetchRecipeCatalog(supabase);
  return { title: `${catalog.byId.get(id)?.name ?? "Recipe"} — batch record` };
}

export default async function RecipePrintPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ qty?: string; date?: string }> }) {
  const { id } = await params;
  const { qty, date } = await searchParams;

  const supabase = await createClient();
  const [catalog, instructions] = await Promise.all([
    fetchRecipeCatalog(supabase),
    fetchInstructions(supabase, id),
  ]);

  const recipe = catalog.byId.get(id);
  if (!recipe) notFound();

  // Both settled on the server so the preview and the paper agree.
  const productionDate = date ?? new Date().toISOString().slice(0, 10);
  const parsed = qty === undefined ? NaN : Number(qty);
  const scheduled = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  return (
    <PrintFrame
      backHref={`/recipes/${id}`}
      title="Batch record"
      subtitle={`${recipe.wipCode} · ${recipe.name}`}
      controls={
        <BatchSheetControls
          recipeId={id}
          quantity={scheduled}
          date={productionDate}
          uom={recipe.uom ?? "LB"}
          batchYield={recipe.batchYield ?? recipe.batchSize}
        />
      }
    >
      <RecipePrintSheet
        recipe={recipe}
        steps={instructions.steps}
        scheduled={scheduled}
        productionDate={productionDate}
      />
    </PrintFrame>
  );
}
