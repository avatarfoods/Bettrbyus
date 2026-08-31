import { PrintFrame } from "@/components/production/print/print-frame";
import { BatchSheetPage } from "@/components/production/print/sheets";
import { buildProductionDay } from "@/lib/production/print/build";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Batch sheets" };
export const dynamic = "force-dynamic";

export default async function BatchPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; id?: string; dept?: string }>;
}) {
  const { date, id, dept } = await searchParams;
  const day = date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const built = await buildProductionDay(supabase, day, id);

  const sheets = built.departments
    .filter((group) => !dept || group.department === dept)
    .flatMap((group) => group.sheets);

  return (
    <PrintFrame
      backHref={`/production/print?date=${day}${id ? `&id=${id}` : ""}`}
      title="Batch sheets"
      subtitle={`${day} · ${dept ?? "every department"} · ${sheets.length} sheets`}
    >
      {sheets.map((sheet, index) => (
        <BatchSheetPage
          key={sheet.recipeId}
          sheet={sheet}
          date={built.date}
          scheduleName={built.scheduleName}
          first={index === 0}
        />
      ))}
      {sheets.length === 0 && (
        <p className="text-sm">Nothing is scheduled on {day}.</p>
      )}
    </PrintFrame>
  );
}
