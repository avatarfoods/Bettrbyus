import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineStatus } from "@/lib/purchasing/fetch-cycles";

export const LINE_SAVE_ERROR_MESSAGE = "Could not save the line. Please try again.";

export async function updatePurchaseLine(
  supabase: SupabaseClient,
  lineId: string,
  values: {
    status?: LineStatus;
    arrival_date?: string | null;
    arrived_at?: string | null;
    notes?: string | null;
    required_to_order?: number;
    required_time?: string | null;
    cases_required?: number;
  }
): Promise<{ success: boolean; data?: { arrived_at: string | null } }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const patch: Record<string, unknown> = {
    ...values,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  // Stamp actual arrival time when marked Arrived; clear it if moved away.
  if (values.status === "arrived" && values.arrived_at === undefined) {
    patch.arrived_at = new Date().toISOString();
  } else if (
    values.status !== undefined &&
    values.status !== "arrived" &&
    values.arrived_at === undefined
  ) {
    patch.arrived_at = null;
  }

  let { data, error } = await supabase
    .from("purchasing_lines")
    .update(patch)
    .eq("id", lineId)
    .select("arrived_at")
    .single();

  // Column may not exist until the arrived_at migration is applied.
  if (
    error &&
    typeof error.message === "string" &&
    error.message.includes("arrived_at")
  ) {
    const { arrived_at: _arrivedAt, ...withoutArrivedAt } = patch;
    const fallback = await supabase
      .from("purchasing_lines")
      .update(withoutArrivedAt)
      .eq("id", lineId)
      .select("id")
      .single();
    data = null;
    error = fallback.error;
    if (!error) {
      return {
        success: true,
        data: {
          arrived_at:
            values.status === "arrived" ? new Date().toISOString() : null,
        },
      };
    }
  }

  if (error) {
    console.error("Failed to update purchase line:", error);
    return { success: false };
  }
  return {
    success: true,
    data: { arrived_at: (data?.arrived_at as string | null) ?? null },
  };
}

export async function addEmergencyLine(
  supabase: SupabaseClient,
  input: {
    cycleId: string;
    materialId: string;
    casesRequired: number;
    requiredTime: string | null;
    notes: string | null;
  }
): Promise<{ success: boolean; errorMessage?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("purchasing_lines").insert({
    cycle_id: input.cycleId,
    material_id: input.materialId,
    cases_required: input.casesRequired,
    required_to_order: input.casesRequired,
    status: "to_order",
    is_emergency: true,
    required_time: input.requiredTime,
    notes: input.notes,
    updated_by: user?.id ?? null,
  });

  if (error) {
    console.error("Failed to add emergency line:", error);
    const message = error.code === "23505"
      ? "This material is already in the cycle. Edit the existing line instead."
      : LINE_SAVE_ERROR_MESSAGE;
    return { success: false, errorMessage: message };
  }
  return { success: true };
}

export async function updateCycleStatus(
  supabase: SupabaseClient,
  cycleId: string,
  status: "in_progress" | "done" | "cancelled"
): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from("purchasing_cycles")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", cycleId);

  if (error) {
    console.error("Failed to update cycle status:", error);
    return { success: false };
  }
  return { success: true };
}

export async function deleteCycle(
  supabase: SupabaseClient,
  cycleId: string
): Promise<{ success: boolean; errorMessage?: string }> {
  const { error } = await supabase
    .from("purchasing_cycles")
    .delete()
    .eq("id", cycleId);

  if (error) {
    console.error("Failed to delete purchase cycle:", error);
    return {
      success: false,
      errorMessage:
        error.code === "42501"
          ? "Delete is not allowed yet. Run the purchasing_cycles delete policy migration in Supabase."
          : error.message,
    };
  }
  return { success: true };
}

export async function deleteMasterImport(
  supabase: SupabaseClient,
  importId: string
): Promise<{ success: boolean; errorMessage?: string }> {
  // Cycles may still point at this import; clear the FK so weeks/buy lists stay.
  const unlink = await supabase
    .from("purchasing_cycles")
    .update({ import_id: null })
    .eq("import_id", importId);

  if (unlink.error) {
    console.error("Failed to unlink cycles from import:", unlink.error);
    return {
      success: false,
      errorMessage: unlink.error.message,
    };
  }

  const { error } = await supabase
    .from("purchasing_master_imports")
    .delete()
    .eq("id", importId);

  if (error) {
    console.error("Failed to delete master import:", error);
    return {
      success: false,
      errorMessage:
        error.code === "42501"
          ? "Delete is not allowed. Check purchasing_master_imports delete policy in Supabase."
          : error.message,
    };
  }
  return { success: true };
}

export async function saveMaterialAlias(
  supabase: SupabaseClient,
  alias: string,
  materialId: string
): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from("purchasing_material_aliases")
    .upsert({ alias, material_id: materialId }, { onConflict: "alias" });

  if (error) {
    console.error("Failed to save material alias:", error);
    return { success: false };
  }
  return { success: true };
}
