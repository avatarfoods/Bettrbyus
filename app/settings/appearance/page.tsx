import { AppearanceForm } from "@/components/settings/appearance-form";
import { fetchAppSettings } from "@/lib/settings/wallpaper";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Appearance",
};

export default async function AppearancePage() {
  const supabase = await createClient();
  const settings = await fetchAppSettings(supabase);

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How Bettrbyus looks. The wallpaper is shared by everyone; light and
          dark mode is your own.
        </p>
      </header>

      <AppearanceForm settings={settings} />
    </div>
  );
}
