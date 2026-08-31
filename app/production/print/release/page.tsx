import { PrintFrame } from "@/components/production/print/print-frame";
import { ProductReleaseSheet } from "@/components/production/print/sheets";
import { buildProductionDay } from "@/lib/production/print/build";
import { expirationFor, lotFor } from "@/lib/finished-products/model";
import { fetchSpecForRecipe } from "@/lib/finished-products/fetch";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Product release" };
export const dynamic = "force-dynamic";

export default async function ReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; id?: string }>;
}) {
  const { date, id } = await searchParams;
  const day = date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const built = await buildProductionDay(supabase, day, id);

  // Lot and expiration come from each product's own rule rather than a single
  // company-wide formula, because shelf life differs per product and the rule
  // has to be changeable by whoever owns the spec.
  const lots: Record<string, { lot: string; expiration: string | null }> = {};

  for (const row of built.finished) {
    const { spec } = await fetchSpecForRecipe(supabase, row.recipeId);
    lots[row.recipeId] = spec
      ? {
          lot: lotFor(spec, built.date),
          expiration: expirationFor(spec, built.date),
        }
      : // No specification yet, so the line prints blank for someone to fill
        // in rather than guessing a shelf life.
        { lot: "", expiration: null };
  }

  return (
    <PrintFrame
      backHref={`/production/print?date=${day}${id ? `&id=${id}` : ""}`}
      title="Product release"
      subtitle={`${day} · ${built.finished.length} finished products`}
    >
      <ProductReleaseSheet day={built} lots={lots} />
    </PrintFrame>
  );
}
