import { PageShell } from "@/components/app-shell/page-shell";
import { WipView } from "@/components/production/wip/wip-view";
import { fetchWipData } from "@/lib/production/wip/fetch";
import { fetchProductionConfig } from "@/lib/production/config";
import { scopeFromParams } from "@/lib/date-scope";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "WIP" };
export const dynamic = "force-dynamic";

export default async function WipPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const scope = scopeFromParams(params, today);
  // Ages are judged against the end of whatever was asked for, so looking
  // back at the 31st says what was good on the 31st.
  const asOf = scope.kind === "day" ? scope.date : scope.to;

  const [data, config] = await Promise.all([
    fetchWipData(
      supabase,
      scope.kind === "day"
        ? { asOf: scope.date }
        : { from: scope.from, to: scope.to }
    ),
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
        asOf={asOf}
        scope={scope}
        departmentColors={config.departments.map((d) => [d.name, d.color])}
        missingTable={data.missingTable}
        windowsMissing={data.windowsMissing}
      />
    </PageShell>
  );
}
