import { AppLauncher } from "@/components/launcher/app-launcher";
import { visibleApps } from "@/lib/apps";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { fetchAppSettings } from "@/lib/settings/wallpaper";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Apps",
};

export default async function Home() {
  const supabase = await createClient();

  const [profile, settings] = await Promise.all([
    getCurrentUserProfile(supabase),
    fetchAppSettings(supabase),
  ]);

  return (
    <AppLauncher
      apps={visibleApps(isAdminProfile(profile))}
      settings={settings}
    />
  );
}
