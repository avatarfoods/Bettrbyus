import { InventoryCheckForm } from "@/components/inventory-check-form";

export const metadata = {
  title: "Daily inventory check | Protein Thaw Manager",
};

export default function NewInventoryCheckPage() {
  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <InventoryCheckForm />
    </div>
  );
}
