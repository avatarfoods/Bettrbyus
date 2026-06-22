import { NextResponse } from "next/server";
import { getCurrentUserProfile, isAdminProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inviteUserSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  const supabase = await createClient();
  const profile = await getCurrentUserProfile(supabase);

  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminProfile(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { email, fullName } = parsed.data;
  const origin = new URL(request.url).origin;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/set-password")}`;

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: fullName,
        user_type: "user",
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send invitation";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
