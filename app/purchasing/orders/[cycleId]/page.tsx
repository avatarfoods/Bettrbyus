import { PurchasingOrderDetailPage } from "@/components/purchasing-order-detail";

export const metadata = {
  title: "Order | Protein Thaw Manager",
};

type Props = {
  params: Promise<{ cycleId: string }>;
};

export default async function PurchasingOrderDetailRoute({ params }: Props) {
  const { cycleId } = await params;
  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <PurchasingOrderDetailPage cycleId={cycleId} />
    </div>
  );
}
