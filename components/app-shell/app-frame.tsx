import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { AppFrameClient } from "@/components/app-shell/app-frame-client";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

/**
 * Wraps every page. Signed-out pages (login, set password) get no chrome at
 * all, so they render bare.
 */
export async function AppFrame({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <ConfirmProvider>{children}</ConfirmProvider>;
  }

  const profile = await getCurrentUserProfile(supabase);

  return (
    <ConfirmProvider>
      <AppFrameClient
        email={user.email ?? "Signed in"}
        isAdmin={isAdminProfile(profile)}
      >
        {children}
      </AppFrameClient>
    </ConfirmProvider>
  );
}
