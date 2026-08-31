import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/supabase/missing";

/**
 * The live schedule, and the drafts that change it.
 *
 * There is one live schedule and it is always open - no folder to create,
 * because the plan changes daily and making someone create a container first
 * would be a step that serves the database rather than the person.
 *
 * Editing it opens a draft belonging to whoever is editing, named for the day
 * they started and the person who started it. A draft holds only the cells
 * that were touched, so two people planning different lines cannot overwrite
 * each other, and confirming merges those cells into the live schedule.
 */

export const LIVE_SCHEDULE_NAME = "Production schedule";

/** A year forward and a month back - past any horizon anyone plans to. */
function rollingPeriod(today: string): { start: string; end: string } {
  const base = new Date(`${today}T00:00:00Z`);

  const start = new Date(base);
  start.setUTCMonth(start.getUTCMonth() - 1);

  const end = new Date(base);
  end.setUTCFullYear(end.getUTCFullYear() + 1);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export type EnsureResult = {
  id: string | null;
  /** True when the schedule tables have not been created yet. */
  missingTable: boolean;
  error: string | null;
};

/**
 * The live schedule's id, creating it the first time anyone opens the page.
 *
 * Widens the period rather than replacing the row, because entries already
 * point at it.
 */
export async function ensureLiveSchedule(
  supabase: SupabaseClient,
  today: string
): Promise<EnsureResult> {
  const { data, error } = await supabase
    .from("production_schedules")
    .select("id, period_start, period_end")
    .eq("status", "live")
    .limit(1);

  if (error) {
    return {
      id: null,
      missingTable: isMissingTable(error),
      error: isMissingTable(error) ? null : error.message,
    };
  }

  const period = rollingPeriod(today);
  const existing = data?.[0];

  if (existing) {
    if (
      (existing.period_end as string) < period.end ||
      (existing.period_start as string) > period.start
    ) {
      await supabase
        .from("production_schedules")
        .update({
          period_start:
            (existing.period_start as string) < period.start
              ? existing.period_start
              : period.start,
          period_end:
            (existing.period_end as string) > period.end
              ? existing.period_end
              : period.end,
        })
        .eq("id", existing.id);
    }
    return { id: existing.id as string, missingTable: false, error: null };
  }

  const { data: created, error: createError } = await supabase
    .from("production_schedules")
    .insert({
      name: LIVE_SCHEDULE_NAME,
      status: "live",
      period_start: period.start,
      period_end: period.end,
    })
    .select("id")
    .single();

  if (createError) {
    // Another request may have created it in the gap; read it back rather
    // than reporting a failure the user cannot act on.
    const { data: raced } = await supabase
      .from("production_schedules")
      .select("id")
      .eq("status", "live")
      .limit(1);
    if (raced?.[0]) {
      return { id: raced[0].id as string, missingTable: false, error: null };
    }
    return { id: null, missingTable: false, error: createError.message };
  }

  return { id: created.id as string, missingTable: false, error: null };
}

export type DraftSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string | null;
  createdById: string | null;
  createdByName: string;
  entryCount: number;
  /** draft = still open, confirmed = already merged into the live plan. */
  status: "draft" | "confirmed";
  /** True while this is the draft the grid is overlaying, not a parked one. */
  isWorking: boolean;
};

/**
 * The drafts open against the live schedule, newest first.
 *
 * Shown behind the "Drafts" button so it is obvious when someone else has
 * unconfirmed changes in flight.
 */
export async function fetchDrafts(
  supabase: SupabaseClient,
  liveId: string
): Promise<DraftSummary[]> {
  // No embedded profiles join. production_schedules has two foreign keys to
  // profiles - created_by and confirmed_by - so PostgREST cannot tell which
  // one `profiles ( ... )` means and fails the whole query with PGRST201.
  // That made this return [] every time, and Open drafts was always empty
  // however many drafts existed. Two plain queries cannot go wrong that way.
  const { data, error } = await supabase
    .from("production_schedules")
    .select("*")
    .eq("parent_schedule_id", liveId)
    .in("status", ["draft", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  const authorIds = [
    ...new Set(
      data.map((row) => row.created_by as string | null).filter(Boolean)
    ),
  ] as string[];

  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", authorIds);
    for (const person of people ?? []) {
      names.set(
        person.id as string,
        (person.full_name as string | null) ||
          (person.email as string | null) ||
          "Unknown"
      );
    }
  }

  const counts = new Map<string, number>();
  const { data: entryRows } = await supabase
    .from("production_schedule_entries")
    .select("schedule_id")
    .in(
      "schedule_id",
      data.map((row) => row.id as string)
    );

  for (const row of entryRows ?? []) {
    const id = (row as { schedule_id: string }).schedule_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? null,
    createdById: (row.created_by as string | null) ?? null,
    createdByName: names.get(row.created_by as string) ?? "Unknown",
    entryCount: counts.get(row.id as string) ?? 0,
    status: (row.status as "draft" | "confirmed") ?? "draft",
    // Before the parking migration every draft is the working one, which is
    // exactly how the page behaved then.
    isWorking: (row.is_working as boolean | null) ?? true,
  }));
}

/** What a draft is called: the day it was started and who started it. */
export function draftName(today: string, who: string): string {
  return `${today} · ${who}`;
}
