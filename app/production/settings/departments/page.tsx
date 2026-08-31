import { PageShell } from "@/components/app-shell/page-shell";
import { DepartmentsSettings } from "@/components/production/settings/departments-settings";
import { fetchProductionConfig } from "@/lib/production/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Departments" };
export const dynamic = "force-dynamic";

export default async function DepartmentsSettingsPage() {
  const supabase = await createClient();
  const config = await fetchProductionConfig(supabase);

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Settings" },
        { label: "Departments" },
      ]}
      meta={<span>{config.departments.length} departments</span>}
    >
      <DepartmentsSettings config={config} />
    </PageShell>
  );
}
