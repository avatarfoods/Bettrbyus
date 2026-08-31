import { PageShell } from "@/components/app-shell/page-shell";
import { GroupsSettings } from "@/components/production/settings/groups-settings";
import { fetchGroups, fetchMaterialOptions } from "@/lib/groups/fetch-groups";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Product Groups" };
export const dynamic = "force-dynamic";

export default async function GroupsSettingsPage() {
  const supabase = await createClient();
  const [data, materials] = await Promise.all([
    fetchGroups(supabase),
    fetchMaterialOptions(supabase),
  ]);

  const incomplete = data.groups.reduce((n, g) => n + g.incompleteCount, 0);

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Settings" },
        { label: "Product Groups" },
      ]}
      meta={
        <span>
          {data.groups.length} groups
          {incomplete > 0 && ` · ${incomplete} missing pack size`}
        </span>
      }
    >
      <GroupsSettings data={data} materials={materials} />
    </PageShell>
  );
}
