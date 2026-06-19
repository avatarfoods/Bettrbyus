import { MovingForm } from "@/components/moving-form";

export const metadata = {
  title: "New moving | Protein Thaw Manager",
};

export default function NewMovingPage() {
  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <MovingForm />
    </div>
  );
}
