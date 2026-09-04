import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/login-form";
import { resolvePostLoginPath } from "@/lib/auth/redirect";

export const metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = resolvePostLoginPath(next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(redirectTo);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-gradient-to-b from-background via-background to-muted/40 px-6 py-16">
      <Image
        src="/logo.png"
        alt="Avatar Natural Foods"
        width={200}
        height={64}
        className="mb-8 h-auto w-full max-w-[180px] object-contain"
        loading="eager"
      />
      <LoginForm next={redirectTo} />
      <p className="mt-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Avatar Natural Foods. All rights reserved.
      </p>
    </div>
  );
}
