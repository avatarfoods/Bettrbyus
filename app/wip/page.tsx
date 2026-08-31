import { PageShell } from "@/components/app-shell/page-shell";
import { WipCalculator } from "@/components/production/wip-calculator";
import { fetchWipData } from "@/lib/production/fetch-wip";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "WIP calculator",
};

export default async function WipPage() {
  const supabase = await createClient();
  const data = await fetchWipData(supabase);

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "WIP calculator" }]}
      meta={
        <span>
          {data.finished.length} finished · {data.subrecipes.length} subrecipes
        </span>
      }
    >
      <p className="px-3 pt-3 text-sm text-muted-foreground sm:px-4">
        The kitchen made X — what can we run with it? Nothing here changes the
        schedule.
      </p>
      <WipCalculator data={data} />
    </PageShell>
  );
}
