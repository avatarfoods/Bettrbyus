import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * User list for Settings > Users.
 *
 * Name and role live in public.profiles, but "latest authentication" and
 * whether an invite was ever accepted live in auth.users, which only the
 * service-role client can read. So this joins the two.
 *
 * Callers must check admin themselves - the settings layout does that gate.
 */

export type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  userType: string;
  isAdmin: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  /** Invited but never signed in - Odoo calls this "Never Connected". */
  neverConnected: boolean;
  /** Sign-in blocked. Kept instead of delete so their records survive. */
  archived: boolean;
};

const PAGE_SIZE = 200;

export async function fetchUsers(): Promise<UserRow[]> {
  const admin = createAdminClient();
  const supabase = await createClient();

  // Profiles are readable by any authenticated user, so the anon client is
  // enough here and keeps the service-role surface as small as possible.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, user_type, created_at");

  const byId = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile])
  );

  const rows: UserRow[] = [];

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });

    if (error) throw new Error(error.message);

    for (const user of data.users) {
      const profile = byId.get(user.id);
      const userType = (profile?.user_type as string | undefined) ?? "user";

      rows.push({
        id: user.id,
        email: user.email ?? profile?.email ?? "—",
        fullName: (profile?.full_name as string | null) ?? null,
        userType,
        isAdmin: userType === "admin",
        lastSignInAt: user.last_sign_in_at ?? null,
        archived: Boolean(
          (user as { banned_until?: string | null }).banned_until &&
            new Date((user as { banned_until: string }).banned_until) > new Date()
        ),
        createdAt: user.created_at,
        neverConnected: !user.last_sign_in_at,
      });
    }

    if (data.users.length < PAGE_SIZE) break;
  }

  rows.sort((a, b) =>
    (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email, undefined, {
      sensitivity: "base",
    })
  );

  return rows;
}

/** One user, for the detail screen. */
export async function fetchUser(id: string): Promise<UserRow | null> {
  const users = await fetchUsers();
  return users.find((user) => user.id === id) ?? null;
}
