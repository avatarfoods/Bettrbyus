import { PageShell } from "@/components/app-shell/page-shell";
import { OrdersView } from "@/components/orders/orders-view";
import { fetchOrdersData } from "@/lib/orders/fetch-orders";
import { fetchProductionConfig } from "@/lib/production/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Order schedule",
};

// Always fresh: this reads live Odoo, and a cached production plan is worse
// than no plan.
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = await createClient();
  const config = await fetchProductionConfig(supabase);
  const data = await fetchOrdersData(config);

  const totalLate = data.late.length;

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Order schedule" }]}
      meta={
        data.error ? (
          <span className="text-destructive">Odoo unavailable</span>
        ) : (
          <span>
            {data.lines.reduce((n, l) => n + l.totals.orders, 0)} open lines
            {totalLate > 0 && ` · ${totalLate} late`}
          </span>
        )
      }
    >
      <OrdersView data={data} />
    </PageShell>
  );
}
