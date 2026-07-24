import { InventoryCheckHistoryPage } from "@/components/inventory-check-history";

export const metadata = {
  title: "Inventory check history | Protein Thaw Manager",
};

export default function InventoryChecksHistoryPage() {
  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <InventoryCheckHistoryPage />
    </div>
  );
}
