import { redirect } from "next/navigation";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * Every Production setting is admin-only. Gating in the layout means a new
 * settings page is protected the moment it exists - nobody has to remember to
 * add the check.
 */
export default async function ProductionSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  if (!isAdminProfile(profile)) redirect("/orders");

  return <>{children}</>;
}
