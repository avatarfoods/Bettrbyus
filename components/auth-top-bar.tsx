import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/user-menu";

export async function AuthTopBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await getCurrentUserProfile(supabase);

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-6xl items-center">
        <UserMenu
          email={user.email ?? "Signed in"}
          isAdmin={isAdminProfile(profile)}
        />
      </div>
    </div>
  );
}
