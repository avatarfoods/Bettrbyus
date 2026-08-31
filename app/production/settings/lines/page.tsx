import { PageShell } from "@/components/app-shell/page-shell";
import { LinesSettings } from "@/components/production/settings/lines-settings";
import { fetchProductionConfig } from "@/lib/production/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Lines" };
export const dynamic = "force-dynamic";

export default async function LinesSettingsPage() {
  const supabase = await createClient();
  const config = await fetchProductionConfig(supabase);

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Settings" },
        { label: "Lines" },
      ]}
      meta={<span>{config.lines.length} lines</span>}
    >
      <LinesSettings config={config} />
    </PageShell>
  );
}
