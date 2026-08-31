import { notFound } from "next/navigation";
import { PageShell } from "@/components/app-shell/page-shell";
import { RecordPager } from "@/components/app-shell/record-pager";
import { UserForm } from "@/components/settings/user-form";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { fetchUsers } from "@/lib/users/fetch-users";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const users = await fetchUsers();
  const user = users.find((entry) => entry.id === id);
  return { title: user?.fullName ?? user?.email ?? "User" };
}

export default async function UserPage({ params }: Params) {
  const { id } = await params;

  const supabase = await createClient();
  const [users, me] = await Promise.all([
    fetchUsers(),
    getCurrentUserProfile(supabase),
  ]);

  const index = users.findIndex((entry) => entry.id === id);
  const user = index === -1 ? null : users[index];
  if (!user) notFound();

  const previous = index > 0 ? users[index - 1] : null;
  const next = index < users.length - 1 ? users[index + 1] : null;

  return (
    <PageShell
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: "Users", href: "/settings/users" },
        { label: user.fullName ?? user.email },
      ]}
      contentClassName="pb-10"
      meta={
        <RecordPager
          index={index}
          total={users.length}
          prevHref={previous ? `/settings/users/${previous.id}` : null}
          nextHref={next ? `/settings/users/${next.id}` : null}
          label="user"
        />
      }
    >
      <UserForm user={user} isSelf={me?.id === user.id} />
    </PageShell>
  );
}
