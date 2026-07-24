import { PurchasingMatrix } from "@/components/purchasing-matrix";

export const metadata = {
  title: "Component Matrix | Protein Thaw Manager",
};

export default function PurchasingRoute() {
  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <PurchasingMatrix />
    </div>
  );
}
