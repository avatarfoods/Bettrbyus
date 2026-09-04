import { PrintFrame } from "@/components/production/print/print-frame";
import { ProductReleaseSheet } from "@/components/production/print/sheets";
import { buildProductionDay } from "@/lib/production/print/build";
import { buildReleaseProducts, recipeFilter } from "@/lib/production/print/release";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Product release" };
export const dynamic = "force-dynamic";

/**
 * The release sheet: one line per pallet, the way the workbook printed it.
 * `recipes` narrows it to the ticked products; without it, every finished
 * product planned on the day is on the sheet.
 */
export default async function ReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; id?: string; line?: string; recipes?: string; po?: string }>;
}) {
  const { date, id, line, recipes, po } = await searchParams;
  const day = date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const built = await buildProductionDay(supabase, day, id);
  const products = await buildReleaseProducts(supabase, built, recipeFilter(recipes));

  const back = new URLSearchParams({ date: day });
  if (id) back.set("id", id);
  if (line) back.set("line", line);
  const poNumber = po?.trim().slice(0, 40) || null;

  return (
    <PrintFrame
      backHref={`/production/print?${back}`}
      title="Product release"
      subtitle={`${day} · ${line ?? built.scheduleName} · ${products.length} product${products.length === 1 ? "" : "s"} · ${products.reduce((sum, p) => sum + p.pallets, 0)} pallets`}
    >
      <ProductReleaseSheet date={built.date} lineName={line ?? built.scheduleName} products={products} po={poNumber} />
    </PrintFrame>
  );
}
