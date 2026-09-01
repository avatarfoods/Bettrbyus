import { notFound } from "next/navigation";
import { PrintFrame } from "@/components/production/print/print-frame";
import { SpecSheet } from "@/components/recipes/spec-sheet";
import { fetchRecipeCatalog } from "@/lib/recipes/catalog";
import { fetchSpecForRecipe } from "@/lib/finished-products/fetch";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const catalog = await fetchRecipeCatalog(supabase);
  return { title: `${catalog.byId.get(id)?.name ?? "Product"} — specification` };
}

export default async function SpecSheetPage({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const [catalog, spec] = await Promise.all([
    fetchRecipeCatalog(supabase),
    fetchSpecForRecipe(supabase, id),
  ]);

  const recipe = catalog.byId.get(id);
  if (!recipe) notFound();

  return (
    <PrintFrame
      backHref={`/recipes/${id}`}
      title="Specification"
      subtitle={`${recipe.wipCode} · ${recipe.name}`}
    >
      <SpecSheet recipe={recipe} spec={spec.spec} />
    </PrintFrame>
  );
}
