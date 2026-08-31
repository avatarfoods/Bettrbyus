import { PageShell } from "@/components/app-shell/page-shell";
import { PrintConsole } from "@/components/production/print/print-console";
import { buildProductionDay } from "@/lib/production/print/build";
import { fetchSchedules } from "@/lib/production/schedule/fetch";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print" };
export const dynamic = "force-dynamic";

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; id?: string }>;
}) {
  const { date, id } = await searchParams;
  const supabase = await createClient();

  // "Today" is decided on the server so the console and the sheets it links
  // to never disagree about which day is being printed.
  const day = date ?? new Date().toISOString().slice(0, 10);

  const [{ schedules }, built] = await Promise.all([
    fetchSchedules(supabase),
    buildProductionDay(supabase, day, id),
  ]);

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Print" }]}
      meta={<span>{day}</span>}
    >
      <PrintConsole
        schedules={schedules}
        scheduleId={id ?? schedules[0]?.id ?? null}
        departments={built.departments.map((d) => d.department)}
        defaultDate={day}
      />
    </PageShell>
  );
}
