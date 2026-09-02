import { PageShell } from "@/components/app-shell/page-shell";
import { EditPlanButton } from "@/components/production/schedule/edit-plan-button";
import { LineSwitch } from "@/components/production/schedule/line-switch";
import { PlanPicker } from "@/components/production/schedule/plan-picker";
import { ScheduleView } from "@/components/production/schedule/schedule-view";
import { fetchScheduleData } from "@/lib/production/schedule/fetch";
import {
  LIVE_SCHEDULE_NAME,
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
    /** Which plan is on screen: "live", or a draft's id. */
    view?: string;
    /** "1" while the plan is open for typing. */
    edit?: string;
    /** Which line's plan. Each line runs its own week. */
    line?: string;
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

  /*
    Which line's plan.

    Each line has its own live plan and its own drafts - planning Bettr Bowl
    says nothing about Pizza Cupcake - so the line is not a row filter here,
    it is which plan you are in. Everything below hangs off it.
  */
  const config = await fetchProductionConfig(supabase);
  const activeLines = config.lines.filter((entry) => entry.active);
  const line =
    activeLines.find((entry) => entry.name === params.line) ??
    activeLines[0] ??
    null;

  const ensured = await ensureLiveSchedule(
    supabase,
    today,
    line?.id ?? null,
    line?.name
  );
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

  /*
    Which plan is on screen.

    The confirmed plan on its own, or one draft laid over it. Anyone can look
    at anyone's draft - that is what makes "have a look at what I am
    proposing" possible - but only the person who owns it can type into it.
  */
  const editing = params.edit === "1";

  const viewing =
    params.view === "live"
      ? null
      : params.view && drafts.some((draft) => draft.id === params.view)
        ? params.view
        : myDraftId;

  const data = await fetchScheduleData(
    supabase,
    liveId ?? undefined,
    viewing ?? null
  );
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
      breadcrumbs={[
        { label: "Production" },
        { label: line ? `Planning · ${line.name}` : "Planning" },
      ]}
      actions={!readOnly && <EditPlanButton editing={editing} />}
      meta={
        readOnly ? (
          <span>{entries.length} from the workbook</span>
        ) : (
          // Everything about WHICH plan sits together: the line it belongs
          // to, the plan itself, and the drafts against it. They are one
          // decision made in three steps, so they read as one control.
          <span className="flex items-center gap-2">
            <LineSwitch
              lines={activeLines.map((entry) => entry.name)}
              current={line?.name ?? null}
              areas={config.departments
                .filter((entry) => entry.active && entry.lineName === line?.name)
                .map((entry) => entry.name)}
              currentArea={params.dept ?? "__finished__"}
            />
            <PlanPicker
            scheduleId={liveId ?? ""}
            from={from}
            to={to}
            liveName={data.schedule?.name ?? LIVE_SCHEDULE_NAME}
            liveEntries={data.entries.length}
            drafts={drafts}
            viewingId={viewing}
            myDraftId={myDraftId}
              canEdit={isAdminProfile(profile)}
              editing={editing}
            />
          </span>
        )
      }
    >
      <ScheduleView
        scheduleId={liveId}
        liveName={data.schedule?.name ?? LIVE_SCHEDULE_NAME}
        myDraftId={myDraftId}
        viewingId={viewing}
        editing={editing}
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
        planLine={line?.name ?? null}
        initialDept={params.dept}
        initialQuery={params.q}
        recipes={data.recipes}
        entries={entries}
        draftChanges={[...data.draftChanges]}
        windows={[...data.windows.entries()]}
        recipes4Explode={[...data.recipesById.entries()]}
        recipeLines={[...data.linesByRecipeId.entries()]}
      />
    </PageShell>
  );
}
