import { PageShell } from "@/components/app-shell/page-shell";
import {
  ProductionDashboard,
  buildDashboard,
} from "@/components/production/dashboard";
import { fetchScheduleData } from "@/lib/production/schedule/fetch";
import { ensureLiveSchedule } from "@/lib/production/schedule/ensure";
import {
  WORKBOOK_SEED,
  WORKBOOK_SEED_START,
} from "@/lib/production/schedule/workbook-seed";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Production" };
export const dynamic = "force-dynamic";

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function ProductionDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const ensured = await ensureLiveSchedule(supabase, today);

  // The dashboard reads the LIVE plan only - never anyone's open draft. What
  // it shows is what has been confirmed, which is the point of it being the
  // page the whole company opens.
  const data = await fetchScheduleData(supabase, ensured.id ?? undefined, null);

  const readOnly = data.missingTable || !ensured.id;
  const entries = readOnly ? WORKBOOK_SEED : data.entries;

  const defaultFrom = readOnly ? WORKBOOK_SEED_START : today;
  const from = params.from ?? defaultFrom;
  const to = params.to && params.to >= from ? params.to : addDays(from, 6);

  const recipesById = new Map(data.recipes.map((recipe) => [recipe.id, recipe]));
  const days = buildDashboard(entries, recipesById, from, to);

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Dashboard" }]}
      meta={<span>{days.length} days with work</span>}
    >
      <ProductionDashboard
        days={days}
        from={from}
        to={to}
        isDraftOnly={readOnly}
      />
    </PageShell>
  );
}
