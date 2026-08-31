import { PurchasingMaterialsPage } from "@/components/purchasing-materials-table";

export const metadata = {
  title: "Purchasing materials",
};

export default function PurchasingMaterialsRoute() {
  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <PurchasingMaterialsPage />
    </div>
  );
}
