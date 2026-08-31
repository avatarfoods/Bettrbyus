import { PrintFrame } from "@/components/production/print/print-frame";
import { ProductionReportSheet } from "@/components/production/print/sheets";
import { buildProductionDay } from "@/lib/production/print/build";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Production report" };
export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; id?: string }>;
}) {
  const { date, id } = await searchParams;
  const day = date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const built = await buildProductionDay(supabase, day, id);

  return (
    <PrintFrame
      backHref={`/production/print?date=${day}${id ? `&id=${id}` : ""}`}
      title="Production report"
      subtitle={`${day} · ${built.scheduleName || "no schedule"}`}
    >
      <ProductionReportSheet day={built} />
    </PrintFrame>
  );
}
