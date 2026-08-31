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
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <PurchasingMatrix initialCycleId={id} />
    </div>
  );
}
