import { PageShell } from "@/components/app-shell/page-shell";
import { PurchasingOpenOrdersPage } from "@/components/purchasing-open-orders";

export const metadata = {
  title: "Orders list",
};

export default function PurchasingOrdersRoute() {
  return (
    <PageShell breadcrumbs={[{ label: "Purchasing" }, { label: "Orders list" }]}>
      <PurchasingOpenOrdersPage />
    </PageShell>
  );
}
