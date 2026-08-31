import { PageShell } from "@/components/app-shell/page-shell";
import { MovingHistoryPage } from "@/components/moving-history-table";

export const metadata = {
  title: "Thaw history",
};

export default function MovingsHistoryRoute() {
  return (
    <PageShell
      breadcrumbs={[
        { label: "Production" },
        { label: "Thawing", href: "/movings/new" },
        { label: "History" },
      ]}
    >
      <MovingHistoryPage />
    </PageShell>
  );
}
