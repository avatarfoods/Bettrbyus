import { PageShell } from "@/components/app-shell/page-shell";
import { PurchasingMatrix } from "@/components/purchasing-matrix";

export const metadata = {
  title: "Total Orders",
};

export default async function PurchasingCycleRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PageShell breadcrumbs={[{ label: "Purchasing" }, { label: "Total orders" }]}>
      <PurchasingMatrix initialCycleId={id} />
    </PageShell>
  );
}
