import { PageShell } from "@/components/app-shell/page-shell";
import { UsersTable } from "@/components/settings/users-table";
import { fetchUsers } from "@/lib/users/fetch-users";

export const metadata = {
  title: "Users",
};

export default async function UsersPage() {
  const users = await fetchUsers();

  return (
    <PageShell
      breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users" }]}
    >
      <UsersTable users={users} />
    </PageShell>
  );
}
