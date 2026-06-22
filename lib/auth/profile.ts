import type { SupabaseClient } from "@supabase/supabase-js";

export type UserProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  user_type: string;
  created_at: string;
};

export async function getCurrentUserProfile(
  supabase: SupabaseClient
): Promise<UserProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, user_type, created_at")
    .eq("id", user.id)
    .single();

  return profile;
}

export function isAdminProfile(
  profile: Pick<UserProfile, "user_type"> | null | undefined
): boolean {
  return profile?.user_type === "admin";
}
