import { PageShell } from "@/components/app-shell/page-shell";
import { WarehousesSettings } from "@/components/production/settings/warehouses-settings";
import { DELIVERY_PICKING_TYPE_IDS } from "@/lib/odoo/constants";
import { fetchOdooWarehouses, type OdooWarehouse } from "@/lib/odoo/orders";
import { fetchWarehouseSources } from "@/lib/production/warehouses";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Warehouses" };
export const dynamic = "force-dynamic";

export default async function WarehousesSettingsPage() {
  const supabase = await createClient();
  const sources = await fetchWarehouseSources(supabase);

  let warehouses: OdooWarehouse[] = [];
  let warehousesError: string | null = null;
  try {
    warehouses = await fetchOdooWarehouses();
  } catch (error) {
    warehousesError =
      error instanceof Error ? error.message : "Could not reach Odoo";
  }

  const liveNames = sources.usingFallback
    ? warehouses
        .filter((warehouse) =>
          (DELIVERY_PICKING_TYPE_IDS as readonly number[]).includes(
            warehouse.pickingTypeId
          )
        )
        .map((warehouse) => warehouse.name)
    : sources.warehouses.map((warehouse) => warehouse.name);

  const pullingFrom =
    liveNames.length > 0
      ? `Pulling from ${liveNames.join(" · ")}`
      : "Pulling from AvatarNaturalFoods · Americold Warehouse";

  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Settings" },
        { label: "Warehouses" },
      ]}
      meta={<span>{pullingFrom}</span>}
    >
      <WarehousesSettings
        sources={sources}
        odooWarehouses={warehouses}
        odooError={warehousesError}
      />
    </PageShell>
  );
}
