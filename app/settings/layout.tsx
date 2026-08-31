import { redirect } from "next/navigation";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * Settings is admin-only. The launcher already hides the tile for non-admins,
 * but that is presentation - this is the gate, so a typed URL cannot get in.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  if (!isAdminProfile(profile)) redirect("/");

  return <div className="flex flex-1 flex-col">{children}</div>;
}
