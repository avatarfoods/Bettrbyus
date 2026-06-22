import { MovingHistoryPage } from "@/components/moving-history-table";

export const metadata = {
  title: "Removal history | Protein Thaw Manager",
};

export default function MovingsHistoryPage() {
  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <MovingHistoryPage />
    </div>
  );
}
