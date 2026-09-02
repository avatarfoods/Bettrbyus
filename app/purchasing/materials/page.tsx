import { PageShell } from "@/components/app-shell/page-shell";
import { PurchasingMaterialsPage } from "@/components/purchasing-materials-table";

export const metadata = {
  title: "Purchasing materials",
};

export default function PurchasingMaterialsRoute() {
  return (
    <PageShell breadcrumbs={[{ label: "Purchasing" }, { label: "Materials" }]}>
      <PurchasingMaterialsPage />
    </PageShell>
  );
}
