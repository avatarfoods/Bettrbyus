import { PageShell } from "@/components/app-shell/page-shell";
import { WipCountForm } from "@/components/production/wip/wip-count-form";
import {
  fetchCountList,
  fetchPlanned,
  fetchWipData,
} from "@/lib/production/wip/fetch";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Count WIP" };
export const dynamic = "force-dynamic";

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function WipCountPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  // Counting happens before anyone arrives, and what is being counted is the
  // day before's production.
  const counting = params.date ?? addDays(today, -1);

  const [data, list, planned] = await Promise.all([
    fetchWipData(supabase, { asOf: today }),
    fetchCountList(supabase, counting),
    fetchPlanned(supabase, counting),
  ]);

  // Only recipes that are WIP - a finished product is stock, counted elsewhere.
  const wipIds = new Set(data.recipes.map((recipe) => recipe.id));

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "WIP", href: "/production/wip" },
        { label: "Count" },
      ]}
      meta={<span>{counting}</span>}
    >
      <WipCountForm
        recipes={data.recipes}
        listedIds={list.recipeIds.filter((id) => wipIds.has(id))}
        planned={Object.fromEntries(planned)}
        today={today}
        yesterday={counting}
        missingTable={data.missingTable}
      />
    </PageShell>
  );
}
