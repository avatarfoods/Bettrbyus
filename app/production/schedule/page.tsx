import { PageShell } from "@/components/app-shell/page-shell";
import { ScheduleView } from "@/components/production/schedule/schedule-view";
import { fetchScheduleData } from "@/lib/production/schedule/fetch";
import {
  ensureLiveSchedule,
  fetchDrafts,
} from "@/lib/production/schedule/ensure";
import {
  WORKBOOK_SEED,
  WORKBOOK_SEED_START,
} from "@/lib/production/schedule/workbook-seed";
import { fetchProductionConfig } from "@/lib/production/config";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { scopeFromParams } from "@/lib/date-scope";
import { fetchWipData } from "@/lib/production/wip/fetch";
import { onHandByRecipe } from "@/lib/production/wip/model";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Planning" };
export const dynamic = "force-dynamic";

/** Two weeks is what a range defaults to, not what it is limited to. */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    dept?: string;
    q?: string;
    /** Which day's WIP the grid shows, or a span of them. */
    wip?: string;
    wipFrom?: string;
    wipTo?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Today is settled on the server so the grid, the totals and anything
  // printed from them all agree about which day "today" is.
  const today = new Date().toISOString().slice(0, 10);

  const ensured = await ensureLiveSchedule(supabase, today);
  const liveId = ensured.id;

  const profile = await getCurrentUserProfile(supabase);
  const drafts = liveId ? await fetchDrafts(supabase, liveId) : [];

  const { data: mine } =
    profile && liveId
      ? await supabase
          .from("production_schedules")
          .select("id")
          .eq("parent_schedule_id", liveId)
          .eq("status", "draft")
          .eq("created_by", profile.id)
          .maybeSingle()
      : { data: null };

  const myDraftId = (mine?.id as string) ?? null;

  const data = await fetchScheduleData(supabase, liveId ?? undefined, myDraftId);
  const config = await fetchProductionConfig(supabase);

  // What is already in the cooler on the chosen day, so a run can be planned
  // against stock rather than from zero.
  const wipScope = scopeFromParams(
    { asOf: params.wip, from: params.wipFrom, to: params.wipTo },
    today
  );
  const wipDate = wipScope.kind === "day" ? wipScope.date : wipScope.to;
  const wipData = await fetchWipData(
    supabase,
    wipScope.kind === "day"
      ? { asOf: wipScope.date }
      : { from: wipScope.from, to: wipScope.to }
  );
  const wipOnHand = onHandByRecipe(
    wipData.counts,
    new Map(wipData.recipes.map((recipe) => [recipe.id, recipe.shelfLife])),
    wipDate
  );

  // Without the planning tables the grid still renders from the recipes, so
  // the tree and the cascade work; nothing can be saved and the view says so.
  const readOnly = data.missingTable || !liveId;
  const entries = readOnly ? WORKBOOK_SEED : data.entries;

  const defaultFrom = readOnly ? WORKBOOK_SEED_START : today;
  const from = params.from ?? defaultFrom;
  const to = params.to && params.to >= from ? params.to : addDays(from, 13);

  return (
    <PageShell
      breadcrumbs={[{ label: "Production" }, { label: "Planning" }]}
      meta={
        <span>
          {readOnly
            ? `${entries.length} from the workbook`
            : `${data.entries.length} planned`}
        </span>
      }
    >
      <ScheduleView
        scheduleId={liveId}
        myDraftId={myDraftId}
        drafts={drafts}
        readOnly={readOnly}
        setupError={ensured.error}
        today={today}
        from={from}
        to={to}
        wipScope={wipScope}
        wipDate={wipDate}
        wipOnHand={[...wipOnHand.entries()].map(([id, held]) => [
          id,
          // The lots themselves, with the expiry each one carries. A single
          // total cannot say which part of it survives to Friday.
          held.lots.map((lot) => ({
            lotCode: lot.lotCode,
            quantity: lot.quantity,
            expiresOn: lot.age.expiresOn,
          })),
        ])}
        departmentColors={config.departments.map((d) => [d.name, d.color])}
        initialDept={params.dept}
        initialQuery={params.q}
        recipes={data.recipes}
        lineNames={config.lines
          .filter((entry) => entry.active)
          .map((entry) => entry.name)}
        entries={entries}
        draftChanges={[...data.draftChanges]}
        windows={[...data.windows.entries()]}
        recipes4Explode={[...data.recipesById.entries()]}
        recipeLines={[...data.linesByRecipeId.entries()]}
        isAdmin={isAdminProfile(profile)}
      />
    </PageShell>
  );
}
