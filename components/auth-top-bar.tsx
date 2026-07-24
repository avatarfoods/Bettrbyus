import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { AuthTopBarClient } from "@/components/auth-top-bar-client";

export async function AuthTopBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await getCurrentUserProfile(supabase);

  return (
    <AuthTopBarClient
      email={user.email ?? "Signed in"}
      isAdmin={isAdminProfile(profile)}
    />
  );
}
