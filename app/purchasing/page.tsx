import { PageShell } from "@/components/app-shell/page-shell";
import { PurchasingMatrix } from "@/components/purchasing-matrix";

export const metadata = {
  title: "Total Orders",
};

export default function PurchasingRoute() {
  return (
    <PageShell breadcrumbs={[{ label: "Purchasing" }, { label: "Total orders" }]}>
      <PurchasingMatrix />
    </PageShell>
  );
}
