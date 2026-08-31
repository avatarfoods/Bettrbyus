"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { headers } from "next/headers";
import { getSetPasswordRedirectUrl } from "@/lib/auth/app-url";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin actions on a user.
 *
 * These use the service-role client because changing someone else's email or
 * password is an auth-admin operation the anon client cannot perform. Every
 * one therefore re-checks the caller is an admin first - the service role
 * bypasses RLS, so this function is the only gate.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

const profileSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  isAdmin: z.boolean(),
});

const passwordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

async function requireAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);
  if (!profile) return { ok: false, message: "You are signed out" };
  if (!isAdminProfile(profile)) {
    return { ok: false, message: "Only an administrator can do that" };
  }
  return { ok: true, adminId: profile.id };
}

/** Name, login email and admin flag. */
export async function updateUser(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Those details are not valid",
    };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const { userId, fullName, email, isAdmin } = parsed.data;

  // An admin removing their own admin rights would lock themselves out of this
  // screen, so it is refused rather than silently applied.
  if (userId === gate.adminId && !isAdmin) {
    return { ok: false, message: "You cannot remove your own admin access" };
  }

  const admin = createAdminClient();

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email,
    user_metadata: { full_name: fullName },
  });
  if (authError) return { ok: false, message: authError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      email,
      user_type: isAdmin ? "admin" : "user",
    })
    .eq("id", userId);
  if (profileError) return { ok: false, message: profileError.message };

  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
  return { ok: true };
}

const createSchema = z
  .object({
    fullName: z.string().trim().min(1, "Name is required").max(120),
    email: z.string().trim().email("Enter a valid email address"),
    isAdmin: z.boolean(),
    mode: z.enum(["password", "invite"]),
    password: z.string().optional(),
  })
  .refine(
    (data) => data.mode !== "password" || (data.password ?? "").length >= 6,
    { message: "Password must be at least 6 characters", path: ["password"] }
  );

/** Origin of the current request, used only when NEXT_PUBLIC_APP_URL is unset. */
async function requestOrigin(): Promise<string | undefined> {
  const list = await headers();
  const host = list.get("host");
  if (!host) return undefined;
  const proto = list.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export type CreateUserResult =
  | { ok: true; userId: string; mode: "password" | "invite" }
  | { ok: false; message: string };

/**
 * Adds a user, either way round:
 *
 *  - "password": created immediately with a password you hand over. This is
 *    the path for floor staff who have no company mailbox.
 *  - "invite": Supabase emails them a link and they choose their own.
 */
export async function createUser(input: unknown): Promise<CreateUserResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Those details are not valid",
    };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const { fullName, email, isAdmin, mode, password } = parsed.data;
  const admin = createAdminClient();
  const userType = isAdmin ? "admin" : "user";

  if (mode === "invite") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: getSetPasswordRedirectUrl(await requestOrigin()),
      data: { full_name: fullName, user_type: userType },
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, userId: data.user.id, mode };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    // No confirmation email to click: the admin is handing over the password
    // in person, so the address is never proven and must not gate sign-in.
    email_confirm: true,
    user_metadata: { full_name: fullName, user_type: userType },
  });
  if (error) return { ok: false, message: error.message };

  // The profiles trigger fills in from metadata, but user_type only on insert -
  // set it explicitly so an admin created here really is one.
  await admin
    .from("profiles")
    .update({ full_name: fullName, email, user_type: userType })
    .eq("id", data.user.id);

  revalidatePath("/settings/users");
  return { ok: true, userId: data.user.id, mode };
}

/** Sets a password directly, for someone who cannot receive email. */
export async function setUserPassword(input: unknown): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "That password is not valid",
    };
  }

  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.password,
  });
  if (error) return { ok: false, message: error.message };

  return { ok: true };
}

/** Emails a reset link instead of setting the password here. */
export async function sendPasswordReset(email: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) return { ok: false, message: error.message };

  return { ok: true };
}

/**
 * Archive blocks sign-in but keeps every record the person is attached to.
 * There is no delete: inventory_checks.checked_by is NOT NULL, so removing a
 * user who has ever done a count would fail at the database anyway.
 */
export async function setUserArchived(
  userId: string,
  archived: boolean
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  if (userId === gate.adminId && archived) {
    return { ok: false, message: "You cannot archive your own account" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    // Supabase expects a duration string; "none" lifts the ban.
    ban_duration: archived ? "876000h" : "none",
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
  return { ok: true };
}
