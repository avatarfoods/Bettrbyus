import { PageShell } from "@/components/app-shell/page-shell";
import { ContainerSizesSettings } from "@/components/production/settings/container-sizes-settings";
import { fetchContainerDefaults } from "@/lib/production/wip/fetch";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Container sizes" };
export const dynamic = "force-dynamic";

export default async function ContainerSizesPage() {
  const supabase = await createClient();
  const data = await fetchContainerDefaults(supabase);
  const set = data.recipes.filter((row) => row.defaultContainerSize != null).length;

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Settings" },
        { label: "Container sizes" },
      ]}
      meta={
        <span>
          {data.recipes.length} products
          {set > 0 && ` · ${set} with a default`}
        </span>
      }
    >
      <ContainerSizesSettings data={data} />
    </PageShell>
  );
}
