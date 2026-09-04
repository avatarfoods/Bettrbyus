import { PageShell } from "@/components/app-shell/page-shell";
import { AppearanceForm } from "@/components/settings/appearance-form";
import { LogoForm } from "@/components/settings/logo-form";
import { fetchAppSettings } from "@/lib/settings/wallpaper";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Appearance",
};

export default async function AppearancePage() {
  const supabase = await createClient();
  const settings = await fetchAppSettings(supabase);

  return (
    <PageShell breadcrumbs={[{ label: "Settings" }, { label: "Appearance" }]}>
      <div className="w-full px-3 py-3 sm:px-4">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          How Bettrbyus looks. The wallpaper is shared by everyone; light and
          dark mode is your own.
        </p>

        <div className="mt-3 flex flex-col gap-6">
          <LogoForm logoUrl={settings.logoUrl} />
          <AppearanceForm settings={settings} />
        </div>
      </div>
    </PageShell>
  );
}
