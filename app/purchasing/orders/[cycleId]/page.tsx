import { PageShell } from "@/components/app-shell/page-shell";
import { PurchasingOrderDetailPage } from "@/components/purchasing-order-detail";

export const metadata = {
  title: "Order",
};

type Props = {
  params: Promise<{ cycleId: string }>;
};

export default async function PurchasingOrderDetailRoute({ params }: Props) {
  const { cycleId } = await params;
  return (
    <PageShell
      breadcrumbs={[
        { label: "Purchasing" },
        { label: "Orders", href: "/purchasing/orders" },
        { label: "Order" },
      ]}
    >
      <PurchasingOrderDetailPage cycleId={cycleId} />
    </PageShell>
  );
}
