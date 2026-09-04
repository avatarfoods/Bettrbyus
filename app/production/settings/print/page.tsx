import { PageShell } from "@/components/app-shell/page-shell";
import { PrintSettings } from "@/components/production/settings/print-settings";
import { fetchProductionConfig } from "@/lib/production/config";
import { fetchAppSettings } from "@/lib/settings/wallpaper";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print sheets" };
export const dynamic = "force-dynamic";

export default async function PrintSettingsPage() {
  const supabase = await createClient();
  const [settings, config] = await Promise.all([
    fetchAppSettings(supabase),
    fetchProductionConfig(supabase),
  ]);

  const departments = config.departments
    .filter((entry) => entry.active)
    .map((entry) => ({ name: entry.name, lineName: entry.lineName, color: entry.color }));

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Settings" },
        { label: "Print sheets" },
      ]}
      meta={<span>{departments.length} departments</span>}
    >
      <PrintSettings departments={departments} plan={settings.printPlan} />
    </PageShell>
  );
}
