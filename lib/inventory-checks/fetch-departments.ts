import type { SupabaseClient } from "@supabase/supabase-js";
import type { DepartmentSummary } from "@/lib/inventory-checks/types";

export async function fetchDepartments(
  supabase: SupabaseClient
): Promise<{ data: DepartmentSummary[]; error: string | null }> {
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to fetch departments:", error);
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as DepartmentSummary[], error: null };
}
