import { PageShell } from "@/components/app-shell/page-shell";
import { OrdersSettings } from "@/components/production/settings/orders-settings";
import { fetchSaleableCategories, type OdooCategory } from "@/lib/odoo/orders";
import { fetchProductionConfig } from "@/lib/production/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Order schedule settings" };
export const dynamic = "force-dynamic";

export default async function OrdersSettingsPage() {
  const supabase = await createClient();
  const config = await fetchProductionConfig(supabase);

  // Odoo being unreachable must not take the settings page down; the picker
  // falls back to a plain id field and says why.
  let categories: OdooCategory[] = [];
  let categoriesError: string | null = null;
  try {
    categories = await fetchSaleableCategories();
  } catch (error) {
    categoriesError =
      error instanceof Error ? error.message : "Could not reach Odoo";
  }

  const linked = config.lines.filter((line) => line.odooCategoryIds.length > 0);

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Settings" },
        { label: "Order schedule" },
      ]}
      meta={
        <span>
          {linked.length} of {config.lines.length} lines linked
        </span>
      }
    >
      <OrdersSettings
        config={config}
        categories={categories}
        categoriesError={categoriesError}
      />
    </PageShell>
  );
}
