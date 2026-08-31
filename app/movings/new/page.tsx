import { PageShell } from "@/components/app-shell/page-shell";
import { MovingForm } from "@/components/moving-form";

export const metadata = {
  title: "New thaw",
};

export default function NewMovingPage() {
  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Thawing", href: "/movings/new" },
        { label: "New thaw" },
      ]}
    >
      <MovingForm />
    </PageShell>
  );
}
