import { PrintFrame } from "@/components/production/print/print-frame";
import { ProductionNeedSheet } from "@/components/production/print/sheets";
import { buildProductionNeed } from "@/lib/production/print/build";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Production need" };
export const dynamic = "force-dynamic";

export default async function NeedPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; id?: string; dept?: string }>;
}) {
  const { date, id, dept } = await searchParams;
  const day = date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const built = await buildProductionNeed(supabase, day, id);

  const departments = dept
    ? built.departments.filter((d) => d.department === dept)
    : built.departments;

  return (
    <PrintFrame
      backHref={`/production/print?date=${day}${id ? `&id=${id}` : ""}`}
      title="Production need"
      subtitle={`${day} · ${dept ?? "every department"}`}
    >
      <ProductionNeedSheet
        date={built.date}
        scheduleName={built.scheduleName}
        departments={departments}
      />
    </PrintFrame>
  );
}
