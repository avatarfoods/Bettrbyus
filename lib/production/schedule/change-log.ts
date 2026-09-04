import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/supabase/missing";

/**
 * Who confirmed a change into the live plan, and when.
 *
 * The live schedule is what the floor runs, so the one thing worth keeping
 * is a record of every time it moved and who moved it. Drafts are not
 * logged - they are someone's working copy and nothing runs off them.
 */

export type ScheduleChange = {
  id: string;
  changedAt: string;
  changedByName: string | null;
  lineName: string | null;
  summary: string;
};

/**
 * Best effort: a confirm that reached the live plan must not be reported as
 * failed because its audit row did not land.
 */
export async function logScheduleChange(
  supabase: SupabaseClient,
  entry: {
    scheduleId: string;
    draftId: string;
    lineId: string | null;
    lineName: string | null;
    userId: string;
    userName: string | null;
    summary: string;
  }
): Promise<void> {
  const { error } = await supabase.from("schedule_change_log").insert({
    schedule_id: entry.scheduleId,
    draft_id: entry.draftId,
    line_id: entry.lineId,
    line_name: entry.lineName,
    changed_by: entry.userId,
    changed_by_name: entry.userName,
    summary: entry.summary,
  });

  if (error && !isMissingTable(error)) {
    console.error("Could not write schedule change log:", error);
  }
}

/** Every confirm into live, newest first. Admin-only (RLS). */
export async function fetchScheduleChanges(
  supabase: SupabaseClient,
  limit = 500
): Promise<ScheduleChange[]> {
  const { data, error } = await supabase
    .from("schedule_change_log")
    .select("id, changed_at, changed_by_name, line_name, summary")
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    changedAt: row.changed_at as string,
    changedByName: (row.changed_by_name as string | null) ?? null,
    lineName: (row.line_name as string | null) ?? null,
    summary: (row.summary as string) ?? "",
  }));
}
