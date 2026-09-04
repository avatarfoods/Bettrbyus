import { PageShell } from "@/components/app-shell/page-shell";
import { PrintConsole } from "@/components/production/print/print-console";
import { PickingScope } from "@/components/production/picking/picking-scope";
import { buildProductionDay } from "@/lib/production/print/build";
import { buildReleaseProducts } from "@/lib/production/print/release";
import { fetchProductionConfig, isRealLine } from "@/lib/production/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print for the floor" };
export const dynamic = "force-dynamic";

function isIsoDate(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

/**
 * The day on paper.
 *
 * Pick the line and the day the way every other page does, see what is
 * planned - the finished products going out and every department's runs -
 * tick what you want, and print: everything at once, or one sheet.
 */
export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; line?: string; id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const config = await fetchProductionConfig(supabase);

  // "Today" is decided on the server so the console and the sheets it links
  // to never disagree about which day is being printed.
  const today = new Date().toISOString().slice(0, 10);
  const day = isIsoDate(params.date) ? params.date : today;

  const activeLines = config.lines.filter((entry) => entry.active);
  const line =
    activeLines.find((entry) => entry.name === params.line) ?? activeLines[0] ?? null;

  // Each line has its own live plan; that is the schedule this day prints from.
  const { data: liveRows } = await supabase
    .from("production_schedules")
    .select("id, line_id")
    .eq("status", "live");
  const live = (liveRows ?? []) as { id: string; line_id: string | null }[];
  const scheduleId =
    params.id ??
    (line && isRealLine(line)
      ? live.find((row) => row.line_id === line.id)?.id
      : live.find((row) => row.line_id === null)?.id) ??
    live[0]?.id;

  const built = await buildProductionDay(supabase, day, scheduleId);
  const release = await buildReleaseProducts(supabase, built);

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Print for the floor" }]}
      meta={
        <PickingScope
          lines={activeLines.map((entry) => entry.name)}
          currentLine={line?.name ?? null}
          places={[]}
          currentPlace={null}
          basePath="/production/print"
          allLinesLabel={null}
        />
      }
    >
      <PrintConsole
        day={built}
        release={release}
        date={day}
        today={today}
        lineName={line?.name ?? null}
        scheduleId={scheduleId ?? null}
        departmentColors={config.departments.map((d) => [d.name, d.color])}
      />
    </PageShell>
  );
}
