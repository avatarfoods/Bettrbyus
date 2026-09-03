import { PageShell } from "@/components/app-shell/page-shell";
import { UsersTable } from "@/components/settings/users-table";
import { fetchUsers } from "@/lib/users/fetch-users";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Users",
};

export default async function UsersPage() {
  const supabase = await createClient();
  const [users, { data: hrRows }] = await Promise.all([
    fetchUsers(),
    supabase.from("hr_user_access").select("profile_id, level"),
  ]);
  const hrLevels: [string, string][] = ((hrRows ?? []) as { profile_id: string; level: string }[]).map((row) => [
    row.profile_id,
    row.level,
  ]);

  return (
    <PageShell
      breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users" }]}
    >
      <UsersTable users={users} hrLevels={hrLevels} />
    </PageShell>
  );
}
