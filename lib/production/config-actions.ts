"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/supabase/missing";
import { DEPARTMENT_COLORS } from "@/lib/production/department-colors";

/**
 * Editing production lines and departments.
 *
 * Admin-only, and the RLS policies on both tables enforce that independently -
 * these checks exist to produce a readable message, not to be the boundary.
 */

export type ConfigResult = { ok: true } | { ok: false; message: string };

const lineSchema = z.object({
  id: z.string().optional(),
  key: z
    .string()
    .trim()
    .min(1, "Key is required")
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens"),
  name: z.string().trim().min(1, "Name is required").max(60),
  odooCategoryIds: z.array(z.number().int().positive()).max(50),
  sortOrder: z.number().int().min(0),
  active: z.boolean(),
  color: z
    .enum(DEPARTMENT_COLORS.map((c) => c.key) as [string, ...string[]])
    .nullable()
    .optional(),
});

const departmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(80),
  lineId: z.string().nullable(),
  sortOrder: z.number().int().min(0),
  active: z.boolean(),
  color: z
    .enum(DEPARTMENT_COLORS.map((c) => c.key) as [string, ...string[]])
    .nullable()
    .optional(),
});

async function requireAdmin(): Promise<ConfigResult> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can change this" };
  }
  return { ok: true };
}

function revalidate() {
  revalidatePath("/orders");
  revalidatePath("/production/settings");
  revalidatePath("/recipes");
}

export async function saveProductionLine(input: unknown): Promise<ConfigResult> {
  const parsed = lineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid line" };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { id, key, name, odooCategoryIds, sortOrder, active } = parsed.data;

  const row = {
    key,
    name,
    odoo_category_ids: odooCategoryIds,
    // Kept in step so a rollback to the previous deploy still finds a link.
    odoo_category_id: odooCategoryIds[0] ?? null,
    sort_order: sortOrder,
    active,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from("production_lines").update(row).eq("id", id)
    : await supabase.from("production_lines").insert(row);

  if (error) return { ok: false, message: error.message };

  revalidate();
  return { ok: true };
}

export async function deleteProductionLine(id: string): Promise<ConfigResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  // Departments point at lines with ON DELETE SET NULL, so removing a line
  // orphans its departments rather than deleting them.
  const { error } = await supabase.from("production_lines").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidate();
  return { ok: true };
}

export async function saveProductionDepartment(
  input: unknown
): Promise<ConfigResult> {
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid department",
    };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { id, name, lineId, sortOrder, active, color } = parsed.data;

  const row = {
    name,
    line_id: lineId,
    sort_order: sortOrder,
    active,
    color: color ?? null,
    updated_at: new Date().toISOString(),
  };

  async function write(payload: Record<string, unknown>) {
    return id
      ? await supabase.from("production_departments").update(payload).eq("id", id)
      : await supabase.from("production_departments").insert(payload);
  }

  let { error } = await write(row);

  // Colour arrived in the 20260831_department_colors migration. Everything
  // else about the department should still save on a database without it.
  if (error && isMissingColumn(error)) {
    const rest = { ...row };
    delete (rest as { color?: string | null }).color;
    ({ error } = await write(rest));
    if (!error) {
      revalidate();
      return { ok: true };
    }
  }

  if (error) return { ok: false, message: error.message };

  revalidate();
  return { ok: true };
}

/**
 * Creates a department row for every distinct department already used by the
 * recipes, attaching them all to one line.
 *
 * Saves typing "MAIN KITCHEN AM" and six friends by hand, and guarantees the
 * names match what the recipe data actually contains - a department typed
 * slightly differently would never match anything.
 */
export async function importDepartmentsFromRecipes(
  lineId: string
): Promise<ConfigResult & { added?: number }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();

  const { data: recipes, error: readError } = await supabase
    .from("purchasing_recipes")
    .select("department")
    .not("department", "is", null);

  if (readError) return { ok: false, message: readError.message };

  const names = [
    ...new Set(
      (recipes ?? [])
        .map((row) => (row.department as string | null)?.trim())
        .filter((name): name is string => Boolean(name))
    ),
  ].sort();

  if (names.length === 0) {
    return { ok: false, message: "No departments found on any recipe" };
  }

  const { data: existing } = await supabase
    .from("production_departments")
    .select("name");
  const known = new Set((existing ?? []).map((row) => row.name as string));

  const toAdd = names
    .filter((name) => !known.has(name))
    .map((name, index) => ({
      name,
      line_id: lineId || null,
      sort_order: known.size + index + 1,
      active: true,
    }));

  if (toAdd.length === 0) {
    return { ok: true, added: 0 };
  }

  const { error } = await supabase.from("production_departments").insert(toAdd);
  if (error) return { ok: false, message: error.message };

  revalidate();
  return { ok: true, added: toAdd.length };
}

export async function deleteProductionDepartment(
  id: string
): Promise<ConfigResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { error } = await supabase
    .from("production_departments")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidate();
  return { ok: true };
}
