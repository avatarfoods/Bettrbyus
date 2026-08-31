"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { draftName } from "@/lib/production/schedule/ensure";
import { isMissingColumn, isMissingTable } from "@/lib/supabase/missing";

/**
 * Writing the schedule.
 *
 * There is no "create a schedule" action: one live schedule is ensured on
 * first open (see ensure.ts), because the plan changes daily and a folder to
 * create would be a step that serves the database rather than the person.
 *
 * Every edit lands in the caller's draft instead of on the live schedule, so
 * what the floor is holding does not change under them mid-shift. Confirming
 * merges the draft in.
 *
 * As everywhere else here, the admin check produces a readable message; the
 * actual boundary is the RLS policy, which the browser client cannot talk its
 * way past.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

const SCHEDULE_PATH = "/production/schedule";

function fail(message: string): ActionResult {
  return { ok: false, message };
}

/** yyyy-mm-dd, and a real date rather than 2026-02-31. */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

type Client = Awaited<ReturnType<typeof createClient>>;
type Profile = { id: string; full_name?: string | null; email?: string | null };

/**
 * The draft this person is working in, opened on demand.
 *
 * Nobody presses "start a draft" - the draft is a consequence of typing, which
 * is what Carlos asked for: the schedule is just there, and changing it records
 * who changed it and when without anyone having to say so.
 */
async function openDraft(
  supabase: Client,
  liveId: string,
  profile: Profile,
  today: string
): Promise<{ id: string } | { error: string }> {
  // Only the working draft is reopened. A parked one stays in the list and
  // out of the grid, which is what parking it was for.
  const { data: open } = await supabase
    .from("production_schedules")
    .select("*")
    .eq("parent_schedule_id", liveId)
    .eq("status", "draft")
    .eq("created_by", profile.id)
    .order("created_at", { ascending: false });

  const existing = (open ?? []).find(
    (row) => ((row.is_working as boolean | null) ?? true) === true
  );

  if (existing) return { id: existing.id as string };

  const { data: live } = await supabase
    .from("production_schedules")
    .select("period_start, period_end")
    .eq("id", liveId)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("production_schedules")
    .insert({
      name: draftName(today, profile.full_name || profile.email || "Unknown"),
      status: "draft",
      parent_schedule_id: liveId,
      period_start: (live?.period_start as string) ?? today,
      period_end: (live?.period_end as string) ?? today,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) {
    // Lost a race with another tab; the unique index means one now exists.
    const { data: raced } = await supabase
      .from("production_schedules")
      .select("*")
      .eq("parent_schedule_id", liveId)
      .eq("status", "draft")
      .eq("created_by", profile.id)
      .order("created_at", { ascending: false });
    const found = (raced ?? []).find(
      (row) => ((row.is_working as boolean | null) ?? true) === true
    );
    if (found) return { id: found.id as string };
    return { error: error.message };
  }

  return { id: created.id as string };
}

/**
 * Sets one cell in the grid.
 *
 * An empty quantity stores an explicit zero rather than deleting the row,
 * because inside a draft "I cleared this" is itself a change that has to
 * survive the merge. Zeroes become deletions when the draft is confirmed.
 */
export async function saveScheduleCell(input: {
  /** The LIVE schedule id. The draft is resolved from it. */
  scheduleId: string;
  recipeId: string;
  productionDate: string;
  quantity: number | null;
}): Promise<ActionResult & { draftId?: string }> {
  const { scheduleId, recipeId, productionDate, quantity } = input;

  if (!scheduleId || !recipeId) return fail("Missing schedule or recipe");
  if (!isIsoDate(productionDate)) return fail("That is not a valid date");
  if (quantity !== null && !Number.isFinite(quantity)) {
    return fail("That is not a number");
  }
  if (quantity !== null && quantity < 0) {
    return fail("A scheduled quantity cannot be negative");
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const today = new Date().toISOString().slice(0, 10);
  const draft = await openDraft(supabase, scheduleId, profile, today);
  if ("error" in draft) return fail(draft.error);

  const { error } = await supabase.from("production_schedule_entries").upsert(
    {
      schedule_id: draft.id,
      recipe_id: recipeId,
      production_date: productionDate,
      quantity: quantity ?? 0,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: "schedule_id,recipe_id,production_date" }
  );

  if (error) return fail(error.message);
  revalidatePath(SCHEDULE_PATH);
  return { ok: true, draftId: draft.id };
}

/**
 * Merges a draft into the live schedule and closes it.
 *
 * A zero in the draft means "clear this", so it deletes rather than writing a
 * zero onto the live schedule. The draft itself is kept, marked confirmed,
 * because "who changed the 3rd, and when" is a question asked after something
 * has already gone wrong.
 */
export async function confirmDraft(input: {
  draftId: string;
}): Promise<ActionResult & { applied?: number }> {
  if (!input.draftId) return fail("Missing draft");

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const { data: draft } = await supabase
    .from("production_schedules")
    .select("id, status, parent_schedule_id, created_by")
    .eq("id", input.draftId)
    .maybeSingle();

  if (!draft) return fail("That draft no longer exists");
  if (draft.status !== "draft") {
    return fail("That draft has already been confirmed");
  }
  if (!draft.parent_schedule_id) {
    return fail("That draft has no schedule to merge into");
  }
  if (draft.created_by !== profile.id && !isAdminProfile(profile)) {
    return fail("Only an administrator can confirm someone else's draft");
  }

  const { data: entries } = await supabase
    .from("production_schedule_entries")
    .select("recipe_id, production_date, quantity, note")
    .eq("schedule_id", draft.id);

  const rows = entries ?? [];
  const liveId = draft.parent_schedule_id as string;

  const clears = rows.filter((row) => Number(row.quantity ?? 0) === 0);
  const sets = rows.filter((row) => Number(row.quantity ?? 0) !== 0);

  for (const row of clears) {
    const { error } = await supabase
      .from("production_schedule_entries")
      .delete()
      .eq("schedule_id", liveId)
      .eq("recipe_id", row.recipe_id)
      .eq("production_date", row.production_date);
    if (error) return fail(error.message);
  }

  if (sets.length > 0) {
    const { error } = await supabase.from("production_schedule_entries").upsert(
      sets.map((row) => ({
        schedule_id: liveId,
        recipe_id: row.recipe_id,
        production_date: row.production_date,
        quantity: row.quantity,
        note: row.note,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      })),
      { onConflict: "schedule_id,recipe_id,production_date" }
    );
    if (error) return fail(error.message);
  }

  const { error: closeError } = await supabase
    .from("production_schedules")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: profile.id,
    })
    .eq("id", draft.id);

  if (closeError) return fail(closeError.message);

  revalidatePath(SCHEDULE_PATH);
  return { ok: true, applied: rows.length };
}

/** Throws a draft away without touching the live schedule. */
export async function discardDraft(input: {
  draftId: string;
}): Promise<ActionResult> {
  if (!input.draftId) return fail("Missing draft");

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const { data: draft } = await supabase
    .from("production_schedules")
    .select("id, status, created_by")
    .eq("id", input.draftId)
    .maybeSingle();

  if (!draft) return { ok: true };
  if (draft.status !== "draft") return fail("That is not an open draft");
  if (draft.created_by !== profile.id && !isAdminProfile(profile)) {
    return fail("Only an administrator can discard someone else's draft");
  }

  const { error } = await supabase
    .from("production_schedules")
    .delete()
    .eq("id", input.draftId);

  if (error) return fail(error.message);
  revalidatePath(SCHEDULE_PATH);
  return { ok: true };
}

/**
 * Writes a batch of suggested quantities into the caller's draft.
 *
 * This is "accept all" behind the domino. It only fills cells that are empty
 * once the draft is laid over the live schedule, so pressing it twice, or
 * pressing it after hand-editing, cannot overwrite a decision someone made.
 */
export async function applySuggestions(input: {
  scheduleId: string;
  entries: { recipeId: string; productionDate: string; quantity: number }[];
}): Promise<ActionResult & { written?: number }> {
  if (!input.scheduleId) return fail("Missing schedule");
  if (input.entries.length === 0) return { ok: true, written: 0 };

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const valid = input.entries.filter(
    (entry) =>
      entry.recipeId &&
      isIsoDate(entry.productionDate) &&
      Number.isFinite(entry.quantity) &&
      entry.quantity > 0
  );
  if (valid.length === 0) return fail("Nothing valid to write");

  const today = new Date().toISOString().slice(0, 10);
  const draft = await openDraft(supabase, input.scheduleId, profile, today);
  if ("error" in draft) return fail(draft.error);

  const { data: existing } = await supabase
    .from("production_schedule_entries")
    .select("schedule_id, recipe_id, production_date")
    .in("schedule_id", [input.scheduleId, draft.id]);

  const taken = new Set(
    (existing ?? []).map((row) => `${row.recipe_id}|${row.production_date}`)
  );

  const rows = valid
    .filter((entry) => !taken.has(`${entry.recipeId}|${entry.productionDate}`))
    .map((entry) => ({
      schedule_id: draft.id,
      recipe_id: entry.recipeId,
      production_date: entry.productionDate,
      quantity: entry.quantity,
      updated_by: profile.id,
    }));

  if (rows.length === 0) return { ok: true, written: 0 };

  const { error } = await supabase
    .from("production_schedule_entries")
    .insert(rows);

  if (error) return fail(error.message);

  revalidatePath(SCHEDULE_PATH);
  return { ok: true, written: rows.length };
}

/**
 * Saves a recipe's timing window.
 *
 * Both numbers are offsets from the day the finished product ships, so both
 * are zero or negative. Rejecting a positive here rather than storing it means
 * a stray minus sign never turns "five days early" into "five days late".
 */
export async function saveTimingWindow(input: {
  recipeId: string;
  earliestOffset: number | null;
  latestOffset: number | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const { recipeId, earliestOffset, latestOffset } = input;
  if (!recipeId) return fail("Missing recipe");

  for (const [label, value] of [
    ["Earliest", earliestOffset],
    ["Latest", latestOffset],
  ] as const) {
    if (value === null) continue;
    if (!Number.isInteger(value)) return fail(`${label} must be a whole number of days`);
    if (value > 0) {
      return fail(
        `${label} must be zero or negative — nothing is made after it ships`
      );
    }
    if (value < -365) return fail(`${label} is further out than a year`);
  }

  if (
    earliestOffset !== null &&
    latestOffset !== null &&
    earliestOffset > latestOffset
  ) {
    return fail(
      "The earliest it can be made must come before the latest it can be left"
    );
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!isAdminProfile(profile)) {
    return fail("Only an administrator can change timing windows");
  }

  const { error } = await supabase.from("recipe_timing_windows").upsert(
    {
      recipe_id: recipeId,
      earliest_offset: earliestOffset,
      latest_offset: latestOffset,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: "recipe_id" }
  );

  if (error) return fail(error.message);
  revalidatePath(SCHEDULE_PATH);
  return { ok: true };
}

/** The company-wide extra percentage applied when cascading. */
export async function saveExtraPct(pct: number): Promise<ActionResult> {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return fail("Enter a percentage between 0 and 100");
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!isAdminProfile(profile)) {
    return fail("Only an administrator can change the extra percentage");
  }

  const { data: existing } = await supabase
    .from("app_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("app_settings")
        .update({ schedule_extra_pct: pct })
        .eq("id", existing.id)
    : await supabase.from("app_settings").insert({ schedule_extra_pct: pct });

  if (error) return fail(error.message);
  revalidatePath(SCHEDULE_PATH);
  return { ok: true };
}

/**
 * Saves a raw material's timing window.
 *
 * Same shape and same rules as a recipe's, on its own table because a
 * material is not a recipe. Used for the pull-from-freezer bar that runs
 * before a step can start.
 */
export async function saveMaterialWindow(input: {
  materialId: string;
  earliestOffset: number | null;
  latestOffset: number | null;
  kind?: "thaw" | "temper" | "soak" | "prep" | "other";
}): Promise<ActionResult> {
  const { materialId, earliestOffset, latestOffset } = input;
  if (!materialId) return fail("Missing material");

  for (const [label, value] of [
    ["Earliest", earliestOffset],
    ["Latest", latestOffset],
  ] as const) {
    if (value === null) continue;
    if (!Number.isInteger(value)) return fail(`${label} must be a whole number of days`);
    if (value > 0) {
      return fail(`${label} must be zero or negative — nothing happens after it ships`);
    }
    if (value < -365) return fail(`${label} is further out than a year`);
  }

  if (
    earliestOffset !== null &&
    latestOffset !== null &&
    earliestOffset > latestOffset
  ) {
    return fail("The earliest it can start must come before the latest it can be left");
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!isAdminProfile(profile)) {
    return fail("Only an administrator can change timing windows");
  }

  const { error } = await supabase.from("material_timing_windows").upsert(
    {
      material_id: materialId,
      earliest_offset: earliestOffset,
      latest_offset: latestOffset,
      kind: input.kind ?? "thaw",
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    },
    { onConflict: "material_id" }
  );

  if (error) {
    if (isMissingTable(error)) {
      return fail(
        "Raw-material windows need the 20260830_material_timing_windows migration."
      );
    }
    return fail(error.message);
  }

  revalidatePath(SCHEDULE_PATH);
  return { ok: true };
}

/** Removes a raw material's window, taking it off the chart. */
export async function clearMaterialWindow(input: {
  materialId: string;
}): Promise<ActionResult> {
  if (!input.materialId) return fail("Missing material");

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");
  if (!isAdminProfile(profile)) {
    return fail("Only an administrator can change timing windows");
  }

  const { error } = await supabase
    .from("material_timing_windows")
    .delete()
    .eq("material_id", input.materialId);

  if (error && !isMissingTable(error)) return fail(error.message);
  revalidatePath(SCHEDULE_PATH);
  return { ok: true };
}

/**
 * Renames a draft.
 *
 * A draft starts named for the day and the person, which is enough to tell
 * two apart but says nothing about what is in it. "Thanksgiving week" or
 * "if Costco confirms" is what makes one worth reopening a fortnight later.
 */
/**
 * Picks a saved draft back up.
 *
 * Only one draft can be worked in at a time, so whatever was open is parked
 * first - the same thing Save draft does, just done for you rather than by
 * you. Nothing is lost either way.
 */
export async function reopenDraft(input: {
  draftId: string;
}): Promise<ActionResult> {
  if (!input.draftId) return fail("Missing draft");

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const { data: draft } = await supabase
    .from("production_schedules")
    .select("id, status, created_by, parent_schedule_id")
    .eq("id", input.draftId)
    .maybeSingle();

  if (!draft) return fail("That draft no longer exists");
  if (draft.status !== "draft") return fail("That draft is already confirmed");
  if (draft.created_by !== profile.id && !isAdminProfile(profile)) {
    return fail("Only an administrator can reopen someone else's draft");
  }

  const parked = await supabase
    .from("production_schedules")
    .update({ is_working: false })
    .eq("parent_schedule_id", draft.parent_schedule_id)
    .eq("status", "draft")
    .eq("created_by", draft.created_by);

  if (parked.error) {
    return fail(
      isMissingColumn(parked.error)
        ? "Reopening needs the 20260831_draft_parking migration"
        : parked.error.message
    );
  }

  const { error } = await supabase
    .from("production_schedules")
    .update({ is_working: true, updated_at: new Date().toISOString() })
    .eq("id", input.draftId);

  if (error) return fail(error.message);
  revalidatePath(SCHEDULE_PATH);
  return { ok: true };
}

export async function renameDraft(input: {
  draftId: string;
  name: string;
  /** Park it: keep it open and listed, but take it out of the grid. */
  park?: boolean;
}): Promise<ActionResult> {
  const name = input.name?.trim();
  if (!input.draftId) return fail("Missing draft");
  if (!name) return fail("Give the draft a name");
  if (name.length > 120) return fail("That name is too long");

  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return fail("You are signed out");

  const { data: draft } = await supabase
    .from("production_schedules")
    .select("id, status, created_by")
    .eq("id", input.draftId)
    .maybeSingle();

  if (!draft) return fail("That draft no longer exists");
  if (draft.created_by !== profile.id && !isAdminProfile(profile)) {
    return fail("Only an administrator can rename someone else's draft");
  }

  const row: Record<string, unknown> = {
    name,
    updated_at: new Date().toISOString(),
  };

  // Saving a draft parks it: it keeps its changes and stays in the list, but
  // stops being the one the grid overlays, so the plan comes back clean and
  // the next round of typing opens a fresh draft.
  if (input.park) row.is_working = false;

  let { error } = await supabase
    .from("production_schedules")
    .update(row)
    .eq("id", input.draftId);

  // Parking arrived with 20260831_draft_parking. Renaming should still work
  // on a database without it, rather than failing on a column nobody asked
  // about.
  if (error && isMissingColumn(error)) {
    delete row.is_working;
    ({ error } = await supabase
      .from("production_schedules")
      .update(row)
      .eq("id", input.draftId));
    if (!error) {
      revalidatePath(SCHEDULE_PATH);
      return {
        ok: false,
        message:
          "Named, but clearing the plan needs the 20260831_draft_parking migration",
      };
    }
  }

  if (error) return fail(error.message);
  revalidatePath(SCHEDULE_PATH);
  return { ok: true };
}
