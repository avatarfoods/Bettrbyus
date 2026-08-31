"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export type GroupResult = { ok: true } | { ok: false; message: string };

const groupSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(80),
  uom: z.string().trim().min(1, "Unit is required").max(12),
  notes: z.string().trim().max(500).nullable(),
  active: z.boolean(),
});

const memberSchema = z.object({
  id: z.string().uuid().optional(),
  groupId: z.string().uuid(),
  materialId: z.string().uuid(),
  packSize: z.number().positive("Pack size must be more than zero").nullable(),
  rank: z.number().int().min(1).max(99),
  notes: z.string().trim().max(300).nullable(),
});

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can change groups" };
  }
  return { ok: true, userId: profile.id };
}

function revalidate() {
  revalidatePath("/production/settings/groups");
  revalidatePath("/purchasing");
}

export async function saveGroup(input: unknown): Promise<GroupResult> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid group" };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { id, name, uom, notes, active } = parsed.data;

  const row = {
    name,
    uom: uom.toUpperCase(),
    notes,
    active,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from("item_groups").update(row).eq("id", id)
    : await supabase
        .from("item_groups")
        .insert({ ...row, created_by: gate.userId });

  if (error) {
    // The unique index is the friendliest guard against two groups for the
    // same ingredient, but the raw message is not readable.
    return {
      ok: false,
      message: error.code === "23505" ? `A group called "${name}" already exists` : error.message,
    };
  }

  revalidate();
  return { ok: true };
}

export async function deleteGroup(id: string): Promise<GroupResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  // Members cascade; nothing else points at a group.
  const { error } = await supabase.from("item_groups").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidate();
  return { ok: true };
}

export async function saveMember(input: unknown): Promise<GroupResult> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid member" };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { id, groupId, materialId, packSize, rank, notes } = parsed.data;

  const row = {
    group_id: groupId,
    material_id: materialId,
    pack_size: packSize,
    rank,
    notes,
  };

  const { error } = id
    ? await supabase.from("item_group_members").update(row).eq("id", id)
    : await supabase.from("item_group_members").insert(row);

  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "That item is already in this group"
          : error.message,
    };
  }

  revalidate();
  return { ok: true };
}

export async function removeMember(id: string): Promise<GroupResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_group_members")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidate();
  return { ok: true };
}
