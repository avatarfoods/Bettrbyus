import { PageShell } from "@/components/app-shell/page-shell";
import { WipView } from "@/components/production/wip/wip-view";
import { fetchWipData } from "@/lib/production/wip/fetch";
import { fetchProductionConfig } from "@/lib/production/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "WIP" };
export const dynamic = "force-dynamic";

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function WipPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  // A fortnight back by default: long enough to still see a lot that has been
  // sitting, short enough that the page is about now.
  const from = params.from ?? addDays(today, -14);
  const to = params.to && params.to >= from ? params.to : today;

  const [data, config] = await Promise.all([
    fetchWipData(supabase, { from, to }),
    fetchProductionConfig(supabase),
  ]);

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "WIP" }]}
      meta={<span>{data.counts.length} counts</span>}
    >
      <WipView
        recipes={data.recipes}
        counts={data.counts}
        lineNames={config.lines
          .filter((line) => line.active)
          .map((line) => line.name)}
        today={today}
        from={from}
        to={to}
        missingTable={data.missingTable}
        windowsMissing={data.windowsMissing}
      />
    </PageShell>
  );
}
