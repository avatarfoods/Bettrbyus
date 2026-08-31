import { PurchasingOpenOrdersPage } from "@/components/purchasing-open-orders";

export const metadata = {
  title: "Orders list",
};

export default function PurchasingOrdersRoute() {
  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <PurchasingOpenOrdersPage />
    </div>
  );
}
