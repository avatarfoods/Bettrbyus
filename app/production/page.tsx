import { PageShell } from "@/components/app-shell/page-shell";
import { ProductionDashboard } from "@/components/production/dashboard";
import { buildDashboard } from "@/lib/production/dashboard";
import { fetchScheduleData } from "@/lib/production/schedule/fetch";
import {
  WORKBOOK_SEED,
  WORKBOOK_SEED_START,
} from "@/lib/production/schedule/workbook-seed";
import {
  departmentLineMap,
  fetchProductionConfig,
} from "@/lib/production/config";
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
  /*
    Every line's live plan, together.

    The board is for the whole building: Bettr Bowl and Pizza Cupcake each
    plan their own week, but somebody walking past this screen wants to see
    what the plant is making, not one line of it. The line chips narrow it
    afterwards.
  */
  const config = await fetchProductionConfig(supabase);
  const { data: liveRows } = await supabase
    .from("production_schedules")
    .select("id")
    .eq("status", "live");

  const liveIds = (liveRows ?? []).map((row) => row.id as string);

  // The dashboard reads LIVE plans only - never anyone's open draft. What it
  // shows is what has been confirmed, which is the point of it being the page
  // the whole company opens.
  const data = await fetchScheduleData(supabase, liveIds[0], null);

  const { data: allEntries } = liveIds.length
    ? await supabase
        .from("production_schedule_entries")
        .select("recipe_id, production_date, quantity")
        .in("schedule_id", liveIds)
    : { data: [] };

  const readOnly = data.missingTable || liveIds.length === 0;
  const entries = readOnly
    ? WORKBOOK_SEED
    : (allEntries ?? []).map((row) => ({
        recipeId: row.recipe_id as string,
        productionDate: row.production_date as string,
        quantity: Number(row.quantity ?? 0),
      }));

  const defaultFrom = readOnly ? WORKBOOK_SEED_START : today;
  const from = params.from ?? defaultFrom;
  const to = params.to && params.to >= from ? params.to : addDays(from, 6);

  const recipesById = new Map(data.recipes.map((recipe) => [recipe.id, recipe]));
  const days = buildDashboard(
    entries,
    recipesById,
    from,
    to,
    // Already ordered by sort_order, which is seeded downstream-first.
    config.departments.map((entry) => entry.name)
  );

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Dashboard" }]}
      trailRoot
      meta={
        <span>
          {days.filter((day) => day.recipeCount > 0).length} of {days.length}{" "}
          days with work
        </span>
      }
    >
      <ProductionDashboard
        days={days}
        from={from}
        to={to}
        today={today}
        departmentColors={config.departments.map((d) => [d.name, d.color])}
        departmentLines={[...departmentLineMap(config).entries()]}
        allLines={config.lines
          .filter((entry) => entry.active)
          .map((entry) => entry.name)}
        isDraftOnly={readOnly}
      />
    </PageShell>
  );
}
