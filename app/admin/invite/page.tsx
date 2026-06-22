import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { POST_LOGIN_PATH } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { InviteUserForm } from "@/components/invite-user-form";

export const metadata = {
  title: "Invite user | Protein Thaw Manager",
};

export default async function AdminInvitePage() {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  if (!profile) {
    redirect("/login?next=/admin/invite");
  }

  if (!isAdminProfile(profile)) {
    redirect(POST_LOGIN_PATH);
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        <div className="flex items-center gap-3">
          <Link
            href={POST_LOGIN_PATH}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground transition-colors hover:bg-muted"
            aria-label="Back to app"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Admin</h1>
            <p className="text-sm text-muted-foreground">
              Invite team members to create their account.
            </p>
          </div>
        </div>

        <InviteUserForm />
      </div>
    </div>
  );
}
