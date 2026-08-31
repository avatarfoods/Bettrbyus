import { PageShell } from "@/components/app-shell/page-shell";
import { NewUserForm } from "@/components/settings/new-user-form";
import { suggestPassword } from "@/lib/users/password";

export const metadata = {
  title: "New user",
};

// Rendered fresh per request so each visit suggests a different password.
export const dynamic = "force-dynamic";

export default function NewUserPage() {
  return (
    <PageShell
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: "Users", href: "/settings/users" },
        { label: "New user" },
      ]}
    >
      <NewUserForm initialPassword={suggestPassword()} />
    </PageShell>
  );
}
